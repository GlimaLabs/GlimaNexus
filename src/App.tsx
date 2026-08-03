import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";
import UpdateBanner from "./UpdateBanner";
import TitleBar from "./TitleBar";
import AddServerDialog from "./AddServerDialog";
import GameStoreDialog from "./GameStoreDialog";
import InstanceDetail from "./InstanceDetail";
import novaNexusLogo from "./assets/novanexus_logo2.png";
import type { InstanceRecord, InstanceStatus, ServerRecord } from "./types";

type HardwareStats = {
  cpu_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
};

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "–";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}T ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function App() {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, HardwareStats>>({});
  const [instances, setInstances] = useState<InstanceRecord[]>([]);
  const [instanceBusy, setInstanceBusy] = useState<string | null>(null);
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
  const [cpuHistory, setCpuHistory] = useState<Record<string, number[]>>({});
  const [ramHistory, setRamHistory] = useState<Record<string, number[]>>({});
  const [appVersion, setAppVersion] = useState("");
  const [instanceStatus, setInstanceStatus] = useState<Record<string, InstanceStatus>>({});
  const [instanceError, setInstanceError] = useState("");
  const [serverBusy, setServerBusy] = useState(false);

  useEffect(() => {
    loadServers();
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedServerId) loadInstances(selectedServerId);
    else setInstances([]);
  }, [selectedServerId]);

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

  async function loadInstances(serverId: string) {
    try {
      const list = await invoke<InstanceRecord[]>("list_instances", { serverId });
      setInstances(list);
    } catch {
      setInstances([]);
    }
  }

  async function pollHardwareStats() {
    servers.forEach((server) => {
      invoke<HardwareStats>("get_hardware_stats", { serverId: server.id })
        .then((result) => {
          setStats((prev) => ({ ...prev, [server.id]: result }));
          setCpuHistory((prev) => ({ ...prev, [server.id]: [...(prev[server.id] ?? []).slice(-29), result.cpu_percent] }));
          setRamHistory((prev) => ({ ...prev, [server.id]: [...(prev[server.id] ?? []).slice(-29), result.ram_used_mb] }));
        })
        .catch(() => {});
    });
  }

  useEffect(() => {
    const interval = setInterval(pollHardwareStats, 8000);
    return () => clearInterval(interval);
  }, [servers]);

  useEffect(() => {
    if (!selectedServerId || instances.length === 0) return;
    const poll = () => {
      instances.forEach((instance) => {
        invoke<InstanceStatus>("get_instance_status", { serverId: selectedServerId, unitName: instance.systemd_unit })
          .then((status) => setInstanceStatus((prev) => ({ ...prev, [instance.id]: status })))
          .catch(() => {});
      });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [selectedServerId, instances]);

  async function runInstanceAction(instance: InstanceRecord, action: "start" | "stop" | "restart") {
    if (!selectedServerId) return;
    setInstanceBusy(instance.id);
    setInstanceError("");
    try {
      await invoke("control_instance", {
        serverId: selectedServerId,
        unitName: instance.systemd_unit,
        action,
      });
      const status = await invoke<InstanceStatus>("get_instance_status", {
        serverId: selectedServerId,
        unitName: instance.systemd_unit,
      });
      setInstanceStatus((prev) => ({ ...prev, [instance.id]: status }));
    } catch (err) {
      setInstanceError(`${instance.display_name}: ${String(err)}`);
    } finally {
      setInstanceBusy(null);
    }
  }

  async function handleReload() {
    if (!selectedServerId) return;
    setServerBusy(true);
    try {
      await pollHardwareStats();
      await loadInstances(selectedServerId);
    } finally {
      setServerBusy(false);
    }
  }

  async function handleRebootServer() {
    if (!selectedServer) return;
    if (!confirm(`"${selectedServer.name}" wirklich neu starten? Alle laufenden Gameserver werden dabei kurz unterbrochen.`)) return;
    setServerBusy(true);
    try {
      await invoke("reboot_server", { serverId: selectedServer.id });
    } catch (err) {
      setInstanceError(String(err));
    } finally {
      setServerBusy(false);
    }
  }

  async function handleDisconnectServer() {
    if (!selectedServer) return;
    if (!confirm(`"${selectedServer.name}" wirklich trennen und aus NovaNexus entfernen?`)) return;
    setServerBusy(true);
    try {
      await invoke("delete_server", { id: selectedServer.id });
      setServers((prev) => prev.filter((s) => s.id !== selectedServer.id));
      setSelectedServerId(null);
    } catch (err) {
      setInstanceError(String(err));
    } finally {
      setServerBusy(false);
    }
  }

  const selectedServer = servers.find((s) => s.id === selectedServerId) ?? null;
  const selectedStats = selectedServerId ? stats[selectedServerId] : undefined;
  const isConnected = !!selectedStats;

  return (
    <div className="nx-shell">
      <TitleBar />
      <UpdateBanner />
      <aside className="nx-sidebar">
        <div className="nx-brand">
          <img src={novaNexusLogo} alt="NovaNexus" className="nx-brand-logo" />
        </div>

        <nav className="nx-nav">
          <button className="nx-nav-item active">Server-Liste</button>
          <button
            className="nx-nav-item"
            onClick={() => selectedServerId && setShowStoreDialog(true)}
            disabled={!selectedServerId}
          >
            App-Store
          </button>
          <button className="nx-nav-item">Einstellungen</button>
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

          <div className="nx-version">{appVersion ? `v${appVersion}` : ""}</div>
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
            <div className="nx-server-header">
              <div className="nx-server-header-icon">🐧</div>
              <div className="nx-server-header-info">
                <h1>{selectedServer.name}</h1>
                <p>
                  {selectedServer.host}:{selectedServer.port}
                  {selectedServer.os_info ? ` · ${selectedServer.os_info}` : ""}
                </p>
              </div>
              <span className={`nx-conn-pill ${isConnected ? "connected" : ""}`}>
                <span className="nx-status-dot" /> {isConnected ? "SSH Verbunden" : "Nicht verbunden"}
              </span>
              <div className="nx-server-header-actions">
                <button disabled={serverBusy} onClick={handleReload}>
                  ⟳ Neu laden
                </button>
                <button disabled={serverBusy} onClick={handleRebootServer}>
                  ⏻ Neustarten
                </button>
                <button className="nx-btn-danger" disabled={serverBusy} onClick={handleDisconnectServer}>
                  ⏏ Trennen
                </button>
              </div>
            </div>

            {instanceError && <div className="nx-update-error">{instanceError}</div>}

            {openInstanceId ? (
              (() => {
                const instance = instances.find((i) => i.id === openInstanceId);
                return instance ? (
                  <InstanceDetail
                    serverId={selectedServer.id}
                    instance={instance}
                    cpuHistory={cpuHistory[selectedServer.id] ?? []}
                    ramHistory={ramHistory[selectedServer.id] ?? []}
                    onClose={() => setOpenInstanceId(null)}
                  />
                ) : null;
              })()
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                  <h3 style={{ margin: 0 }}>Installierte Gameserver</h3>
                  <button className="nx-update-btn" onClick={() => setShowStoreDialog(true)}>
                    + Neues Spiel installieren
                  </button>
                </div>
                {instances.length === 0 && (
                  <p style={{ color: "var(--nx-text-muted)" }}>Noch keine Gameserver installiert.</p>
                )}
                <div className="nx-instance-grid">
                  {instances.map((instance) => {
                    const status = instanceStatus[instance.id];
                    const isActive = status?.state === "active";
                    const isFailed = status?.state === "failed";
                    const statusColor = isActive ? "var(--nx-accent)" : isFailed ? "var(--nx-danger)" : "var(--nx-text-muted)";
                    const statusLabel = isActive ? "Online" : isFailed ? "Fehler" : status ? "Gestoppt" : "Unbekannt";
                    return (
                      <div key={instance.id} className="nx-instance-card">
                        <div className="nx-instance-card-title">
                          <span>{instance.display_name}</span>
                          <label className="nx-toggle">
                            <input
                              type="checkbox"
                              checked={isActive}
                              disabled={instanceBusy === instance.id}
                              onChange={() => runInstanceAction(instance, isActive ? "stop" : "start")}
                            />
                            <span className="nx-toggle-slider" />
                          </label>
                        </div>
                        <div style={{ fontSize: 12, color: statusColor, marginBottom: 4 }}>
                          <span className="nx-status-dot" style={{ background: statusColor }} /> {statusLabel}
                        </div>
                        {status && <div className="nx-instance-card-sub">Uptime: {formatUptime(status.uptime_seconds)}</div>}
                        <div className="nx-instance-actions">
                          <button
                            disabled={instanceBusy === instance.id}
                            onClick={() => runInstanceAction(instance, "restart")}
                          >
                            Neustart
                          </button>
                          <button onClick={() => setOpenInstanceId(instance.id)}>Verwalten</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
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

      {showStoreDialog && selectedServerId && (
        <GameStoreDialog
          serverId={selectedServerId}
          onClose={() => setShowStoreDialog(false)}
          onInstalled={(instance) => {
            setInstances((prev) => [...prev, instance]);
            setShowStoreDialog(false);
          }}
        />
      )}
    </div>
  );
}

export default App;
