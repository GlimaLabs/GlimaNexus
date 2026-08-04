export type PatchNote = {
  version: string;
  date: string;
  items: string[];
};

// Maintained by hand alongside each release - keep entries short and user-facing,
// newest first. Not every internal commit needs its own entry.
export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.1.23",
    date: "2026-08-05",
    items: [
      "Umbenannt zu GlimaNexus (vorher NovaNexus) - bestehende Installationen brauchen einmalig den neuen Installer und müssen Server-Passwörter neu eingeben",
      "Unterstützung für Fedora/RHEL/CentOS/Rocky/AlmaLinux-Server zusätzlich zu Ubuntu/Debian",
      "Firewall-Ports werden beim Installieren und bei Port-Änderungen automatisch freigegeben (ufw/firewalld)",
      "Server ohne Swap bekommen automatisch eine 2 GB Swap-Datei, damit RAM-Spitzen nicht den Gameserver killen",
      "Neuer Backup-Manager: Server-Backups erstellen, herunterladen und löschen",
      "Neue einfache Verzeichnis-Ansicht für Hauptverzeichnis und Backup-Ordner übers ⋯-Menü",
    ],
  },
  {
    version: "0.1.22",
    date: "2026-08-04",
    items: [
      "Steamcmd-Installationen (Palworld, 7 Days to Die, DayZ, Satisfactory, SCUM, Valheim, V Rising) funktionieren jetzt zuverlässig",
      "7 Days to Die zeigt jetzt das richtige Icon",
      "Server- und Gameserver-Kacheln überarbeitet (größere Icons, Layout näher am Design)",
      "Minecraft zeigt jetzt die echte installierte Version an, inkl. Update-Button bei neuen Versionen",
      "Während der Installation eines Gameservers erscheint jetzt eine Fortschritts-Kachel",
    ],
  },
  {
    version: "0.1.21",
    date: "2026-08-04",
    items: [
      "Konfiguration-Tab (Server-Einstellungen) liest jetzt tatsächlich die gespeicherten Werte statt immer die Standardwerte zu zeigen",
    ],
  },
  {
    version: "0.1.20",
    date: "2026-08-04",
    items: [
      "Minecraft installiert jetzt automatisch die neueste Paper-Version statt einer festen alten Version",
    ],
  },
  {
    version: "0.1.19",
    date: "2026-08-04",
    items: [
      "Gameserver mit relativem Startbefehl (Palworld, 7DTD, DayZ, Satisfactory, SCUM, Valheim, V Rising, Factorio) starteten nicht - behoben",
    ],
  },
  {
    version: "0.1.18",
    date: "2026-08-04",
    items: [
      "Server-Einstellungen: neuer Konfiguration-Tab zum Bearbeiten von Server-Name, Spieler-Slots, Passwort etc. (Minecraft & Factorio)",
      "7 weitere Spiele installierbar: 7 Days to Die, DayZ, Factorio, Satisfactory, SCUM, Valheim, V Rising",
    ],
  },
  {
    version: "0.1.17",
    date: "2026-08-04",
    items: [
      "Neuer System-Status-Widget in der Sidebar (CPU/RAM/Netzwerk des eigenen PCs)",
      "Echte Distro-Icons, überarbeiteter Status & Ressourcen Tab",
    ],
  },
];
