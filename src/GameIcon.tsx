import minecraftIcon from "./assets/games/minecraft.png";
import palworldIcon from "./assets/games/palworld.png";
import sevenDaysIcon from "./assets/games/7daystodie.png";
import dayzIcon from "./assets/games/dayz.png";
import factorioIcon from "./assets/games/factorio.png";
import satisfactoryIcon from "./assets/games/satisfactory.png";
import scumIcon from "./assets/games/scum.png";
import valheimIcon from "./assets/games/valheim.png";
import vrisingIcon from "./assets/games/vrising.png";

// Real per-game icon images, keyed by the game_id used in games.json. Some of these
// (everything but minecraft-paper/palworld) don't have an install template yet - the
// icon is staged ahead of time so it's ready the moment the template ships.
const ICONS: Record<string, string> = {
  "minecraft-paper": minecraftIcon,
  palworld: palworldIcon,
  "7dtd": sevenDaysIcon,
  dayz: dayzIcon,
  factorio: factorioIcon,
  satisfactory: satisfactoryIcon,
  scum: scumIcon,
  valheim: valheimIcon,
  vrising: vrisingIcon,
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
