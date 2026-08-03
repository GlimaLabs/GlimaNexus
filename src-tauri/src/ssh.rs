use anyhow::{anyhow, Result};
use russh::client::{self, Handle};
use russh::ChannelMsg;
use russh_keys::key;
use std::sync::Arc;

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
}
