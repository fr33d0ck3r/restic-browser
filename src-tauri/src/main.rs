
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    env, fs,
    io::IsTerminal,
    path::{self, PathBuf},
    process,
};

use simplelog::{
    ColorChoice, CombinedLogger, Config, LevelFilter, SharedLogger, TermLogger, TerminalMode,
    WriteLogger,
};

use which::which;
#[cfg(target_os = "macos")]
use which::which_in;

use tauri::Manager;
use tauri_plugin_cli::CliExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_window_state::StateFlags;


mod app;
mod dep_check;
mod restic;


fn show_message_and_exit(app: &tauri::App, message: String, exit_code: i32) -> ! {
    if initialize_console() {
        
        if exit_code == 0 {
            println!("{}", message);
        } else {
            eprintln!("{}", message);
        }
        std::process::exit(exit_code);
    } else {
        
        app.app_handle().dialog().message(message).blocking_show();
        std::process::exit(exit_code);
    }
}


fn initialize_console() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
        
        let _ = unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
    }
    std::io::stdin().is_terminal()
}


fn initialize_logger(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    
    let mut loggers: Vec<Box<dyn SharedLogger>> = vec![TermLogger::new(
        LevelFilter::Warn,
        Config::default(),
        TerminalMode::Mixed,
        ColorChoice::Auto,
    )];
    
    let log_file_result: Result<Box<WriteLogger<std::fs::File>>, Box<dyn std::error::Error>> = {
        let log_path = app.path().app_log_dir()?;
        std::fs::create_dir_all(log_path.as_path())?;
        let mut log_file_path = log_path.clone();
        log_file_path.push("App.log");
        Ok(WriteLogger::new(
            LevelFilter::Info,
            Config::default(),
            std::fs::File::create(log_file_path.as_path())?,
        ))
    };
    match log_file_result {
        Err(err) => eprintln!("Failed to create log file: {err}"),
        Ok(logger) => loggers.push(logger),
    }
    
    CombinedLogger::init(loggers).unwrap_or_else(|err| eprintln!("Failed to create logger: {err}"));
    Ok(())
}


