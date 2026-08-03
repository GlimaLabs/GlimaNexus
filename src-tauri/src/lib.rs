mod db;
mod keyring_store;
mod provisioning;
mod ssh;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Serialize, Deserialize, Clone)]
pub struct ServerConnectionInput {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
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

/// Module A: connection test + bootstrap (creates `gameserver` user, installs deps).
#[tauri::command]
async fn connect_and_provision(input: ServerConnectionInput) -> Result<String, String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::bootstrap_server(&mut session)
        .await
        .map_err(|e| e.to_string())?;
    Ok("Server erfolgreich verbunden und vorbereitet".into())
}

/// Module A: live CPU/RAM polling via a lightweight remote one-liner.
#[tauri::command]
async fn get_hardware_stats(input: ServerConnectionInput) -> Result<HardwareStats, String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;

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

/// Module C: start/stop/restart a game instance via systemd.
#[tauri::command]
async fn control_instance(input: ServerConnectionInput, unit_name: String, action: String) -> Result<String, String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::control_instance(&mut session, &unit_name, &action)
        .await
        .map_err(|e| e.to_string())
}

/// Module C: streams `journalctl -fu <unit>` line-by-line to the frontend via a Tauri Channel,
/// so the UI thread never blocks even under heavy log throughput.
#[tauri::command]
async fn stream_instance_logs(
    input: ServerConnectionInput,
    unit_name: String,
    on_event: Channel<LogEvent>,
) -> Result<(), String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;

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
        .invoke_handler(tauri::generate_handler![
            connect_and_provision,
            get_hardware_stats,
            control_instance,
            stream_instance_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
