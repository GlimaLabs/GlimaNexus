use crate::ssh::SshSession;
use anyhow::Result;

/// Creates the isolated `gameserver` system user (no root execution of game processes)
/// and installs base dependencies (SteamCMD, Java, lib32 packages) on a fresh Ubuntu/Debian box.
pub async fn bootstrap_server(ssh: &mut SshSession) -> Result<()> {
    ssh.exec("id -u gameserver &>/dev/null || sudo useradd -m -s /bin/bash gameserver").await?;
    ssh.exec("sudo apt-get update -y").await?;
    ssh.exec(
        "sudo apt-get install -y curl wget tar unzip openjdk-21-jre-headless \
         software-properties-common lib32gcc-s1 lib32stdc++6",
    )
    .await?;
    ssh.exec(
        "command -v steamcmd &>/dev/null || \
         (sudo add-apt-repository -y multiverse && \
          sudo dpkg --add-architecture i386 && \
          sudo apt-get update -y && \
          echo steam steam/question select \"I AGREE\" | sudo debconf-set-selections && \
          sudo apt-get install -y steamcmd)",
    )
    .await?;
    Ok(())
}

/// Generates and installs a systemd unit so the game server survives reboots
/// and is controlled purely via `systemctl` (start/stop/restart), running as `gameserver`.
pub fn render_systemd_unit(instance_id: &str, working_dir: &str, start_command: &str) -> String {
    format!(
        "[Unit]\n\
         Description=NovaNexus Gameserver Instance {instance_id}\n\
         After=network.target\n\n\
         [Service]\n\
         Type=simple\n\
         User=gameserver\n\
         WorkingDirectory={working_dir}\n\
         ExecStart={start_command}\n\
         Restart=on-failure\n\
         RestartSec=5\n\n\
         [Install]\n\
         WantedBy=multi-user.target\n"
    )
}

pub async fn install_systemd_unit(ssh: &mut SshSession, unit_name: &str, unit_contents: &str) -> Result<()> {
    let escaped = unit_contents.replace('\'', "'\\''");
    ssh.exec(&format!(
        "echo '{escaped}' | sudo tee /etc/systemd/system/{unit_name}.service > /dev/null"
    ))
    .await?;
    ssh.exec("sudo systemctl daemon-reload").await?;
    ssh.exec(&format!("sudo systemctl enable {unit_name}")).await?;
    Ok(())
}

pub async fn control_instance(ssh: &mut SshSession, unit_name: &str, action: &str) -> Result<String> {
    // action: "start" | "stop" | "restart"
    ssh.exec(&format!("sudo systemctl {action} {unit_name}")).await
}
