mod db;
mod games;
mod keyring_store;
mod provisioning;
mod ssh;

use db::{Db, InstanceRecord, ServerRecord};
use games::GameTemplate;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tokio::sync::{Mutex as TokioMutex, OwnedMutexGuard};

type SessionSlot = Arc<TokioMutex<Option<ssh::SshSession>>>;

pub struct AppState {
    pub db: Mutex<Db>,
    /// One reused SSH connection per server, instead of a fresh handshake + auth for every
    /// single poll (CPU/RAM every 8s, instance status every 5s) - that reconnect overhead is
    /// what made the UI feel laggy under frequent polling.
    pub ssh_pool: Mutex<HashMap<String, SessionSlot>>,
    /// Kept alive across polls (not re-created per call) so sysinfo's CPU/network deltas are
    /// measured against the previous poll instead of needing an artificial sleep every time.
    pub local_sys: Mutex<LocalSystemMonitor>,
}

pub struct LocalSystemMonitor {
    pub sys: sysinfo::System,
    pub networks: sysinfo::Networks,
    pub last_net_bytes: (u64, u64), // (received, transmitted)
    pub last_poll: std::time::Instant,
}

impl LocalSystemMonitor {
    fn new() -> Self {
        Self {
            sys: sysinfo::System::new_all(),
            networks: sysinfo::Networks::new_with_refreshed_list(),
            last_net_bytes: (0, 0),
            last_poll: std::time::Instant::now(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HardwareStats {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub disk_used_gb: u64,
    pub disk_total_gb: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LocalSystemStats {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub net_up_kbps: f64,
    pub net_down_kbps: f64,
}

/// Reads CPU/RAM/network usage of the machine GlimaNexus itself is running on
/// (not a managed server) for the sidebar's local System Status widget.
#[tauri::command]
fn get_local_system_stats(state: State<'_, AppState>) -> Result<LocalSystemStats, String> {
    let mut monitor = state.local_sys.lock().map_err(|e| e.to_string())?;

    monitor.sys.refresh_cpu_usage();
    monitor.sys.refresh_memory();
    monitor.networks.refresh();

    let cpu_percent = monitor.sys.global_cpu_usage();
    let ram_used_mb = monitor.sys.used_memory() / 1024 / 1024;
    let ram_total_mb = monitor.sys.total_memory() / 1024 / 1024;

    let (received, transmitted) = monitor
        .networks
        .values()
        .fold((0u64, 0u64), |(r, t), n| (r + n.total_received(), t + n.total_transmitted()));

    let elapsed = monitor.last_poll.elapsed().as_secs_f64().max(0.001);
    let (last_r, last_t) = monitor.last_net_bytes;
    let net_down_kbps = if last_r > 0 { (received.saturating_sub(last_r)) as f64 / 1024.0 / elapsed } else { 0.0 };
    let net_up_kbps = if last_t > 0 { (transmitted.saturating_sub(last_t)) as f64 / 1024.0 / elapsed } else { 0.0 };

    monitor.last_net_bytes = (received, transmitted);
    monitor.last_poll = std::time::Instant::now();

    Ok(LocalSystemStats { cpu_percent, ram_used_mb, ram_total_mb, net_up_kbps, net_down_kbps })
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

/// Establishes a brand-new authenticated SSH session for a stored server, looking up
/// host/port/username from the DB and the password from the OS keyring, and makes sure
/// passwordless sudo is set up (self-healing for servers added before that existed).
async fn connect_fresh(state: &State<'_, AppState>, server_id: &str) -> Result<ssh::SshSession, String> {
    let server = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_server(server_id).map_err(|e| e.to_string())?
    };
    let password = keyring_store::get_secret(server_id).map_err(|e| e.to_string())?;
    let mut session = ssh::SshSession::connect_password(&server.host, server.port, &server.username, &password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::ensure_passwordless_sudo(&mut session, &server.username, &password)
        .await
        .map_err(|e| e.to_string())?;
    Ok(session)
}

/// Returns the server's pooled SSH session, connecting (and running the one-time sudo
/// setup) only if there isn't already a live one. The caller gets exclusive access via the
/// returned guard for as long as they hold it; on any exec failure they should set the slot
/// back to `None` so the next call reconnects instead of reusing a dead connection.
async fn acquire_session(state: &State<'_, AppState>, server_id: &str) -> Result<OwnedMutexGuard<Option<ssh::SshSession>>, String> {
    let slot = {
        let mut pool = state.ssh_pool.lock().map_err(|e| e.to_string())?;
        pool.entry(server_id.to_string())
            .or_insert_with(|| Arc::new(TokioMutex::new(None)))
            .clone()
    };
    let mut guard = slot.lock_owned().await;
    if guard.is_none() {
        *guard = Some(connect_fresh(state, server_id).await?);
    }
    Ok(guard)
}

/// Module A: registers a new server. Connects via SSH, provisions the isolated
/// `gameserver` user + base deps, then persists metadata (SQLite) and the
/// password in the OS keyring — never in plaintext.
#[tauri::command]
async fn add_server(state: State<'_, AppState>, input: AddServerInput) -> Result<ServerRecord, String> {
    let mut session = ssh::SshSession::connect_password(&input.host, input.port, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::ensure_passwordless_sudo(&mut session, &input.username, &input.password)
        .await
        .map_err(|e| e.to_string())?;
    provisioning::bootstrap_server(&mut session)
        .await
        .map_err(|e| e.to_string())?;

    let os_raw = session
        .exec("grep PRETTY_NAME /etc/os-release | cut -d'\"' -f2")
        .await
        .unwrap_or_default();
    let os_info = {
        let trimmed = os_raw.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
    };

    let id = uuid::Uuid::new_v4().to_string();
    keyring_store::store_secret(&id, &input.password).map_err(|e| e.to_string())?;

    let record = ServerRecord {
        id,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        os_info,
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.insert_server(&record).map_err(|e| e.to_string())?;
    Ok(record)
}

/// Reboots the underlying VPS/root server. Destructive/disruptive - the frontend
/// must confirm with the user before calling this.
#[tauri::command]
async fn reboot_server(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let mut guard = acquire_session(&state, &server_id).await?;
    // The connection drops as the machine reboots - that's expected, not an error.
    let _ = guard.as_mut().unwrap().exec("sudo reboot").await;
    *guard = None;
    Ok(())
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
    if let Ok(mut pool) = state.ssh_pool.lock() {
        pool.remove(&id);
    }
    Ok(())
}

/// Module A: live CPU/RAM polling via a lightweight remote one-liner.
#[tauri::command]
async fn get_hardware_stats(state: State<'_, AppState>, server_id: String) -> Result<HardwareStats, String> {
    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();

    let result = async {
        let cpu_raw = session.exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").await?;
        let mem_raw = session.exec("free -m | awk '/Mem:/ {print $3\" \"$2}'").await?;
        let disk_raw = session.exec("df -BG / | awk 'NR==2 {gsub(\"G\",\"\"); print $3\" \"$2}'").await?;
        anyhow::Ok((cpu_raw, mem_raw, disk_raw))
    }
    .await;

    let (cpu_raw, mem_raw, disk_raw) = match result {
        Ok(v) => v,
        Err(e) => {
            *guard = None;
            return Err(e.to_string());
        }
    };

    let cpu_percent = cpu_raw.trim().parse::<f32>().unwrap_or(0.0);
    let mut mem_parts = mem_raw.trim().split_whitespace();
    let ram_used_mb = mem_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let ram_total_mb = mem_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut disk_parts = disk_raw.trim().split_whitespace();
    let disk_used_gb = disk_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let disk_total_gb = disk_parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);

    Ok(HardwareStats { cpu_percent, ram_used_mb, ram_total_mb, disk_used_gb, disk_total_gb })
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

    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();

    let instance_id = uuid::Uuid::new_v4().to_string();
    let ram_limit_mb = template.default_ram_limit_mb;
    let install_path = format!("/home/gameserver/instances/{instance_id}");

    // /home/gameserver is owned by root (created via `useradd -m`), so the admin's own
    // login user can't write into it. Create the instance dir with the right owner first,
    // then run every install step as the `gameserver` user itself so downloaded files end
    // up owned by the account that will actually run the service.
    session
        .exec(&format!(
            "sudo mkdir -p {install_path} && sudo chown gameserver:gameserver {install_path}"
        ))
        .await
        .map_err(|e| e.to_string())?;

    for step in &template.install.steps {
        let rendered = games::render_step(step, &instance_id, ram_limit_mb);
        let quoted = games::shell_single_quote(&rendered);
        session
            .exec(&format!("sudo -u gameserver bash -c {quoted}"))
            .await
            .map_err(|e| e.to_string())?;
    }

    let start_command = games::render_step(&template.start_command, &instance_id, ram_limit_mb);
    let unit_name = format!("novanexus-{instance_id}");
    let unit_contents = provisioning::render_systemd_unit(&instance_id, &install_path, &start_command);

    provisioning::install_systemd_unit(session, &unit_name, &unit_contents)
        .await
        .map_err(|e| e.to_string())?;

    // Start the instance right after install so the user doesn't have to know
    // that "enable" (survive reboot) and "start" (running now) are different things.
    provisioning::control_instance(session, &unit_name, "start")
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

#[derive(Serialize, Deserialize, Clone)]
pub struct VersionInfo {
    pub installed: Option<String>,
    pub latest: Option<String>,
    pub up_to_date: bool,
}

/// Module B: reports the installed vs. latest available version for a game instance, so the
/// UI can show a real version number instead of a generic label and offer an update when
/// they diverge. Only implemented for Paper (Minecraft) right now - other games' installed
/// version isn't easily readable from a single file the way Paper's version_history.json is.
#[tauri::command]
async fn get_instance_version(
    state: State<'_, AppState>,
    server_id: String,
    game_id: String,
    install_path: String,
) -> Result<VersionInfo, String> {
    if game_id != "minecraft-paper" {
        return Err("Für dieses Spiel gibt es noch keine Versionsanzeige".to_string());
    }

    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();

    let history_path = format!("{install_path}/.paper/version_history.json");
    let raw = session
        .exec(&format!("sudo cat {} 2>/dev/null", games::shell_single_quote(&history_path)))
        .await
        .map_err(|e| e.to_string())?;

    let installed = serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("currentVersion").and_then(|s| s.as_str().map(String::from)))
        .and_then(|s| {
            // "26.2-92-0a99345 (MC: 26.2)" -> "26.2"
            let start = s.find("MC: ")? + 4;
            let end = s[start..].find(')')? + start;
            Some(s[start..end].to_string())
        });

    let latest = session
        .exec("curl -s https://fill.papermc.io/v3/projects/paper | jq -r '.versions | to_entries[0].value[0]'")
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let up_to_date = match (&installed, &latest) {
        (Some(i), Some(l)) => i == l,
        _ => false,
    };

    Ok(VersionInfo { installed, latest, up_to_date })
}

/// Module B: re-runs a game instance's install steps (re-downloading the latest build) and
/// restarts it - used by the "Update" action when get_instance_version reports a mismatch.
#[tauri::command]
async fn update_instance(
    state: State<'_, AppState>,
    server_id: String,
    game_id: String,
    install_path: String,
    unit_name: String,
    ram_limit_mb: u32,
) -> Result<(), String> {
    let template = games::find_template(&game_id).ok_or_else(|| format!("Unbekanntes Spiel: {game_id}"))?;

    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();

    provisioning::control_instance(session, &unit_name, "stop")
        .await
        .map_err(|e| e.to_string())?;

    // install_path already contains the instance id as its last path segment.
    let instance_id = install_path.rsplit('/').next().unwrap_or_default();
    for step in &template.install.steps {
        let rendered = games::render_step(step, instance_id, ram_limit_mb);
        let quoted = games::shell_single_quote(&rendered);
        session
            .exec(&format!("sudo -u gameserver bash -c {quoted}"))
            .await
            .map_err(|e| e.to_string())?;
    }

    provisioning::control_instance(session, &unit_name, "start")
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Module B: reads a game instance's config file over SSH and extracts the values for the
/// fields declared in its template's config schema (falling back to defaults when a field
/// or the file itself doesn't exist yet, e.g. right after install).
#[tauri::command]
async fn get_instance_config(
    state: State<'_, AppState>,
    server_id: String,
    game_id: String,
    install_path: String,
) -> Result<HashMap<String, String>, String> {
    let template = games::find_template(&game_id).ok_or_else(|| format!("Unbekanntes Spiel: {game_id}"))?;
    let schema = template
        .config
        .ok_or_else(|| "Für dieses Spiel gibt es noch keine Konfigurationsoberfläche".to_string())?;

    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();
    let path = format!("{install_path}/{}", schema.file);
    // The config file is owned by `gameserver`, not the SSH login user - a plain `cat` gets
    // "Permission denied" (silently swallowed by the redirect) and we'd parse an empty file,
    // showing every field's default instead of its real value.
    let raw = session
        .exec(&format!("sudo cat {} 2>/dev/null", games::shell_single_quote(&path)))
        .await
        .map_err(|e| e.to_string())?;

    Ok(games::parse_config(&schema, &raw))
}

/// Module B: writes updated field values back into a game instance's config file, preserving
/// unrelated content, so the game's own config format doesn't get clobbered.
#[tauri::command]
async fn save_instance_config(
    state: State<'_, AppState>,
    server_id: String,
    game_id: String,
    install_path: String,
    values: HashMap<String, String>,
) -> Result<(), String> {
    let template = games::find_template(&game_id).ok_or_else(|| format!("Unbekanntes Spiel: {game_id}"))?;
    let schema = template
        .config
        .ok_or_else(|| "Für dieses Spiel gibt es noch keine Konfigurationsoberfläche".to_string())?;

    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();
    let path = format!("{install_path}/{}", schema.file);
    let quoted_path = games::shell_single_quote(&path);
    let raw = session
        .exec(&format!("sudo cat {quoted_path} 2>/dev/null"))
        .await
        .map_err(|e| e.to_string())?;

    let rendered = games::render_config(&schema, &raw, &values);
    // Pipe the rendered content in via stdin instead of interpolating it into the command
    // string, so config values containing quotes/`$`/backticks can never break out of the
    // shell command (same pattern as ensure_passwordless_sudo's stdin-piped password).
    session
        .exec_with_stdin(
            &format!("sudo -u gameserver tee {quoted_path} > /dev/null"),
            rendered.as_bytes(),
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Module C: start/stop/restart a game instance via systemd.
#[tauri::command]
async fn control_instance(state: State<'_, AppState>, server_id: String, unit_name: String, action: String) -> Result<String, String> {
    let mut guard = acquire_session(&state, &server_id).await?;
    let result = provisioning::control_instance(guard.as_mut().unwrap(), &unit_name, &action).await;
    match result {
        Ok(v) => Ok(v),
        Err(e) => {
            *guard = None;
            Err(e.to_string())
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InstanceStatus {
    pub state: String,
    pub uptime_seconds: i64,
    pub pid: Option<i64>,
    pub started_at: Option<String>,
}

/// Module C: reports whether a game instance's systemd unit is currently running
/// and how long it's been up, so the UI can show a real status badge + uptime
/// instead of guessing.
#[tauri::command]
async fn get_instance_status(state: State<'_, AppState>, server_id: String, unit_name: String) -> Result<InstanceStatus, String> {
    let mut guard = acquire_session(&state, &server_id).await?;
    let session = guard.as_mut().unwrap();
    let result = session
        .exec(&format!(
            "STATE=$(systemctl is-active {unit_name}); \
             TS=$(systemctl show -p ActiveEnterTimestamp --value {unit_name}); \
             PID=$(systemctl show -p MainPID --value {unit_name}); \
             if [ -n \"$TS\" ] && [ \"$TS\" != \"n/a\" ]; then \
               NOW=$(date +%s); THEN=$(date -d \"$TS\" +%s 2>/dev/null || echo $NOW); UPTIME=$((NOW-THEN)); \
             else UPTIME=0; fi; \
             echo \"$STATE|$UPTIME|$PID|$TS\""
        ))
        .await;

    let output = match result {
        Ok(v) => v,
        Err(e) => {
            *guard = None;
            return Err(e.to_string());
        }
    };

    let mut parts = output.trim().splitn(4, '|');
    let state = parts.next().unwrap_or("unknown").to_string();
    let uptime_seconds = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let pid = parts.next().and_then(|v| v.parse::<i64>().ok()).filter(|&p| p != 0);
    let started_at = parts.next().map(|v| v.trim().to_string()).filter(|v| !v.is_empty() && v != "n/a");
    Ok(InstanceStatus { state, uptime_seconds, pid, started_at })
}

/// Guards against ever running `rm -rf` on something wider than a single instance's own
/// directory - e.g. an empty/truncated path that resolves to the shared instances root.
/// The path must be exactly `/home/gameserver/instances/<instance_id>` with a non-empty,
/// slash-free, dot-free instance_id, so a malformed or missing id can never widen the blast
/// radius to "delete everything installed on the server".
fn validate_instance_path(install_path: &str, instance_id: &str) -> Result<(), String> {
    const BASE: &str = "/home/gameserver/instances/";
    if instance_id.is_empty() || instance_id.contains('/') || instance_id.contains("..") {
        return Err(format!("Ungültige instance_id: {instance_id:?}"));
    }
    let expected = format!("{BASE}{instance_id}");
    if install_path != expected {
        return Err(format!(
            "Install-Pfad passt nicht zur Instanz-ID, breche Löschung ab (erwartet {expected:?}, erhalten {install_path:?})"
        ));
    }
    Ok(())
}

/// "Schlank" option: forgets the instance in GlimaNexus only, leaving the service and its
/// files untouched on the server (e.g. to keep a world/save for later, or re-add it as a
/// server-side unit manually). Does not require an SSH connection.
#[tauri::command]
fn forget_instance(state: State<'_, AppState>, instance_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_instance(&instance_id).map_err(|e| e.to_string())
}

/// "Radikal" option: fully uninstalls a game instance: stops + disables the service, removes its systemd
/// unit file, reloads the daemon, deletes the installed files, and removes it from the
/// local list - the server ends up exactly as if the instance had never existed.
#[tauri::command]
async fn delete_instance(
    state: State<'_, AppState>,
    server_id: String,
    instance_id: String,
    unit_name: String,
    install_path: String,
) -> Result<(), String> {
    validate_instance_path(&install_path, &instance_id)?;

    if let Ok(mut guard) = acquire_session(&state, &server_id).await {
        let session = guard.as_mut().unwrap();
        let _ = provisioning::control_instance(session, &unit_name, "stop").await;
        let _ = session.exec(&format!("sudo systemctl disable {unit_name}")).await;
        let _ = session
            .exec(&format!("sudo rm -f /etc/systemd/system/{unit_name}.service"))
            .await;
        let _ = session.exec("sudo systemctl daemon-reload").await;
        let _ = session.exec(&format!("sudo rm -rf {install_path}")).await;
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_instance(&instance_id).map_err(|e| e.to_string())
}

/// Module C: streams `journalctl -fu <unit>` live, line-by-line, to the frontend via a Tauri
/// Channel. Runs as a detached background task so the command returns immediately and the
/// UI thread is never blocked, even while the remote log keeps following indefinitely.
#[tauri::command]
async fn stream_instance_logs(
    state: State<'_, AppState>,
    server_id: String,
    unit_name: String,
    on_event: Channel<LogEvent>,
) -> Result<(), String> {
    // Held open indefinitely by the spawned task below (journalctl -f never returns), so it
    // gets its own dedicated connection instead of tying up the shared per-server pool slot.
    let mut session = connect_fresh(&state, &server_id).await?;

    tauri::async_runtime::spawn(async move {
        let command = format!("journalctl -fu {unit_name} -n 200 --no-pager");
        let _ = session
            .exec_stream_lines(&command, |line| {
                let _ = on_event.send(LogEvent::Line { text: line });
            })
            .await;
        let _ = on_event.send(LogEvent::Closed);
    });

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
            app.manage(AppState {
                db: Mutex::new(db),
                ssh_pool: Mutex::new(HashMap::new()),
                local_sys: Mutex::new(LocalSystemMonitor::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_local_system_stats,
            add_server,
            list_servers,
            delete_server,
            reboot_server,
            get_hardware_stats,
            list_games,
            list_instances,
            install_game,
            get_instance_version,
            update_instance,
            get_instance_config,
            save_instance_config,
            control_instance,
            get_instance_status,
            delete_instance,
            forget_instance,
            stream_instance_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
