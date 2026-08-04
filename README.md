# GlimaNexus

Ressourcenschonende, plattformübergreifende Desktop-App (Tauri 2) zum Verwalten von dedizierten Gameservern auf Linux-VPS via SSH — ohne CLI-Kenntnisse.

Lizenziert unter [GPL-3.0](LICENSE) — bleibt Open Source, Forks müssen offen bleiben.

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

Voraussetzung unter Windows: [OpenSSL (Dev, inkl. Header/Libs)](https://slproweb.com/products/Win32OpenSSL.html) installiert und `OPENSSL_DIR` auf den Installationspfad gesetzt (z.B. `C:\Program Files\OpenSSL-Win64`) — wird für das Linken von SQLCipher benötigt.

```bash
npm install
npm run tauri dev
```

## Releases & Auto-Update

Releases werden ausschließlich über GitHub Actions gebaut (`.github/workflows/release.yml`), niemals lokal veröffentlicht. Ein neues Release auslösen:

```bash
git tag v0.1.1
git push origin v0.1.1
```

Die Pipeline baut den signierten Windows-Installer (NSIS/MSI) und veröffentlicht ihn als GitHub Release inkl. `latest.json`. Die App prüft beim Start automatisch auf neue Versionen und zeigt "Update verfügbar, jetzt installieren".

Siehe [`src-tauri/resources/games.json`](src-tauri/resources/games.json) für die Spiele-Template-Datenbank.
