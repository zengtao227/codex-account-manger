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

// ── OAuth Constants (matches openai/codex CLI) ────────────────────────────
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE: &str = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const REDIRECT_PORT: u16 = 1455;
const REDIRECT_URI: &str = "http://127.0.0.1:1455/auth/callback";
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

/// Read ~/.codex/auth.json
#[tauri::command]
fn read_current_auth() -> Result<String, String> {
    let path = auth_path();
    if !path.exists() { return Ok(String::new()); }
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

/// Write content to ~/.codex/auth.json (with backup)
#[tauri::command]
fn write_auth(content: String) -> Result<(), String> {
    let dir = codex_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let path = auth_path();
    if path.exists() {
        let _ = fs::copy(&path, dir.join("auth.json.bak"));
    }
    if !content.is_empty() {
        serde_json::from_str::<Value>(&content)
            .map_err(|e| format!("JSON 无效: {e}"))?;
    }
    fs::write(&path, &content).map_err(|e| format!("写入失败: {e}"))?;
    log::info!("auth.json written ({} bytes)", content.len());
    Ok(())
}

/// Full PKCE OAuth flow:
///  1. Generate code_verifier + code_challenge
///  2. Start local HTTP callback server on port 1455
///  3. Open system browser to auth URL
///  4. Wait for callback (max 120s), extract code
///  5. Exchange code for tokens via POST to token endpoint
///  6. Write auth.json, return content to frontend
#[tauri::command]
fn start_oauth_login() -> Result<String, String> {
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

    // 3. Start local callback server BEFORE opening browser
    let listener = TcpListener::bind(format!("127.0.0.1:{REDIRECT_PORT}"))
        .map_err(|e| format!("无法监听回调端口 {REDIRECT_PORT}: {e}\n（请检查端口是否被占用）"))?;
    listener.set_nonblocking(false)
        .map_err(|e| format!("设置监听模式失败: {e}"))?;

    // 4. Open browser
    Command::new("open")
        .arg(&auth_url)
        .spawn()
        .map_err(|e| format!("打开浏览器失败: {e}"))?;

    log::info!("Browser opened for OAuth. Waiting for callback...");

    // 5. Wait for callback request (timeout 120s)
    listener.set_nonblocking(false).ok();
    let start = Instant::now();

    // Set accept timeout via a background thread
    let code = {
        let timeout = Duration::from_secs(120);
        let mut auth_code: Option<String> = None;

        while start.elapsed() < timeout {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut request_buf = [0u8; 4096];
                    let n = stream.read(&mut request_buf).unwrap_or(0);
                    let request_str = String::from_utf8_lossy(&request_buf[..n]);

                    // Parse GET /auth/callback?code=...&state=...
                    if let Some(code) = extract_query_param(&request_str, "code") {
                        let extracted_state = extract_query_param(&request_str, "state")
                            .unwrap_or_default();

                        // Verify state to prevent CSRF
                        if extracted_state != state {
                            let _ = stream.write_all(html_response("❌ State mismatch. CSRF detected.").as_bytes());
                            return Err("OAuth state 验证失败".to_string());
                        }

                        // Send success page to browser
                        let _ = stream.write_all(html_response(
                            "✅ 授权成功！回到 Codex Manager 完成设置。"
                        ).as_bytes());

                        auth_code = Some(code);
                        break;
                    } else {
                        // Unknown request (e.g. favicon)
                        let _ = stream.write_all(html_response("等待授权...").as_bytes());
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    return Err(format!("监听错误: {e}"));
                }
            }
        }
        auth_code.ok_or_else(|| "登录超时（120秒），请重试".to_string())?
    };

    log::info!("Got auth code, exchanging for tokens...");

    // 6. Exchange code for tokens
    let token_response = ureq::post(TOKEN_URL)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&format!(
            "grant_type=authorization_code\
            &code={code}\
            &redirect_uri={}\
            &client_id={CLIENT_ID}\
            &code_verifier={code_verifier}",
            urlencoding::encode(REDIRECT_URI),
        ))
        .map_err(|e| format!("Token 交换失败: {e}"))?;

    let token_json: Value = token_response
        .into_json()
        .map_err(|e| format!("解析 Token 响应失败: {e}"))?;

    if let Some(err) = token_json.get("error") {
        return Err(format!("OAuth 错误: {err}"));
    }

    // 7. Build auth.json in Codex CLI format
    let access_token = token_json.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("响应中缺少 access_token")?;
    let refresh_token = token_json.get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let auth_content = serde_json::json!({
        "token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "expires_in": token_json.get("expires_in").unwrap_or(&Value::Null),
        "client_id": CLIENT_ID,
        "scope": SCOPE,
    });

    let auth_str = serde_json::to_string_pretty(&auth_content)
        .map_err(|e| format!("序列化失败: {e}"))?;

    // 8. Write to ~/.codex/auth.json
    let dir = codex_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    if auth_path().exists() {
        let _ = fs::copy(auth_path(), dir.join("auth.json.bak"));
    }
    fs::write(auth_path(), &auth_str)
        .map_err(|e| format!("写入 auth.json 失败: {e}"))?;

    log::info!("OAuth login successful, auth.json written");
    Ok(auth_str)
}

/// Check if ~/.codex/auth.json exists
#[tauri::command]
fn auth_exists() -> bool {
    auth_path().exists()
}

/// Get codex dir path string
#[tauri::command]
fn get_codex_dir() -> String {
    codex_dir().to_string_lossy().to_string()
}

/// Open ~/.codex in Finder
#[tauri::command]
fn open_codex_dir() -> Result<(), String> {
    Command::new("open").arg(codex_dir()).spawn()
        .map_err(|e| format!("打开失败: {e}"))?;
    Ok(())
}

// ── Helper Functions ──────────────────────────────────────────────────────

fn extract_query_param(request: &str, key: &str) -> Option<String> {
    // Parse from GET line: "GET /auth/callback?code=xxx&state=yyy HTTP/1.1"
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
        <!DOCTYPE html><html><head>\
        <meta charset='utf-8'>\
        <title>Codex Manager</title>\
        <style>body{{font-family:-apple-system,sans-serif;display:flex;align-items:center;\
        justify-content:center;height:100vh;margin:0;background:#0A0E13;color:#F0F4F8;font-size:18px;}}\
        .msg{{text-align:center;padding:40px;background:#161D27;border-radius:16px;\
        border:1px solid rgba(255,255,255,0.08);}}</style>\
        </head><body><div class='msg'>{message}<br/>\
        <span style='font-size:13px;color:#8C9DB5;margin-top:8px;display:block'>\
        可以关闭此标签页</span></div></body></html>"
    )
}

// ── Entry Point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_current_auth,
            write_auth,
            start_oauth_login,
            auth_exists,
            get_codex_dir,
            open_codex_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
