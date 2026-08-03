import { useState } from "react";
import "./App.css";

type Server = {
  id: string;
  name: string;
  ip: string;
  status: "online" | "warning" | "offline";
  cpu: number;
  ram: number;
};

const placeholderServers: Server[] = [
  { id: "1", name: "Hetzner-VPS-01", ip: "88.198.23.45", status: "online", cpu: 23, ram: 45 },
  { id: "2", name: "Root-Server-02", ip: "134.122.10.8", status: "warning", cpu: 12, ram: 32 },
  { id: "3", name: "Gaming-Node-03", ip: "65.109.23.17", status: "online", cpu: 67, ram: 71 },
  { id: "4", name: "Backup-Server", ip: "192.168.1.50", status: "offline", cpu: 3, ram: 18 },
];

function App() {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(placeholderServers[0].id);
  const [activeNav, setActiveNav] = useState<"servers" | "store" | "settings">("servers");

  const selectedServer = placeholderServers.find((s) => s.id === selectedServerId) ?? null;

  return (
    <div className="nx-shell">
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

          <div className="nx-system-status">
            <div style={{ marginBottom: 6, color: "var(--nx-text)" }}>System Status</div>
            <div>CPU: 12%</div>
            <div>RAM: 2.1 GB / 16 GB</div>
          </div>

          <div className="nx-version">v0.1.0</div>
        </div>
      </aside>

      <section className="nx-server-list">
        <h2>Deine Server</h2>
        <input className="nx-search" placeholder="Suchen..." />

        {placeholderServers.map((server) => (
          <div
            key={server.id}
            className={`nx-server-card ${server.id === selectedServerId ? "selected" : ""}`}
            onClick={() => setSelectedServerId(server.id)}
          >
            <div className="nx-server-card-title">
              <span>{server.name}</span>
              <span
                className="nx-status-dot"
                style={{
                  background:
                    server.status === "online"
                      ? "var(--nx-accent)"
                      : server.status === "warning"
                      ? "var(--nx-warning)"
                      : "var(--nx-text-muted)",
                }}
              />
            </div>
            <div className="nx-server-ip">{server.ip}</div>
            <div style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>
              CPU {server.cpu}% · RAM {server.ram}%
            </div>
          </div>
        ))}
      </section>

      <main className="nx-main">
        {selectedServer ? (
          <div>
            <h1 style={{ margin: 0 }}>{selectedServer.name}</h1>
            <p style={{ color: "var(--nx-text-muted)" }}>
              {selectedServer.ip} · Details & Gameserver-Verwaltung folgen
            </p>
          </div>
        ) : (
          <div className="nx-empty-state">
            <div>Kein Server ausgewählt</div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
