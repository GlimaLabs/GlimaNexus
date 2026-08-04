import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { InstanceRecord, InstanceStatus } from "./types";

type LogEvent = { event: "line"; text: string } | { event: "closed" };

type Props = {
  serverId: string;
  instance: InstanceRecord;
  status?: InstanceStatus;
  busy: boolean;
  cpuHistory: number[];
  ramHistory: number[];
  diskUsedGb?: number;
  diskTotalGb?: number;
  onAction: (action: "start" | "stop" | "restart") => void;
  onClose: () => void;
};

export default function InstanceDetail({
  serverId,
  instance,
  status,
  busy,
  cpuHistory,
  ramHistory,
  diskUsedGb,
  diskTotalGb,
  onAction,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"status" | "config" | "console">("status");
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [logAttempt, setLogAttempt] = useState(0);
  const [logError, setLogError] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const startedForAttempt = useRef(-1);

  const isActive = status?.state === "active";
  const isFailed = status?.state === "failed";
  const statusColor = isActive ? "var(--nx-success)" : isFailed ? "var(--nx-danger)" : "var(--nx-text-muted)";
  const statusLabel = isActive ? "Online" : isFailed ? "Fehler" : status ? "Gestoppt" : "Unbekannt";

  useEffect(() => {
    if (tab !== "console" || startedForAttempt.current === logAttempt) return;
    startedForAttempt.current = logAttempt;
    setLogError(false);

    const channel = new Channel<LogEvent>();
    channel.onmessage = (event) => {
      if (event.event === "line") {
        setLines((prev) => [...prev.slice(-499), event.text]);
      }
    };

    invoke("stream_instance_logs", {
      serverId,
      unitName: instance.systemd_unit,
      onEvent: channel,
    }).catch((err) => {
      setLines((prev) => [...prev, `[Fehler] ${String(err)}`]);
      setLogError(true);
    });
  }, [tab, logAttempt, serverId, instance.systemd_unit]);

  function retryLogs() {
    setLines([]);
    setLogAttempt((n) => n + 1);
  }

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className="nx-instance-detail">
      <div className="nx-instance-detail-header">
        <button className="nx-back-btn" onClick={onClose}>
          ← Zurück
        </button>
        <h2 style={{ margin: 0 }}>{instance.display_name}</h2>
        <span style={{ fontSize: 12, color: statusColor }}>
          <span className="nx-status-dot" style={{ background: statusColor }} /> {statusLabel}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {isActive ? (
            <button className="nx-btn-stop" disabled={busy} onClick={() => onAction("stop")}>
              ⏸ Stoppen
            </button>
          ) : (
            <button className="nx-btn-start" disabled={busy} onClick={() => onAction("start")}>
              ▶ Starten
            </button>
          )}
          <button className="nx-btn-restart" disabled={busy} onClick={() => onAction("restart")}>
            ⟳ Neustarten
          </button>
        </div>
      </div>

      <div className="nx-tabs">
        <button className={`nx-tab ${tab === "status" ? "active" : ""}`} onClick={() => setTab("status")}>
          Status & Ressourcen
        </button>
        <button className={`nx-tab ${tab === "config" ? "active" : ""}`} onClick={() => setTab("config")}>
          Konfiguration
        </button>
        <button className={`nx-tab ${tab === "console" ? "active" : ""}`} onClick={() => setTab("console")}>
          Live-Konsole
        </button>
      </div>

      {tab === "status" && (
        <>
          <div className="nx-status-grid">
            <div className="nx-chart-card">
              <div className="nx-chart-title">CPU Auslastung</div>
              <div className="nx-chart-value">{(cpuHistory[cpuHistory.length - 1] ?? 0).toFixed(0)}%</div>
              <Sparkline values={cpuHistory} max={Math.max(100, instance.cpu_limit_percent)} />
            </div>
            <div className="nx-chart-card">
              <div className="nx-chart-title">RAM Auslastung</div>
              <div className="nx-chart-value">
                {((ramHistory[ramHistory.length - 1] ?? 0) / 1024).toFixed(1)} GB
                <span className="nx-chart-value-max"> / {(instance.ram_limit_mb / 1024).toFixed(0)} GB</span>
              </div>
              <Sparkline values={ramHistory} max={instance.ram_limit_mb} />
            </div>
            <div className="nx-fact-card">
              <div className="nx-fact-row">
                <span>Install-Pfad</span>
                <span title={instance.install_path}>…{instance.install_path.slice(-24)}</span>
              </div>
              <div className="nx-fact-row">
                <span>Systemd-Unit</span>
                <span title={instance.systemd_unit}>…{instance.systemd_unit.slice(-18)}</span>
              </div>
              <div className="nx-fact-row">
                <span>CPU Limit</span>
                <span>{instance.cpu_limit_percent}%</span>
              </div>
              <div className="nx-fact-row">
                <span>RAM Limit</span>
                <span>{instance.ram_limit_mb} MB</span>
              </div>
            </div>
          </div>

          {diskTotalGb !== undefined && diskTotalGb > 0 && (
            <div className="nx-disk-card">
              <span>💾 Speicherplatz (Server)</span>
              <div className="nx-disk-bar">
                <div className="nx-disk-bar-fill" style={{ width: `${Math.min(100, ((diskUsedGb ?? 0) / diskTotalGb) * 100)}%` }} />
              </div>
              <span>
                {diskUsedGb} GB / {diskTotalGb} GB
              </span>
            </div>
          )}
        </>
      )}

      {tab === "config" && (
        <p style={{ color: "var(--nx-text-muted)" }}>
          Konfigurationseditor folgt (Server-Properties/Config-Dateien direkt bearbeiten).
        </p>
      )}

      {tab === "console" && (
        <div>
          <div className="nx-console" ref={consoleRef}>
            {lines.length === 0 && <div style={{ color: "var(--nx-text-muted)" }}>Warte auf Log-Ausgabe…</div>}
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>
              <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> Automatisch
              scrollen
            </label>
            {logError && (
              <button onClick={retryLogs} style={{ fontSize: 12 }}>
                ⟳ Erneut verbinden
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values, max }: { values: number[]; max: number }) {
  const width = 240;
  const height = 60;
  if (values.length === 0) {
    return <div style={{ color: "var(--nx-text-muted)", fontSize: 12 }}>Noch keine Daten</div>;
  }
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - (Math.min(v, max) / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke="var(--nx-accent)" strokeWidth="2" />
    </svg>
  );
}
