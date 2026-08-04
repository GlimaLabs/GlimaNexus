use anyhow::{anyhow, Result};
use russh::client::{self, Handle};
use russh::ChannelMsg;
use russh_keys::key;
use std::sync::Arc;
use std::time::Duration;

/// A hung TCP connect/handshake (e.g. remote not reachable yet, firewall dropping packets)
/// would otherwise block forever - and since connections are held behind a per-server lock,
/// one stuck attempt could block every future attempt too. Give up and let the caller retry.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Same idea for individual commands: if a pooled connection has gone silently dead (e.g.
/// the remote host disappeared without a clean TCP close), a channel.wait() can hang forever.
const EXEC_TIMEOUT: Duration = Duration::from_secs(20);

struct ClientHandler;

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(&mut self, _server_public_key: &key::PublicKey) -> Result<bool, Self::Error> {
        // TODO(v0.1.1): pin/verify known_hosts instead of trust-on-first-use.
        Ok(true)
    }
}

pub struct SshSession {
    handle: Handle<ClientHandler>,
}

impl SshSession {
    pub async fn connect_password(host: &str, port: u16, username: &str, password: &str) -> Result<Self> {
        // Fresh TCP connects sometimes get an immediate "connection refused" through
        // transient local network hiccups (e.g. WSL2's localhost port-forwarding relay
        // blipping) even though the remote is fine a moment later - a couple of quick
        // retries absorb that instead of failing the whole action on a one-off glitch.
        let mut last_err = None;
        for attempt in 0..3 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
            match tokio::time::timeout(CONNECT_TIMEOUT, Self::connect_password_inner(host, port, username, password)).await {
                Ok(Ok(session)) => return Ok(session),
                Ok(Err(e)) => last_err = Some(e),
                Err(_) => last_err = Some(anyhow!("Zeitüberschreitung beim Verbindungsaufbau (Server nicht erreichbar?)")),
            }
        }
        Err(last_err.unwrap_or_else(|| anyhow!("Verbindung fehlgeschlagen")))
    }

    async fn connect_password_inner(host: &str, port: u16, username: &str, password: &str) -> Result<Self> {
        let config = Arc::new(client::Config::default());
        let mut handle = client::connect(config, (host, port), ClientHandler).await?;
        let authenticated = handle.authenticate_password(username, password).await?;
        if !authenticated {
            return Err(anyhow!("SSH-Authentifizierung fehlgeschlagen"));
        }
        Ok(Self { handle })
    }

    /// Runs a single command to completion, returning combined stdout.
    pub async fn exec(&mut self, command: &str) -> Result<String> {
        tokio::time::timeout(EXEC_TIMEOUT, self.exec_inner(command))
            .await
            .map_err(|_| anyhow!("Zeitüberschreitung beim Ausführen des Befehls (Verbindung tot?)"))?
    }

    async fn exec_inner(&mut self, command: &str) -> Result<String> {
        let mut channel = self.handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        let mut output = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => output.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => output.extend_from_slice(&data),
                ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }
        Ok(String::from_utf8_lossy(&output).to_string())
    }

    /// Runs a command, writing `stdin_data` to it right after starting (e.g. to answer
    /// a `sudo -S` password prompt) before reading the combined output to completion.
    pub async fn exec_with_stdin(&mut self, command: &str, stdin_data: &[u8]) -> Result<String> {
        let mut channel = self.handle.channel_open_session().await?;
        channel.exec(true, command).await?;
        channel.data(stdin_data).await?;
        channel.eof().await?;

        let mut output = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => output.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => output.extend_from_slice(&data),
                ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }
        Ok(String::from_utf8_lossy(&output).to_string())
    }

    /// Runs a (potentially long-lived / follow-mode) command, invoking `on_line` for every
    /// complete line as data arrives, so the caller can forward it live (e.g. to the UI)
    /// instead of waiting for the whole process to finish.
    pub async fn exec_stream_lines<F>(&mut self, command: &str, mut on_line: F) -> Result<()>
    where
        F: FnMut(String) + Send,
    {
        let mut channel = self.handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        let mut buffer = Vec::new();
        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    buffer.extend_from_slice(&data);
                    while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
                        let line: Vec<u8> = buffer.drain(..=pos).collect();
                        let text = String::from_utf8_lossy(&line).trim_end().to_string();
                        on_line(text);
                    }
                }
                ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }
        if !buffer.is_empty() {
            on_line(String::from_utf8_lossy(&buffer).trim_end().to_string());
        }
        Ok(())
    }
}
