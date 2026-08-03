import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import UpdateBanner from "./UpdateBanner";
import AddServerDialog from "./AddServerDialog";
import type { ServerRecord } from "./types";

type HardwareStats = {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
};

function App() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<"servers" | "store" | "settings">("servers");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, HardwareStats>>({});

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    setLoading(true);
    try {
      const list = await invoke<ServerRecord[]>("list_servers");
      setServers(list);
      if (list.length > 0 && !selectedServerId) {
        setSelectedServerId(list[0].id);
      }
    } catch {
      // Backend command not reachable (e.g. dev preview outside Tauri) - keep empty list.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      servers.forEach((server) => {
        invoke<HardwareStats>("get_hardware_stats", {
          serverId: server.id,
          host: server.host,
          port: server.port,
          username: server.username,
        })
          .then((result) => setStats((prev) => ({ ...prev, [server.id]: result })))
          .catch(() => {});
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [servers]);

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;
  const selectedStats = selectedServerId ? stats[selectedServerId] : undefined;

  return (
    <div className="nx-shell">
      <UpdateBanner />
      <aside className="nx-sidebar">
        <div className="nx-brand">
          <span className="nx-brand-icon">◆</span>
          NovaNexus
        </div>

        <nav className="nx-nav">
          <button
            className={`nx-nav-item ${activeNav === "servers" ? "active" : ""}`}
            onClick={() => setActiveNav("servers")}
          >
            Server-Liste
          </button>
          <button
            className={`nx-nav-item ${activeNav === "store" ? "active" : ""}`}
            onClick={() => setActiveNav("store")}
          >
            App-Store
          </button>
          <button
            className={`nx-nav-item ${activeNav === "settings" ? "active" : ""}`}
            onClick={() => setActiveNav("settings")}
          >
            Einstellungen
          </button>
        </nav>

        <div className="nx-sidebar-footer">
          <div className="nx-user">
            <div className="nx-avatar" />
            <div>
              <div>NovaUser</div>
              <div style={{ color: "var(--nx-text-muted)", fontSize: 12 }}>
                <span className="nx-status-dot" />
                Online
              </div>
            </div>
          </div>

          <div className="nx-version">v0.1.0</div>
        </div>
      </aside>

      <section className="nx-server-list">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Deine Server</h2>
          <button className="nx-update-btn" onClick={() => setShowAddDialog(true)}>
            +
          </button>
        </div>
        <input className="nx-search" placeholder="Suchen..." />

        {loading && <div style={{ color: "var(--nx-text-muted)" }}>Lade Server…</div>}
        {!loading && servers.length === 0 && (
          <div style={{ color: "var(--nx-text-muted)", fontSize: 13 }}>
            Noch keine Server verbunden. Füge deinen ersten Server über "+" hinzu.
          </div>
        )}

        {servers.map((server) => {
          const s = stats[server.id];
          return (
            <div
              key={server.id}
              className={`nx-server-card ${server.id === selectedServerId ? "selected" : ""}`}
              onClick={() => setSelectedServerId(server.id)}
            >
              <div className="nx-server-card-title">
                <span>{server.name}</span>
                <span className="nx-status-dot" style={{ background: s ? "var(--nx-accent)" : "var(--nx-text-muted)" }} />
              </div>
              <div className="nx-server-ip">{server.host}</div>
              <div style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>
                {s ? `CPU ${s.cpu_percent.toFixed(0)}% · RAM ${s.ram_used_mb}/${s.ram_total_mb} MB` : "Keine Live-Daten"}
              </div>
            </div>
          );
        })}
      </section>

      <main className="nx-main">
        {selectedServer ? (
          <div>
            <h1 style={{ margin: 0 }}>{selectedServer.name}</h1>
            <p style={{ color: "var(--nx-text-muted)" }}>
              {selectedServer.host}:{selectedServer.port} · {selectedServer.username}
            </p>
            {selectedStats && (
              <p style={{ color: "var(--nx-text-muted)" }}>
                CPU {selectedStats.cpu_percent.toFixed(1)}% · RAM {selectedStats.ram_used_mb} / {selectedStats.ram_total_mb} MB
              </p>
            )}
            <p style={{ color: "var(--nx-text-muted)" }}>Gameserver-Verwaltung folgt (App-Store, Instanz-Details).</p>
          </div>
        ) : (
          <div className="nx-empty-state">
            <div>Kein Server ausgewählt</div>
          </div>
        )}
      </main>

      {showAddDialog && (
        <AddServerDialog
          onClose={() => setShowAddDialog(false)}
          onCreated={(server) => {
            setServers((prev) => [...prev, server]);
            setSelectedServerId(server.id);
            setShowAddDialog(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
