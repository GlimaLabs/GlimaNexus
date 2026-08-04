import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { InstanceRecord } from "./types";

type LogEvent = { event: "line"; text: string } | { event: "closed" };

type Props = {
  serverId: string;
  instance: InstanceRecord;
  cpuHistory: number[];
  ramHistory: number[];
  onClose: () => void;
};

export default function InstanceDetail({ serverId, instance, cpuHistory, ramHistory, onClose }: Props) {
  const [tab, setTab] = useState<"status" | "console">("status");
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (tab !== "console" || startedRef.current) return;
    startedRef.current = true;

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
    }).catch((err) => setLines((prev) => [...prev, `[Fehler] ${String(err)}`]));
  }, [tab, serverId, instance.systemd_unit]);

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
      </div>

      <div className="nx-tabs">
        <button className={`nx-tab ${tab === "status" ? "active" : ""}`} onClick={() => setTab("status")}>
          Status & Ressourcen
        </button>
        <button className={`nx-tab ${tab === "console" ? "active" : ""}`} onClick={() => setTab("console")}>
          Live-Konsole
        </button>
      </div>

      {tab === "status" && (
        <div className="nx-status-grid">
          <div className="nx-chart-card">
            <div className="nx-chart-title">CPU Auslastung</div>
            <Sparkline values={cpuHistory} max={Math.max(100, instance.cpu_limit_percent)} />
          </div>
          <div className="nx-chart-card">
            <div className="nx-chart-title">RAM Auslastung</div>
            <Sparkline values={ramHistory} max={instance.ram_limit_mb} />
          </div>
          <div className="nx-fact-card">
            <div>Install-Pfad: {instance.install_path}</div>
            <div>Systemd-Unit: {instance.systemd_unit}</div>
            <div>CPU Limit: {instance.cpu_limit_percent}%</div>
            <div>RAM Limit: {instance.ram_limit_mb} MB</div>
          </div>
        </div>
      )}

      {tab === "console" && (
        <div>
          <div className="nx-console" ref={consoleRef}>
            {lines.length === 0 && <div style={{ color: "var(--nx-text-muted)" }}>Warte auf Log-Ausgabe…</div>}
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <label style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> Automatisch
            scrollen
          </label>
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
