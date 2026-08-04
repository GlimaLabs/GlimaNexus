import minecraftIcon from "./assets/games/minecraft.png";

// Real per-game icon images. Add an entry here once you have a licensed/official asset
// for a game (see src/assets/games/) - anything without an entry falls back to "N/A".
const ICONS: Record<string, string> = {
  "minecraft-paper": minecraftIcon,
};

type Props = {
  gameId: string;
  size?: number;
};

export default function GameIcon({ gameId, size = 32 }: Props) {
  const src = ICONS[gameId];
  const style = { width: size, height: size, borderRadius: 6, flexShrink: 0 };

  if (src) {
    return <img src={src} alt="" style={{ ...style, objectFit: "cover" }} />;
  }

  return (
    <div
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--nx-panel-alt)",
        border: "1px solid var(--nx-border)",
        color: "var(--nx-text-muted)",
        fontSize: Math.max(9, size * 0.3),
        fontWeight: 600,
      }}
    >
      N/A
    </div>
  );
}
