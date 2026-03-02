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

/// Read ~/.codex/auth.json
#[tauri::command]
pub fn read_current_auth() -> Result<String, String> {
    let path = auth_path();
    if !path.exists() { return Ok(String::new()); }
    fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

/// Write content to ~/.codex/auth.json (with backup)
#[tauri::command]
pub fn write_auth(content: String) -> Result<(), String> {
    let dir = codex_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let path = auth_path();
    // Backup existing file
    if path.exists() {
        let _ = fs::copy(&path, dir.join("auth.json.bak"));
    }
    // Validate JSON before writing
    if !content.is_empty() {
        serde_json::from_str::<Value>(&content).map_err(|e| format!("JSON 无效: {e}"))?;
    }
    fs::write(&path, &content).map_err(|e| format!("写入失败: {e}"))?;
    log::info!("auth.json written ({} bytes)", content.len());
    Ok(())
}

/// Full PKCE OAuth flow:
///  1. Generate PKCE verifier/challenge
///  2. Start local TCP callback server on port 1455
///  3. Open default browser to OpenAI auth URL
///  4. Wait for callback, extract authorization code
///  5. Exchange code for tokens
///  6. Save COMPLETE response as auth.json
///  7. Return the full JSON to frontend
#[tauri::command]
pub async fn start_openai_oauth_login() -> Result<String, String> {
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

    // 3-7: Run ENTIRE OAuth flow in a background thread to never block UI
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        // 3. Start local callback server
        let listener = TcpListener::bind("127.0.0.1:1455")
            .map_err(|e| format!("端口 1455 绑定失败: {e}"))?;
        listener.set_nonblocking(true).ok();

        // 4. Open browser
        Command::new("open").arg(&auth_url).spawn().ok();

        // 5. Poll for callback (max 120s)
        let start = Instant::now();
        let mut auth_code_result: Option<String> = None;

        while start.elapsed() < Duration::from_secs(120) {
            if let Ok((mut stream, _)) = listener.accept() {
                stream.set_read_timeout(Some(Duration::from_millis(1000))).ok();
                let mut buf = [0u8; 4096];
                if let Ok(n) = stream.read(&mut buf) {
                    let req = String::from_utf8_lossy(&buf[..n]);
                    if let Some(code) = extract_param(&req, "code") {
                        let extracted_state = extract_param(&req, "state").unwrap_or_default();
                        if extracted_state != state {
                            let _ = stream.write_all(
                                html_response("❌ 安全验证失败").as_bytes()
                            );
                            return Err("State 验证失败".to_string());
                        }
                        // Respond and immediately close
                        let _ = stream.write_all(
                            html_response("✅ 授权成功！").as_bytes()
                        );
                        auth_code_result = Some(code);
                        break;
                    }
                }
            }
            thread::sleep(Duration::from_millis(200));
        }

        // Close the browser callback tab via osascript (best effort)
        let _ = Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to keystroke \"w\" using command down")
            .spawn();

        let code = auth_code_result.ok_or("登录超时（120秒），请重试")?;

        // 6. Exchange code for tokens
        let token_res = ureq::post(TOKEN_URL)
            .set("Content-Type", "application/x-www-form-urlencoded")
            .send_string(&format!(
                "grant_type=authorization_code\
                &code={code}\
                &redirect_uri={}\
                &client_id={CLIENT_ID}\
                &code_verifier={code_verifier}",
                urlencoding::encode(REDIRECT_URI)
            ))
            .map_err(|e| format!("Token 交换失败: {e}"))?;

        let token_json: Value = token_res.into_json()
            .map_err(|e| format!("解析 Token 响应失败: {e}"))?;

        if let Some(err) = token_json.get("error") {
            return Err(format!("OpenAI 返回错误: {}", err));
        }

        // 7. Convert to Codex CLI AuthDotJson format
        let access_token = token_json.get("access_token").and_then(|v| v.as_str())
            .ok_or("响应中缺少 access_token")?;
        let refresh_token = token_json.get("refresh_token").and_then(|v| v.as_str())
            .unwrap_or("");
        let id_token_raw = token_json.get("id_token").and_then(|v| v.as_str())
            .unwrap_or("");
        let account_id = extract_jwt_claim(access_token, "https://api.openai.com/auth", "chatgpt_account_id");

        let auth_dot_json = serde_json::json!({
            "auth_mode": "chatgpt",
            "tokens": {
                "id_token": id_token_raw,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "account_id": account_id,
            },
            "last_refresh": chrono_now_rfc3339(),
        });

        let auth_str = serde_json::to_string_pretty(&auth_dot_json)
            .map_err(|e| format!("序列化失败: {e}"))?;

        // Write to ~/.codex/auth.json
        let dir = codex_dir();
        fs::create_dir_all(&dir).ok();
        if auth_path().exists() {
            let _ = fs::copy(auth_path(), dir.join("auth.json.bak"));
        }
        fs::write(auth_path(), &auth_str)
            .map_err(|e| format!("写入 auth.json 失败: {e}"))?;

        // 8. Auto-restart Codex IDE
        let _ = Command::new("pkill").arg("-x").arg("Codex").output();
        thread::sleep(Duration::from_millis(800));
        let _ = Command::new("open").arg("-a").arg("Codex").spawn();

        Ok(auth_str)
    }).await.map_err(|e| format!("内部错误: {e}"))?;

    result
}

