use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};
use std::thread;
use std::io::{Read, Write};
use std::net::TcpListener;

use sha2::{Sha256, Digest};
use base64ct::{Base64UrlUnpadded, Encoding};
use rand::RngCore;
use serde_json::Value;

// ── OAuth Constants ───────────────────────────────────────────────────────
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_PORT: u16 = 1455;
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const SCOPE: &str = "openid profile email offline_access";

// ── File Helpers ──────────────────────────────────────────────────────────
fn codex_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".codex")
}

fn auth_path() -> PathBuf {
    codex_dir().join("auth.json")
}

fn random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

fn base64url(data: &[u8]) -> String {
    Base64UrlUnpadded::encode_string(data)
}

fn sha256_base64url(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    base64url(&hasher.finalize())
}

// ── Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn read_current_auth() -> Result<String, String> {
    let path = auth_path();
    if !path.exists() { return Ok(String::new()); }
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
pub fn write_auth(content: String) -> Result<(), String> {
    let dir = codex_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let path = auth_path();
    if path.exists() {
        let _ = fs::copy(&path, dir.join("auth.json.bak"));
    }
    if !content.is_empty() {
        serde_json::from_str::<Value>(&content).map_err(|e| format!("JSON 无效: {e}"))?;
    }
    fs::write(&path, &content).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn start_openai_oauth_login() -> Result<String, String> {
    let verifier_bytes = random_bytes(32);
    let code_verifier = base64url(&verifier_bytes);
    let code_challenge = sha256_base64url(&code_verifier);
    let state = base64url(&random_bytes(16));

    let auth_url = format!(
        "{AUTH_BASE}?response_type=code\
        &client_id={CLIENT_ID}\
        &redirect_uri={}\
        &scope={}\
        &code_challenge={code_challenge}\
        &code_challenge_method=S256\
        &state={state}",
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(SCOPE),
    );

    let listener = TcpListener::bind("127.0.0.1:1455")
        .map_err(|e| format!("端口绑定失败: {e}"))?;
    listener.set_nonblocking(true).ok();

    Command::new("open").arg(&auth_url).spawn().ok();

    let start = Instant::now();
    let mut auth_code = None;

    while start.elapsed() < Duration::from_secs(120) {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            if let Ok(n) = stream.read(&mut buf) {
                let req = String::from_utf8_lossy(&buf[..n]);
                if let Some(code) = extract_param(&req, "code") {
                    let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\nDone!");
                    auth_code = Some(code);
                    break;
                }
            }
        }
        thread::sleep(Duration::from_millis(200));
    }

    let code = auth_code.ok_or("Login timeout")?;
    let res = ureq::post(TOKEN_URL)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&format!(
            "grant_type=authorization_code&code={code}&redirect_uri={}&client_id={CLIENT_ID}&code_verifier={code_verifier}",
            urlencoding::encode(REDIRECT_URI)
        ))
        .map_err(|e| e.to_string())?;

    let json: Value = res.into_json().map_err(|e| e.to_string())?;
    let access_token = json.get("access_token").and_then(|v| v.as_str()).ok_or("No token")?;
    
    let out = serde_json::json!({
        "token": access_token,
        "token_type": "Bearer",
        "client_id": CLIENT_ID,
    }).to_string();

    Ok(out)
}

#[tauri::command]
pub fn auth_exists() -> bool { auth_path().exists() }

#[tauri::command]
pub fn get_codex_dir() -> String { codex_dir().to_string_lossy().to_string() }

#[tauri::command]
pub fn open_codex_dir() -> Result<(), String> {
    Command::new("open").arg(codex_dir()).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_param(req: &str, key: &str) -> Option<String> {
    let path = req.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for p in query.split('&') {
        let mut parts = p.splitn(2, '=');
        if parts.next() == Some(key) {
            return Some(urlencoding::decode(parts.next()?).ok()?.into_owned());
        }
    }
    None
}
