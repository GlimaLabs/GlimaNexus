import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type DirEntry = {
  name: string;
  is_dir: boolean;
  size_bytes: number;
};

type Props = {
  serverId: string;
  instanceId: string;
  instanceName: string;
  target: "install" | "backups";
  onClose: () => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function DirectoryBrowserDialog({ serverId, instanceId, instanceName, target, onClose }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<DirEntry[]>("list_directory", { serverId, instanceId, target })
      .then(setEntries)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [serverId, instanceId, target]);

  return (
    <div className="nx-modal-overlay" onClick={onClose}>
      <div className="nx-modal nx-dirbrowser-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{target === "install" ? "Hauptverzeichnis" : "Backup-Verzeichnis"}</h2>
        <div style={{ fontSize: 12, color: "var(--nx-text-muted)", marginTop: -8 }}>{instanceName}</div>

        {loading && <p style={{ color: "var(--nx-text-muted)" }}>Lade…</p>}
        {error && <p style={{ color: "var(--nx-danger)", fontSize: 12 }}>{error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p style={{ color: "var(--nx-text-muted)" }}>Verzeichnis ist leer.</p>
        )}
        {!loading && entries.length > 0 && (
          <div className="nx-dirbrowser-list">
            {entries.map((entry) => (
              <div key={entry.name} className="nx-dirbrowser-row">
                <span>{entry.is_dir ? "📁" : "📄"}</span>
                <span style={{ flex: 1 }}>{entry.name}</span>
                {!entry.is_dir && (
                  <span style={{ color: "var(--nx-text-muted)", fontSize: 12 }}>{formatSize(entry.size_bytes)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="nx-modal-actions">
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
