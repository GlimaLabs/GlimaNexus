use crate::ssh::SshSession;
use anyhow::Result;

/// Grants the SSH login user passwordless sudo, scoped to that one user via a dedicated
/// sudoers.d file. Required because our SSH commands run non-interactively (no TTY), so
/// `sudo` can never prompt for a password - without this, every privileged command
/// (creating the `gameserver` user, writing systemd units, starting services) silently
/// fails. Idempotent: safe to call on every connection, a no-op once already set up.
/// Uses the one password we already have to answer sudo's `-S` stdin prompt exactly once.
pub async fn ensure_passwordless_sudo(ssh: &mut SshSession, username: &str, password: &str) -> Result<()> {
    let check = ssh.exec("sudo -n true 2>&1; echo EXIT:$?").await?;
    if check.contains("EXIT:0") {
        return Ok(()); // already configured
    }

    // `sudo` must be the head of the exec'd process (no upstream pipe), otherwise whatever
    // feeds it becomes the thing consuming our piped stdin instead of sudo's password prompt.
    let script = format!(
        "sudo -S -p '' bash -c \"echo '{username} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/novanexus && chmod 440 /etc/sudoers.d/novanexus\""
    );
    let stdin = format!("{password}\n");
    let output = ssh.exec_with_stdin(&script, stdin.as_bytes()).await?;

    let verify = ssh.exec("sudo -n true 2>&1; echo EXIT:$?").await?;
    if !verify.contains("EXIT:0") {
        return Err(anyhow::anyhow!(
            "Konnte passwortloses Sudo nicht einrichten (Passwort falsch oder Nutzer nicht sudo-berechtigt): {output}"
        ));
    }
    Ok(())
}

/// Creates the isolated `gameserver` system user (no root execution of game processes)
/// and installs base dependencies (SteamCMD, Java, lib32 packages) on a fresh Ubuntu/Debian box.
pub async fn bootstrap_server(ssh: &mut SshSession) -> Result<()> {
    ssh.exec("id -u gameserver &>/dev/null || sudo useradd -m -s /bin/bash gameserver").await?;
    ssh.exec("sudo apt-get update -y").await?;
    ssh.exec(
        "sudo apt-get install -y curl wget tar unzip jq openjdk-21-jre-headless \
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