/// Check if auth.json exists
#[tauri::command]
pub fn auth_exists() -> bool { auth_path().exists() }

/// Return codex dir path
#[tauri::command]
pub fn get_codex_dir() -> String { codex_dir().to_string_lossy().to_string() }

/// Open codex dir in Finder
#[tauri::command]
pub fn open_codex_dir() -> Result<(), String> {
    Command::new("open").arg(codex_dir()).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Restart Codex IDE so it re-reads auth.json
#[tauri::command]
pub fn restart_codex_ide() -> Result<String, String> {
    // Kill running Codex IDE
    let kill_result = Command::new("pkill").arg("-x").arg("Codex").output();
    let was_running = match &kill_result {
        Ok(output) => output.status.success(),
        Err(_) => false,
    };

    if was_running {
        // Wait a moment for clean shutdown
        thread::sleep(Duration::from_millis(800));
    }

    // Relaunch Codex IDE
    let launched = Command::new("open").arg("-a").arg("Codex").spawn().is_ok();

    if was_running && launched {
        Ok("Codex IDE 已重启".to_string())
    } else if launched {
        Ok("Codex IDE 已启动".to_string())
    } else {
        Err("无法启动 Codex IDE".to_string())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

fn html_response(message: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n\
        <!DOCTYPE html><html><head><meta charset='utf-8'><title>Codex Manager</title>\
        <script>setTimeout(function(){{window.close()}},800)</script>\
        <style>\
        body{{font-family:-apple-system,sans-serif;display:flex;align-items:center;\
        justify-content:center;height:100vh;margin:0;background:#0A0E13;color:#F0F4F8;}}\
        .box{{text-align:center;padding:48px;background:#161D27;border-radius:16px;\
        border:1px solid rgba(255,255,255,0.08);max-width:400px;}}\
        </style></head>\
        <body><div class='box'>\
        <div style='font-size:20px;margin-bottom:12px'>{message}</div>\
        </div></body></html>"
    )
}

/// Parse a JWT (without verification) and extract a nested claim value.
/// e.g. extract_jwt_claim(token, "https://api.openai.com/auth", "chatgpt_account_id")
fn extract_jwt_claim(jwt: &str, namespace: &str, key: &str) -> Option<String> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() < 2 { return None; }
    // JWT payload is base64url encoded (part index 1)
    let payload = parts[1];
    // Add padding if needed
    let padded = match payload.len() % 4 {
        2 => format!("{payload}=="),
        3 => format!("{payload}="),
        _ => payload.to_string(),
    };
    let decoded = base64ct::Base64UrlUnpadded::decode_vec(payload)
        .or_else(|_| {
            // Try with standard base64url with padding
            use base64ct::Encoding;
            let bytes = padded.as_bytes();
            let mut buf = vec![0u8; bytes.len()];
            base64ct::Base64Url::decode(bytes, &mut buf).map(|s| s.to_vec())
        })
        .ok()?;
    let claims: Value = serde_json::from_slice(&decoded).ok()?;
    claims.get(namespace)?.get(key)?.as_str().map(|s| s.to_string())
}

/// Generate current UTC timestamp in RFC3339 format (for last_refresh field)
fn chrono_now_rfc3339() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    // Simple RFC3339 without chrono dependency
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let h = time_secs / 3600;
    let m = (time_secs % 3600) / 60;
    let s = time_secs % 60;

    // Calculate date from days since epoch (simplified)
    let mut y = 1970i64;
    let mut remaining_days = days as i64;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining_days < days_in_year { break; }
        remaining_days -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if remaining_days < md as i64 { mo = i; break; }
        remaining_days -= md as i64;
    }

    format!("{y:04}-{:02}-{:02}T{h:02}:{m:02}:{s:02}Z", mo + 1, remaining_days + 1)
}

