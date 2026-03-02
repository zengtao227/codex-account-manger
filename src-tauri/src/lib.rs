mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_current_auth,
            commands::write_auth,
            commands::start_openai_oauth_login,
            commands::auth_exists,
            commands::get_codex_dir,
            commands::open_codex_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
