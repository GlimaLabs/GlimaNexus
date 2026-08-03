use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub struct Db {
    pub conn: Connection,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ServerRecord {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
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

    pub fn insert_server(&self, record: &ServerRecord) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO servers (id, name, host, port, username, auth_method, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'password', datetime('now'))",
            params![record.id, record.name, record.host, record.port, record.username],
        )?;
        Ok(())
    }

    pub fn list_servers(&self) -> rusqlite::Result<Vec<ServerRecord>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, host, port, username FROM servers ORDER BY created_at ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ServerRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete_server(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM servers WHERE id = ?1", params![id])?;
        Ok(())
    }
}
