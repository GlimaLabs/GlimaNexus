use anyhow::{anyhow, Result};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut byte = (value & 0x7F) as u8;
        value = ((value as u32) >> 7) as i32;
        if value != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if value == 0 {
            break;
        }
    }
}

async fn read_varint(stream: &mut TcpStream) -> Result<i32> {
    let mut result: i32 = 0;
    let mut shift = 0;
    loop {
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte).await?;
        result |= ((byte[0] & 0x7F) as i32) << shift;
        if byte[0] & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 35 {
            return Err(anyhow!("VarInt zu groß"));
        }
    }
    Ok(result)
}

/// Queries a Minecraft (Java Edition) server's live status via the vanilla Server List Ping
/// protocol - the exact same handshake the in-game multiplayer server list uses - so we can
/// read player counts without needing RCON enabled or any other server-side setup.
pub async fn ping(host: &str, port: u16) -> Result<(Option<u32>, Option<u32>)> {
    match timeout(Duration::from_secs(5), ping_inner(host, port)).await {
        Ok(result) => result,
        Err(_) => Err(anyhow!("Zeitüberschreitung beim Server-Ping")),
    }
}

async fn ping_inner(host: &str, port: u16) -> Result<(Option<u32>, Option<u32>)> {
    let mut stream = TcpStream::connect((host, port)).await?;

    // Handshake packet (id 0x00): protocol version, server address, server port, next state (1 = status)
    let mut handshake = Vec::new();
    handshake.push(0x00u8);
    write_varint(&mut handshake, -1);
    write_varint(&mut handshake, host.len() as i32);
    handshake.extend_from_slice(host.as_bytes());
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);
    let mut framed = Vec::new();
    write_varint(&mut framed, handshake.len() as i32);
    framed.extend_from_slice(&handshake);
    stream.write_all(&framed).await?;

    // Status request packet: length-prefixed, id 0x00, empty body.
    stream.write_all(&[0x01, 0x00]).await?;

    // Response: [packet length][packet id][json string length][json bytes]
    let _length = read_varint(&mut stream).await?;
    let _packet_id = read_varint(&mut stream).await?;
    let json_len = read_varint(&mut stream).await? as usize;
    if json_len > 10 * 1024 * 1024 {
        return Err(anyhow!("Unerwartet große Antwort vom Server"));
    }
    let mut json_buf = vec![0u8; json_len];
    stream.read_exact(&mut json_buf).await?;
    let json: Value = serde_json::from_slice(&json_buf)?;

    let online = json["players"]["online"].as_u64().map(|n| n as u32);
    let max = json["players"]["max"].as_u64().map(|n| n as u32);
    Ok((online, max))
}
