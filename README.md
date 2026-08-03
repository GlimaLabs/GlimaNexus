# NovaNexus

Ressourcenschonende, plattformübergreifende Desktop-App (Tauri 2) zum Verwalten von dedizierten Gameservern auf Linux-VPS via SSH — ohne CLI-Kenntnisse.

## Stack

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Rust (Tauri 2, `tokio`, `russh`)
- **Datenbank**: SQLite, verschlüsselt via SQLCipher
- **Secrets**: OS-Keyring (Windows Credential Manager / Gnome Keyring / KWallet) — niemals im Klartext

## Sicherheitsprinzipien

1. Zero-Cloud-Storage — alle Server-Logins bleiben lokal
2. Passwörter/Passphrasen ausschließlich im OS-Keyring
3. Gameserver laufen nie als `root`, sondern unter einem isolierten `gameserver`-User

## Entwicklung

```bash
npm install
npm run tauri dev
```

Siehe [`src-tauri/resources/games.json`](src-tauri/resources/games.json) für die Spiele-Template-Datenbank.