fn initialize_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    
    initialize_logger(app)?;

    
    dep_check::set_app_handle(app.app_handle().clone());

    if let Ok(config_dir) = app.path().app_config_dir() {
        let state_file = config_dir.join(".window-state.json");
        if state_file.exists() {
            log::info!("Removing stale window state file: {:?}", state_file);
            let _ = fs::remove_file(&state_file);
        }
    }

    
    let arg_matches = app.cli().matches()?;

    
    let verbose_mode = arg_matches.args.contains_key("verbose");
    if verbose_mode {
        log::info!("=== VERBOSE MODE ENABLED ===");
        
        log::info!("Environment variables:");
        log::info!(
            "  RESTIC_REPOSITORY: {}",
            env::var("RESTIC_REPOSITORY")
                .map(|s| if s.is_empty() {
                    "<empty>".to_string()
                } else {
                    format!("<set> {}", s)
                })
                .unwrap_or_else(|_| "<not set>".to_string())
        );
        log::info!(
            "  RESTIC_PASSWORD: {}",
            if env::var("RESTIC_PASSWORD").is_ok() {
                "<set> [hidden]"
            } else {
                "<not set>"
            }
        );
        log::info!(
            "  AWS_ACCESS_KEY_ID: {}",
            if env::var("AWS_ACCESS_KEY_ID").is_ok() {
                "<set> [hidden]"
            } else {
                "<not set>"
            }
        );
        log::info!(
            "  AWS_SECRET_ACCESS_KEY: {}",
            if env::var("AWS_SECRET_ACCESS_KEY").is_ok() {
                "<set> [hidden]"
            } else {
                "<not set>"
            }
        );
        log::info!(
            "  RESTIC_PASSWORD_FILE: {}",
            env::var("RESTIC_PASSWORD_FILE").unwrap_or_else(|_| "<not set>".to_string())
        );
        log::info!(
            "  RESTIC_PASSWORD_COMMAND: {}",
            env::var("RESTIC_PASSWORD_COMMAND").unwrap_or_else(|_| "<not set>".to_string())
        );
    }
    if let Some(arg) = arg_matches.args.get("help") {
        let message = arg.value.as_str().expect("Invalid help string").to_string();
        log::info!("Dumping arg help and exiting...");
        show_message_and_exit(app, message, 0);
    } else if arg_matches.args.contains_key("version") {
        let message = format!(
            "{} v{}",
            app.config()
                .product_name
                .clone()
                .unwrap_or("Restic Browser".to_string()),
            app.config()
                .version
                .clone()
                .unwrap_or("[Unknown version]".to_string())
        );
        log::info!("Dumping version and exiting...");
        show_message_and_exit(app, message, 0);
    }

    
    if let Err(err) = fix_path_env::fix() {
        log::warn!("Failed to update PATH env: {}", err);
    }

    
    #[cfg(target_os = "macos")]
    let common_path = format!(
        "/usr/local/bin:/opt/local/bin:/opt/homebrew/bin:{}/bin",
        env::var("HOME").unwrap_or("~".into())
    );

    
    let mut restic_path = None;
    let mut rclone_path = None;

    if let Some(arg) = arg_matches.args.get("restic") {
        restic_path = arg.value.as_str().map(PathBuf::from);
        if let Some(ref path) = restic_path {
            log::info!("Got restic as arg {}", path.to_string_lossy());
        }
    }
    if let Some(arg) = arg_matches.args.get("rclone") {
        rclone_path = arg.value.as_str().map(PathBuf::from);
        if let Some(ref path) = rclone_path {
            log::info!("Got rclone as arg {}", path.to_string_lossy());
        }
    }
    if restic_path.is_none() {
        if let Ok(restic) = which(restic::RESTIC_EXECTUABLE_NAME) {
            restic_path = Some(restic.clone());
            log::info!(
                "Found restic binary in PATH at '{}'",
                restic.to_string_lossy()
            );
        }
        #[cfg(target_os = "macos")]
        if restic_path.is_none() {
            if let Ok(restic) = which_in(
                restic::RESTIC_EXECTUABLE_NAME,
                Some(common_path.clone()),
                env::current_dir().unwrap_or("/".into()),
            ) {
                restic_path = Some(restic.clone());
                log::info!(
                    "Found restic binary in common PATH at '{}'",
                    restic.to_string_lossy()
                );
            }
        }
        if restic_path.is_none() {
            log::warn!("Failed to resolve restic binary");
        }
    }

    
    
    if restic_path.is_none() {
        let msg = "Restic is not installed or not found in PATH.\n\n\
                   Please install restic, then start the program again.\n\n\
                   Click OK to exit.";
        log::error!("{msg}");
        show_message_and_exit(app, msg.to_string(), 1);
    }

    #[cfg(target_os = "macos")]
    
    if rclone_path.is_none() && which(restic::RCLONE_EXECTUABLE_NAME).is_err() {
        if let Ok(rclone) = which_in(
            restic::RCLONE_EXECTUABLE_NAME,
            Some(common_path),
            env::current_dir().unwrap_or("/".into()),
        ) {
            rclone_path = Some(rclone.clone());
            log::info!(
                "Found rclone binary in common PATH at '{}'",
                rclone.to_string_lossy()
            );
        }
    }

    
    let mut location = restic::Location::new_from_args(
        arg_matches
            .args
            .into_iter()
            .map(|(k, v)| (k, v.value.as_str().map(String::from)))
            .collect::<HashMap<_, _>>(),
    );
    if location.path.is_empty() {
        location = restic::Location::new_from_env();
    }

    
    let mut temp_dir = path::Path::new(&env::temp_dir())
        .join(app.package_info().name.clone() + "_" + &process::id().to_string());
    if !temp_dir.exists() {
        if let Err(err) = fs::create_dir_all(temp_dir.clone()) {
            log::warn!("Failed to create temp app directory: {err}");
            temp_dir = env::temp_dir();
        }
    }

    
    app.manage(app::SharedAppState::new(app::AppState::new(
        restic::Program::new(restic_path.unwrap_or_default(), rclone_path),
        location,
        temp_dir,
    )));

    log::info!("Starting application...");
    Ok(())
}


fn finalize_app(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Closing application...");
    
    
    
    let shared = app.state::<app::SharedAppState>();
    shared.shutdown();
    
    let state = shared.get()?;
    fs::remove_dir_all(state.temp_dir())?;
    Ok(())
}


#[tauri::command]
fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!("[FRONTEND] {}", message),
        "warn" => log::warn!("[FRONTEND] {}", message),
        _ => log::info!("[FRONTEND] {}", message),
    }
}


#[tauri::command]
fn show_app_window(app_window: tauri::Window) -> Result<(), String> {
    
    
    app_window.show().map_err(|err| err.to_string())?;
    let _ = app_window.set_focus();
    Ok(())
}


fn create_application() -> Result<tauri::App, Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(initialize_app)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                finalize_app(app).unwrap_or_else(|err| {
                    log::info!("Finalizing application failed with error: {err}");
                });
            }
        })
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    StateFlags::all()
                        & StateFlags::VISIBLE.complement()
                        & StateFlags::DECORATIONS.complement(),
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            show_app_window,
            app::supported_repo_location_types,
            app::default_repo_location,
            app::open_file_or_url,
            app::verify_restic_path,
            app::open_repository,
            app::get_files,
            app::get_snapshots,
            app::dump_file,
            app::dump_file_to_temp,
            app::restore_file,
            app::restore_files,
            app::restore_snapshot,
            app::forget_snapshots,
            
            app::get_repo_stats,
            app::check_repository,
            app::unlock_repository,
            app::prune_repository,
            
            app::diff_snapshots,
            app::create_backup,
            
            app::search_files
        ])
        .build(tauri::generate_context!())
        .map_err(Into::<Box<dyn std::error::Error>>::into)
}


fn main() {
    
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        
        
        
    }

    match create_application() {
        Ok(app) => {
            app.run(|_app, _event| {});
        }
        Err(err) => {
            panic!("{}", err);
        }
    }
}
