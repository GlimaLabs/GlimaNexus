import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GameTemplate, InstanceRecord } from "./types";
import GameIcon from "./GameIcon";

type Props = {
  serverId: string;
  onClose: () => void;
  onInstalled: (instance: InstanceRecord) => void;
  onInstallStart: (game: GameTemplate) => void;
  onInstallDone: () => void;
};

export default function GameStoreDialog({ serverId, onClose, onInstalled, onInstallStart, onInstallDone }: Props) {
  const [games, setGames] = useState<GameTemplate[]>([]);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<GameTemplate[]>("list_games")
      .then(setGames)
      .catch((err) => setError(String(err)));
  }, []);

  async function install(game: GameTemplate) {
    setInstallingId(game.id);
    setError("");
    onInstallStart(game);
    try {
      const instance = await invoke<InstanceRecord>("install_game", {
        serverId,
        gameId: game.id,
        displayName: game.name,
      });
      onInstalled(instance);
    } catch (err) {
      setError(String(err));
    } finally {
      setInstallingId(null);
      onInstallDone();
    }
  }

  return (
    <div className="nx-modal-overlay" onClick={onClose}>
      <div className="nx-modal nx-store-modal" onClick={(e) => e.stopPropagation()}>
        <h2>App-Store</h2>
        {error && <div className="nx-update-error">{error}</div>}

        <div className="nx-game-grid">
          {games.map((game) => (
            <div key={game.id} className="nx-game-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <GameIcon gameId={game.id} size={32} />
                <span style={{ fontWeight: 600 }}>{game.name}</span>
              </div>
              <div style={{ color: "var(--nx-text-muted)", fontSize: 12, marginBottom: 10 }}>{game.subtitle}</div>
              <button
                className="nx-update-btn"
                disabled={installingId !== null}
                onClick={() => install(game)}
              >
                {installingId === game.id && <span className="nx-spinner" />}
                {installingId === game.id ? "Installiere…" : "Installieren"}
              </button>
              {installingId === game.id && (
                <div style={{ color: "var(--nx-text-muted)", fontSize: 11, marginTop: 6 }}>
                  Kann 1–2 Minuten dauern (Download & Einrichtung auf dem Server)
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="nx-modal-actions">
          <button type="button" onClick={onClose} disabled={installingId !== null}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
