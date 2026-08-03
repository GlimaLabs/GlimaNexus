mod db;
mod games;
mod keyring_store;
mod provisioning;
mod ssh;

use db::{Db, InstanceRecord, ServerRecord};
use games::GameTemplate;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Manager, State};

pub struct AppState {
    pub db: Mutex<Db>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HardwareStats {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum LogEvent {
    Line { text: String },
    Closed,
}

#[derive(Deserialize)]
pub struct AddServerInput {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

/// Opens an authenticated SSH session for a stored server, looking up host/port/username
/// from the DB and the password from the OS keyring — the frontend never handles secrets.
async fn connect_to_server(state: &State<'_, AppState>, server_id: &str) -> Result<ssh::SshSession, String> {
    let server = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server(server_id).map_err(|e| e.to_string())?
    };
    let password = keyring_store::get_secret(server_id).map_err(|e| e.to_string())?;
    ssh::SshSession::connect_password(&server.host, server.port, &server.username, &password)
        .await
        .map_err(|e| e.to_string())
}

/// Module A: registers a new server. Connects via SSH, provisions the isolated
/// `gameserver` user + base deps, then persists metadata (SQLite) and the
/// password in the OS keyring — never in plaintext.
#[tauri::command]
async fn add_server(state: State<'_, AppState>, input: AddServerInput) -> Result<ServerRecord, String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::bootstrap_server(&mut session)
        .await
        .map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    keyring_store::store_secret(&id, &input.password).map_err(|e| e.to_string())?;

    let record = ServerRecord {
        id,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.insert_server(&record).map_err(|e| e.to_string())?;
    Ok(record)
}

/// Module A: lists all registered servers from the local encrypted database.
#[tauri::command]
fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_servers().map_err(|e| e.to_string())
}

/// Removes a server: deletes its DB row and its stored keyring secret.
#[tauri::command]
fn delete_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_server(&id).map_err(|e| e.to_string())?;
    let _ = keyring_store::delete_secret(&id);
    Ok(())
}

/// Module A: live CPU/RAM polling via a lightweight remote one-liner.
#[tauri::command]
async fn get_hardware_stats(state: State<'_, AppState>, server_id: String) -> Result<HardwareStats, String> {
    let mut session = connect_to_server(&state, &server_id).await?;

    let cpu_raw = session
        .exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'")
        .await
        .map_err(|e| e.to_string())?;
    let mem_raw = session
        .exec("free -m | awk '/Mem:/ {print $3\" \"$2}'")
        .await
        .map_err(|e| e.to_string())?;

    let cpu_percent = cpu_raw.trim().parse::<f32>().unwrap_or(0.0);
    let mut mem_parts = mem_raw.trim().split_whitespace();
    let ram_used_mb = mem_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ram_total_mb = mem_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);

    Ok(HardwareStats { cpu_percent, ram_used_mb, ram_total_mb })
}

/// Module B: lists the games available in the bundled template database.
#[tauri::command]
fn list_games() -> Vec<GameTemplate> {
    games::load_templates()
}

/// Module B: lists installed gameserver instances for a server.
#[tauri::command]
fn list_instances(state: State<'_, AppState>, server_id: String) -> Result<Vec<InstanceRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_instances(&server_id).map_err(|e| e.to_string())
}

/// Module B: installs a game server from its template — runs the install steps over SSH,
/// generates + enables a systemd unit (running as `gameserver`, never root), and persists
/// the instance so it shows up as a tile in the UI.
#[tauri::command]
async fn install_game(
    state: State<'_, AppState>,
    server_id: String,
    game_id: String,
    display_name: String,
) -> Result<InstanceRecord, String> {
    let template = games::find_template(&game_id).ok_or_else(|| format!("Unbekanntes Spiel: {game_id}"))?;

    let mut session = connect_to_server(&state, &server_id).await?;

    let instance_id = uuid::Uuid::new_v4().to_string();
    let ram_limit_mb = template.default_ram_limit_mb;

    for step in &template.install.steps {
        let rendered = games::render_step(step, &instance_id, ram_limit_mb);
        session.exec(&rendered).await.map_err(|e| e.to_string())?;
    }

    let install_path = format!("/home/gameserver/instances/{instance_id}");
    let start_command = games::render_step(&template.start_command, &instance_id, ram_limit_mb);
    let unit_name = format!("novanexus-{instance_id}");
    let unit_contents = provisioning::render_systemd_unit(&instance_id, &install_path, &start_command);

    provisioning::install_systemd_unit(&mut session, &unit_name, &unit_contents)
        .await
        .map_err(|e| e.to_string())?;

    let record = InstanceRecord {
        id: instance_id,
        server_id,
        game_id,
        display_name,
        install_path,
        systemd_unit: unit_name,
        cpu_limit_percent: template.default_cpu_limit_percent,
        ram_limit_mb,
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.insert_instance(&record).map_err(|e| e.to_string())?;
    Ok(record)
}

/// Module C: start/stop/restart a game instance via systemd.
#[tauri::command]
async fn control_instance(state: State<'_, AppState>, server_id: String, unit_name: String, action: String) -> Result<String, String> {
    let mut session = connect_to_server(&state, &server_id).await?;
    provisioning::control_instance(&mut session, &unit_name, &action)
        .await
        .map_err(|e| e.to_string())
}

/// Module C: streams `journalctl -fu <unit>` line-by-line to the frontend via a Tauri Channel,
/// so the UI thread never blocks even under heavy log throughput.
#[tauri::command]
async fn stream_instance_logs(
    state: State<'_, AppState>,
    server_id: String,
    unit_name: String,
    on_event: Channel<LogEvent>,
) -> Result<(), String> {
    let mut session = connect_to_server(&state, &server_id).await?;

    let output = session
        .exec(&format!("journalctl -fu {unit_name} -n 200 --no-pager"))
        .await
        .map_err(|e| e.to_string())?;

    for line in output.lines() {
        let _ = on_event.send(LogEvent::Line { text: line.to_string() });
    }
    let _ = on_event.send(LogEvent::Closed);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("novanexus.db");
            let db_key = keyring_store::get_or_create_db_key()?;
            let db = Db::open(db_path, &db_key)?;
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_server,
            list_servers,
            delete_server,
            get_hardware_stats,
            list_games,
            list_instances,
            install_game,
            control_instance,
            stream_instance_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
