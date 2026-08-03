use rusqlite::Connection;
use std::path::PathBuf;

pub struct Db {
    pub conn: Connection,
}

impl Db {
    /// Opens (or creates) the local SQLCipher-encrypted database.
    /// `key` comes from the OS keyring (see `keyring_store`), never from disk.
    pub fn open(path: PathBuf, key: &str) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "key", key)?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_method TEXT NOT NULL, -- 'password' | 'key'
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS instances (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
                game_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                install_path TEXT NOT NULL,
                systemd_unit TEXT NOT NULL,
                cpu_limit_percent INTEGER,
                ram_limit_mb INTEGER,
                created_at TEXT NOT NULL
            );
            ",
        )?;
        Ok(Self { conn })
    }
}
