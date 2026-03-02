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

// ── OAuth Constants (Strict match with official Codex CLI) ────────────────
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_PORT: u16 = 1455;
// Use MUST be localhost (not 127.0.0.1) for most OAuth providers
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

// ── PKCE Helpers ──────────────────────────────────────────────────────────
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

// ── Tauri Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn read_current_auth() -> Result<String, String> {
    let path = auth_path();
    if !path.exists() { return Ok(String::new()); }
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
fn write_auth(content: String) -> Result<(), String> {
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

/// Full PKCE OAuth flow (Async to prevent UI freezing)
#[tauri::command]
pub async fn start_oauth_login() -> Result<String, String> {
    // 1. Generate PKCE
    let verifier_bytes = random_bytes(32);
    let code_verifier = base64url(&verifier_bytes);
    let code_challenge = sha256_base64url(&code_verifier);
    let state = base64url(&random_bytes(16));

    // 2. Build authorization URL
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

    // 3. Start local callback server
    // Binding to 0.0.0.0 or 127.0.0.1 is fine, but Redirect URI must be localhost
    let listener = TcpListener::bind(format!("127.0.0.1:{REDIRECT_PORT}"))
        .map_err(|e| format!("端口 {REDIRECT_PORT} 绑定失败: {e}"))?;
    
    // Set a very short read timeout so we can check for thread termination/timeout
    listener.set_nonblocking(true)
        .map_err(|e| format!("无法设置非阻塞模式: {e}"))?;

    // 4. Open default system browser
    Command::new("open").arg(&auth_url).spawn()
        .map_err(|e| format!("无法打开浏览器: {e}"))?;

    log::info!("Waiting for OAuth callback at {}...", REDIRECT_URI);

    // 5. Poll for callback (Async-friendly polling)
    let start = Instant::now();
    let timeout = Duration::from_secs(120);
    let mut auth_code: Option<String> = None;

    while start.elapsed() < timeout {
        // Accept incoming connection
        if let Ok((mut stream, _)) = listener.accept() {
            // Set a small timeout for reading the request
            stream.set_read_timeout(Some(Duration::from_millis(1000))).ok();
            
            let mut request_buf = [0u8; 4096];
            if let Ok(n) = stream.read(&mut request_buf) {
                let request_str = String::from_utf8_lossy(&request_buf[..n]);

                if let Some(code) = extract_query_param(&request_str, "code") {
                    let extracted_state = extract_query_param(&request_str, "state").unwrap_or_default();

                    if extracted_state != state {
                        let _ = stream.write_all(html_response("❌ State mismatch. 请重试。").as_bytes());
                        return Err("安全验证 (State) 不匹配，请重试".to_string());
                    }

                    let _ = stream.write_all(html_response("✅ 授权成功！正在返回到应用...").as_bytes());
                    auth_code = Some(code);
                    break;
                }
            }
        }
        // Yield to other tasks so the app doesn't freeze
        thread::yield_now();
        thread::sleep(Duration::from_millis(200));
    }

    let code = auth_code.ok_or_else(|| "登录超时（120秒），请重试".to_string())?;

    // 6. Exchange code for tokens
    let token_res = ureq::post(TOKEN_URL)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&format!(
            "grant_type=authorization_code\
            &code={code}\
            &redirect_uri={}\
            &client_id={CLIENT_ID}\
            &code_verifier={code_verifier}",
            urlencoding::encode(REDIRECT_URI),
        ))
        .map_err(|e| format!("Token 交换失败 (网络错误): {e}"))?;

    let token_json: Value = token_res.into_json().map_err(|e| format!("JSON 解析失败: {e}"))?;

    if let Some(err) = token_json.get("error") {
        return Err(format!("OpenAI 返回错误: {}", err));
    }

    // 7. Success processing
    let access_token = token_json.get("access_token").and_then(|v| v.as_str())
        .ok_or("无效的响应：缺少 access_token")?;
    let refresh_token = token_json.get("refresh_token").and_then(|v| v.as_str()).unwrap_or("");
    
    let auth_content = serde_json::json!({
        "token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "client_id": CLIENT_ID,
    });

    let auth_str = serde_json::to_string_pretty(&auth_content).unwrap();
    
    // Save locally
    write_auth(auth_str.clone())?;

    Ok(auth_str)
}

#[tauri::command]
fn auth_exists() -> bool { auth_path().exists() }

#[tauri::command]
fn get_codex_dir() -> String { codex_dir().to_string_lossy().to_string() }

#[tauri::command]
fn open_codex_dir() -> Result<(), String> {
    Command::new("open").arg(codex_dir()).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_query_param(request: &str, key: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut parts = param.splitn(2, '=');
        let k = parts.next()?;
        let v = parts.next().unwrap_or("");
        if k == key {
            return Some(urlencoding::decode(v).unwrap_or_default().to_string());
        }
    }
    None
}

fn html_response(message: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
        <!DOCTYPE html><html><head><meta charset='utf-8'><title>Codex Manager</title>\
        <style>body{{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0A0E13;color:#F0F4F8;}}\
        .msg{{text-align:center;padding:40px;background:#161D27;border-radius:16px;border:1px solid rgba(255,255,255,0.08);}}</style>\
        </head><body><div class='msg'>{message}<br/><span style='font-size:12px;color:#8C9DB5;margin-top:12px;display:block'>可以关闭此标签页回到 App</span></div></body></html>"
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_current_auth, write_auth, start_oauth_login,
            auth_exists, get_codex_dir, open_codex_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
