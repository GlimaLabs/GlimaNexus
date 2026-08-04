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
  subtitle?: string;
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
  subtitle,
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

  function formatStartedAt(raw: string | null | undefined): string {
    if (!raw) return "–";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function formatUptimeShort(seconds: number): string {
    if (seconds <= 0) return "–";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (days > 0) return `${days}T ${hours}h ${minutes}m ${secs}s`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  }

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
        <h2 style={{ margin: 0 }}>
          {instance.display_name}
          {subtitle && <span style={{ fontWeight: 400, color: "var(--nx-text-muted)" }}> ({subtitle})</span>}
        </h2>
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
              <div className="nx-chart-card-head">
                <div className="nx-chart-title">CPU Auslastung</div>
                <select className="nx-range-select" disabled defaultValue="1h">
                  <option value="1h">1 Stunde</option>
                </select>
              </div>
              <div className="nx-chart-value">{(cpuHistory[cpuHistory.length - 1] ?? 0).toFixed(0)}%</div>
              <Sparkline values={cpuHistory} max={Math.max(100, instance.cpu_limit_percent)} />
            </div>
            <div className="nx-chart-card">
              <div className="nx-chart-card-head">
                <div className="nx-chart-title">RAM Auslastung</div>
                <select className="nx-range-select" disabled defaultValue="1h">
                  <option value="1h">1 Stunde</option>
                </select>
              </div>
              <div className="nx-chart-value">
                {((ramHistory[ramHistory.length - 1] ?? 0) / 1024).toFixed(1)} GB
                <span className="nx-chart-value-max"> / {(instance.ram_limit_mb / 1024).toFixed(0)} GB</span>
              </div>
              <Sparkline values={ramHistory} max={instance.ram_limit_mb} />
            </div>
            <div className="nx-fact-card">
              <div className="nx-fact-row">
                <span>Prozess ID</span>
                <span>{status?.pid ?? "–"}</span>
              </div>
              <div className="nx-fact-row" title="Nur für Minecraft verfügbar (später)">
                <span>Spieler Online</span>
                <span>–</span>
              </div>
              <div className="nx-fact-row" title="Nur für Minecraft verfügbar (später)">
                <span>Welt</span>
                <span>–</span>
              </div>
              <div className="nx-fact-row">
                <span>Startzeit</span>
                <span>{formatStartedAt(status?.started_at)}</span>
              </div>
              <div className="nx-fact-row">
                <span>Laufzeit</span>
                <span>{formatUptimeShort(status?.uptime_seconds ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className="nx-resource-bar">
            <div className="nx-resource-bar-item">
              <span className="nx-resource-bar-icon">⚙️</span>
              <div>
                <div className="nx-resource-bar-label">CPU Limit</div>
                <div className="nx-resource-bar-value">{instance.cpu_limit_percent}%</div>
              </div>
            </div>
            <div className="nx-resource-bar-item">
              <span className="nx-resource-bar-icon">🧠</span>
              <div>
                <div className="nx-resource-bar-label">RAM Limit</div>
                <div className="nx-resource-bar-value">{instance.ram_limit_mb} MB</div>
              </div>
            </div>
            {diskTotalGb !== undefined && diskTotalGb > 0 && (
              <div className="nx-resource-bar-item nx-resource-bar-disk">
                <span className="nx-resource-bar-icon">💾</span>
                <div style={{ flex: 1 }}>
                  <div className="nx-resource-bar-label">Speicherplatz</div>
                  <div className="nx-resource-bar-value">
                    {diskUsedGb} GB / {diskTotalGb} GB
                  </div>
                  <div className="nx-disk-bar">
                    <div
                      className="nx-disk-bar-fill"
                      style={{ width: `${Math.min(100, ((diskUsedGb ?? 0) / diskTotalGb) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
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
  const height = 90;
  const gradientId = "nx-spark-fill";
  if (values.length === 0) {
    return <div style={{ color: "var(--nx-text-muted)", fontSize: 12 }}>Noch keine Daten</div>;
  }
  const coords = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - (Math.min(v, max) / max) * height;
    return [x, y];
  });
  const linePoints = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--nx-accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--nx-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline points={linePoints} fill="none" stroke="var(--nx-accent)" strokeWidth="2" />
    </svg>
  );
}
