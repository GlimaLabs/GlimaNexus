import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GameTemplate, InstanceRecord } from "./types";
import { gameIcon } from "./gameIcons";

type Props = {
  serverId: string;
  onClose: () => void;
  onInstalled: (instance: InstanceRecord) => void;
};

export default function GameStoreDialog({ serverId, onClose, onInstalled }: Props) {
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
                <span style={{ fontSize: 22 }}>{gameIcon(game.id)}</span>
                <span style={{ fontWeight: 600 }}>{game.name}</span>
              </div>
              <div style={{ color: "var(--nx-text-muted)", fontSize: 12, marginBottom: 10 }}>{game.subtitle}</div>
              <button
                className="nx-update-btn"
                disabled={installingId !== null}
                onClick={() => install(game)}
              >
                {installingId === game.id ? "Installiere…" : "Installieren"}
              </button>
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
