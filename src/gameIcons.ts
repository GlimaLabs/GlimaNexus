// Placeholder icons only - real game logos are trademarks of their publishers and
// aren't bundled here. Swap these for licensed/official assets if you have the rights.
const ICONS: Record<string, string> = {
  "minecraft-paper": "⛏️",
  palworld: "🐾",
};

export function gameIcon(gameId: string): string {
  return ICONS[gameId] ?? "🎮";
}
