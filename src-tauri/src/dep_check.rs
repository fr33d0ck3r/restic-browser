


use std::sync::OnceLock;

use tauri_plugin_dialog::DialogExt;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();


pub fn set_app_handle(handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(handle);
}


pub fn show_dialog_and_exit(message: &str) -> ! {
    log::error!("FATAL: {message}");
    if let Some(handle) = APP_HANDLE.get() {
        handle
            .dialog()
            .message(format!("{message}\n\nClick OK to exit."))
            .blocking_show();
    } else {
        eprintln!("FATAL: {message}");
    }
    std::process::exit(1);
}
