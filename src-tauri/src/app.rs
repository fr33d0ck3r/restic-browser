use std::{collections::HashSet, fs, path::PathBuf, sync::RwLock};

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use semver::Version;

use crate::restic::{self};


macro_rules! verify_state {
    ($app_state:expr) => {{
        let state = $app_state.get()?;
        state.verify_restic_path()?;
        state.verify_location()?;
        state
    }};
    ($app_state:expr, $snapshot_id:expr) => {{
        let state = $app_state.get()?;
        state.verify_restic_path()?;
        state.verify_location()?;
        state.verify_snapshot($snapshot_id)?;
        state
    }};
}


#[derive(Debug, Default, Clone)]
pub struct AppState {
    restic: restic::Program,
    location: restic::Location,
    snapshot_ids: HashSet<String>,
    temp_dir: PathBuf,
}

impl AppState {
    pub fn new(restic: restic::Program, location: restic::Location, temp_dir: PathBuf) -> Self {
        let snapshot_ids = HashSet::default();
        Self {
            restic,
            location,
            snapshot_ids,
            temp_dir,
        }
    }

    pub fn temp_dir(&self) -> &PathBuf {
        &self.temp_dir
    }

    pub fn verify_restic_path(&self) -> Result<(), String> {
        if self.restic.restic_path().as_os_str().is_empty() {
            return Err("No restic executable set".to_string());
        } else if !self.restic.restic_path().exists() {
            return Err(format!(
                "Restic executable '{}' does not exist or can not be accessed.",
                self.restic.restic_path().to_string_lossy()
            ));
        } else if self.restic.restic_version().is_none() {
            return Err(format!(
                "Failed to query restic version. Is '{}' a valid restic application?",
                self.restic.restic_path().to_string_lossy()
            ));
        }
        Ok(())
    }

    pub fn verify_location(&self) -> Result<(), String> {
        if self.location.path.is_empty() {
            return Err("No repository set".to_string());
        }
        
        
        if self.is_mount_point(&self.location.path) {
            return Err(format!(
                "Location '{}' appears to be a mount point, not a real repository path.\n\
                Please use the original repository URL (e.g., 's3:https://...') instead of the mount point.\n\
                Mount points are created by 'restic mount' for browsing only.",
                self.location.path
            ));
        }
        
        if self.location.allow_empty_password
            && self
                .restic
                .restic_version()
                .as_ref()
                .is_some_and(|v| v < &Version::new(0, 17, 0))
        {
            return Err(format!(
                "Empty passwords are only supported in restic >= 0.17.0.
Your installed binary is restic {}",
                self.restic
                    .restic_version()
                    .clone()
                    .unwrap_or_else(|| Version::new(0, 0, 0))
            ));
        }
        Ok(())
    }


fn is_mount_point(&self, path: &str) -> bool {
    
    let mount_prefixes = [
        "/dev/shm",
        "/tmp",
        "/media",
        "/mnt",
        "/run/user",
        "/var/tmp",
    ];
    
    let path_lower = path.to_lowercase();
    for prefix in &mount_prefixes {
        if path_lower.starts_with(prefix) {
            
            
            if !self.location.prefix.contains(":") && self.location.prefix != "rest" && self.location.prefix != "local" {
                return true;
            }
        }
    }
    
    
    if path.contains("/.m/") || path.contains("/restic-mount/") || path.contains("/restic_mount/") {
        return true;
    }
    
    
    if let Ok(metadata) = std::fs::metadata(path) {
        
        if metadata.is_dir() {
            if let Ok(mounts) = std::fs::read_to_string("/proc/mounts") {
                return mounts.lines().any(|line| {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let mount_point = parts[1];
                        let fs_type = parts.get(2).unwrap_or(&"");
                        
                        path == mount_point && (*fs_type == "fuse.restic" || fs_type.contains("fuse"))
                    } else {
                        false
                    }
                });
            }
        }
    }
    
    false
}

    pub fn verify_snapshot(&self, snapshot_id: &str) -> Result<(), String> {
        self.snapshot_ids
            .get(snapshot_id)
            .ok_or(format!("Can't resolve snapshot with id {snapshot_id}"))?;
        Ok(())
    }
}


pub struct SharedAppState {
    state: RwLock<AppState>,
}

impl SharedAppState {
    
    pub fn new(app_state: AppState) -> Self {
        Self {
            state: RwLock::new(app_state),
        }
    }

    
    pub fn get(&self) -> Result<AppState, String> {
        let state = self
            .state
            .try_read()
            .map_err(|err| format!("Failed to query app state: {err}"))?;
        Ok(state.clone())
    }

    
    fn update_restic(&self, restic: restic::Program) -> Result<(), String> {
        self.state
            .try_write()
            .map_err(|err| format!("Failed to update app state: {err}"))?
            .restic = restic;
        Ok(())
    }

    
    
    
    pub fn shutdown(&self) {
        log::info!("SharedAppState::shutdown: cleaning up subprocesses");
        let state = self.state.try_read();
        if let Ok(state) = state {
            state.restic.shutdown_webdav_bridge();
        } else {
            log::warn!("SharedAppState::shutdown: state locked, skipping webdav bridge cleanup");
        }
    }

    
    fn update_location(&self, location: restic::Location) -> Result<(), String> {
        self.state
            .try_write()
            .map_err(|err| format!("Failed to update app state: {err}"))?
            .location = location;
        Ok(())
    }

    
    fn update_snapshot_ids(&self, snapshot_ids: HashSet<String>) -> Result<(), String> {
        self.state
            .try_write()
            .map_err(|err| format!("Failed to update app state: {err}"))?
            .snapshot_ids = snapshot_ids;
        Ok(())
    }
}


#[tauri::command]
pub fn open_file_or_url(path: String) -> Result<(), String> {
    open::that(path).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn supported_repo_location_types() -> Result<Vec<restic::LocationTypeInfo>, String> {
    Ok(restic::supported_location_types())
}

#[tauri::command]
pub fn default_repo_location(
    app_state: tauri::State<SharedAppState>,
) -> Result<restic::Location, String> {
    Ok(app_state.get()?.location)
}

#[tauri::command(async)] 
pub fn verify_restic_path(
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<(), String> {
    
    let state = app_state.get()?;
    if !state.restic.restic_path().exists() {
        
        app_window
            .app_handle()
            .dialog()
            .message(
                "Failed to find restic program in your $PATH\n
Please select your installed restic binary manually in the following dialog.",
            )
            .blocking_show();
        let restic_path = app_window
            .app_handle()
            .dialog()
            .file()
            .set_title("Locate restic program")
            .set_file_name(restic::RESTIC_EXECTUABLE_NAME)
            .blocking_pick_file()
            .and_then(|f| f.into_path().ok());
        log::info!(
            "Got restic binary path '{}' from user",
            restic_path.clone().unwrap_or_default().display()
        );
        if let Some(restic_path) = restic_path {
            let rclone_path = state.restic.rclone_path().clone();
            app_state.update_restic(restic::Program::new(restic_path, rclone_path))?;
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn open_repository(
    location: restic::Location,
    app_state: tauri::State<SharedAppState>,
) -> Result<(), String> {
    log::info!(
        "Opening repository: prefix='{}', path='{}', credentials={}, password={}",
        location.prefix,
        location.path,
        location.credentials.len(),
        if location.password.is_empty() {
            "empty"
        } else {
            "set"
        }
    );
    let state = app_state.get()?;
    state.verify_restic_path()?;
    app_state.update_location(location)?;
    log::info!("Repository location updated successfully");
    Ok(())
}

#[tauri::command(async)]
pub fn get_snapshots(
    app_state: tauri::State<SharedAppState>,
) -> Result<Vec<restic::Snapshot>, String> {
    log::info!("get_snapshots: verifying state...");
    let state = verify_state!(app_state);

    log::info!(
        "Fetching snapshots from repository '{}:{}'...",
        state.location.prefix,
        state.location.path
    );
    let command_output = state
        .restic
        .run(&state.location, &["snapshots", "--json"], "fetch_snapshots")
        .map_err(|err| {
            log::error!("Failed to run restic snapshots: {}", err);
            err.to_string()
        })?;

    log::info!("Restic snapshots returned {} bytes", command_output.len());

    let snapshots =
        serde_json::from_str::<Vec<restic::Snapshot>>(&command_output).map_err(|err| {
            log::error!("Failed to parse snapshots JSON: {}", err);
            err.to_string()
        })?;

    log::info!("Parsed {} snapshots", snapshots.len());
    let snapshot_ids = snapshots.iter().map(|v| v.id.clone()).collect();
    app_state.update_snapshot_ids(snapshot_ids)?;

    Ok(snapshots)
}

#[tauri::command(async)]
pub fn get_files(
    snapshot_id: String,
    path: String,
    app_state: tauri::State<SharedAppState>,
) -> Result<Vec<restic::File>, String> {
    let state = verify_state!(app_state, &snapshot_id);

    
    
    let path = if path.is_empty() || !path.starts_with('/') {
        "/".to_string()
    } else {
        path
    };

    log::info!(
        "Fetching files from snapshot '{}' at path '{}'...",
        snapshot_id,
        path
    );

    let command_output = state
        .restic
        .run(
            &state.location,
            &["ls", &snapshot_id, "--json", "--long", &path],
            "fetch_files",
        )
        .map_err(|err| err.to_string())?;

    
    log::debug!("Raw restic ls output (first 500 chars): {}", &command_output.chars().take(500).collect::<String>());

    
    let files = command_output
        .lines()
        .skip(1)
        .filter(|line| !line.is_empty() && line.starts_with('{'))
        .map(|line| {
            
            if line.contains("\\u") || line.chars().any(|c| c as u32 > 127) {
                log::debug!("Unicode file JSON: {}", line);
            }
            serde_json::from_str::<restic::File>(line)
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(files)
}


fn compute_target_filename(target_dir: &PathBuf, file: &restic::File) -> PathBuf {
    if file.type_ == "dir" {
        target_dir.join(file.name.clone() + ".zip")
    } else {
        target_dir.join(file.name.clone())
    }
}


fn dump_file_internal(
    state: &AppState,
    snapshot_id: &str,
    file: &restic::File,
    target_file_name: &PathBuf,
    log_action: &str,
) -> Result<String, String> {
    let target_file = fs::File::create(target_file_name)
        .map_err(|err| format!("Failed to create target file: {err}"))?;

    log::info!(
        "{} file '{}' from snapshot '{}'...",
        log_action,
        file.name,
        snapshot_id
    );

    state
        .restic
        .run_redirected(
            &state.location,
            &["dump", "-a", "zip", snapshot_id, &file.path],
            target_file,
            None,
        )
        .map_err(|err| err.to_string())?;

    Ok(target_file_name.to_string_lossy().to_string())
}

#[tauri::command(async)]
pub fn dump_file(
    snapshot_id: String,
    file: restic::File,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<String, String> {
    let state = verify_state!(app_state, &snapshot_id);

    
    let folder = app_window
        .dialog()
        .file()
        .set_title("Please select a target directory")
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok());

    let target_folder = match folder {
        Some(f) => f,
        None => return Ok(String::new()), 
    };

    let target_file_name = compute_target_filename(&target_folder, &file);

    
    if target_file_name.exists() {
        let confirmed = app_window
            .dialog()
            .message(format!(
                "The target file '{}' already exists.\n\nAre you sure that you want to overwrite the existing file(s)?",
                target_file_name.display()
            ))
            .title("Overwrite existing file?")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
            .blocking_show();

        if !confirmed {
            return Err(format!(
                "target file '{}' already exists",
                target_file_name.display()
            ));
        }

        fs::remove_file(&target_file_name)
            .map_err(|err| format!("Failed to remove target file: {err}"))?;
    }

    dump_file_internal(&state, &snapshot_id, &file, &target_file_name, "Dumping")
}

#[tauri::command(async)]
pub fn dump_file_to_temp(
    snapshot_id: String,
    file: restic::File,
    app_state: tauri::State<SharedAppState>,
    _app_window: tauri::Window,
) -> Result<String, String> {
    let state = verify_state!(app_state, &snapshot_id);
    let target_file_name = compute_target_filename(state.temp_dir(), &file);
    dump_file_internal(&state, &snapshot_id, &file, &target_file_name, "Previewing")
}

#[tauri::command(async)]
pub fn restore_file(
    snapshot_id: String,
    file: restic::File,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<String, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;
    state.verify_snapshot(&snapshot_id)?;

    let folder = app_window
        .dialog()
        .file()
        .set_title("Select target directory")
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok());
    if folder.is_none() {
        return Ok(String::new());
    }
    let target_dir = folder.unwrap();

    log::info!("Restoring '{}' from snapshot '{}'...", file.path, snapshot_id);

    state
        .restic
        .run(
            &state.location,
            &[
                "restore",
                &snapshot_id,
                "--target",
                &target_dir.to_string_lossy(),
                "--include",
                &file.path,
            ],
            None,
        )
        .map_err(|err| err.to_string())?;

    
    
    let relative = file.path.trim_start_matches('/');
    let restored_at = target_dir.join(relative);
    if restored_at.exists() {
        let dest = target_dir.join(&file.name);
        if dest.exists() {
            if dest.is_dir() {
                std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
            }
        }
        std::fs::rename(&restored_at, &dest).map_err(|e| e.to_string())?;

        
        let mut parent = restored_at.parent();
        while let Some(p) = parent {
            if p == target_dir {
                break;
            }
            if std::fs::remove_dir(p).is_err() {
                break;
            }
            parent = p.parent();
        }
    }

    Ok(target_dir.to_string_lossy().to_string())
}

#[tauri::command(async)]
pub fn restore_files(
    snapshot_id: String,
    files: Vec<restic::File>,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<String, String> {
    if files.is_empty() {
        return Err("No files to restore".to_string());
    }

    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;
    state.verify_snapshot(&snapshot_id)?;

    let folder = app_window
        .dialog()
        .file()
        .set_title(&format!("Select target directory for {} item(s)", files.len()))
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok());
    if folder.is_none() {
        return Ok(String::new());
    }
    let target_dir = folder.unwrap();

    
    let existing: Vec<_> = files
        .iter()
        .filter_map(|f| {
            let dest = target_dir.join(&f.name);
            if dest.exists() { Some(dest) } else { None }
        })
        .collect();

    if !existing.is_empty() {
        let confirmed = app_window
            .dialog()
            .message(format!(
                "{} item(s) already exist in the target directory.\n\nOverwrite?",
                existing.len()
            ))
            .title("Overwrite existing files?")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
            .blocking_show();
        if !confirmed {
            return Err("Cancelled".to_string());
        }
    }

    log::info!("Restoring {} file(s) from snapshot '{}'...", files.len(), snapshot_id);

    let target_dir_str = target_dir.to_string_lossy().to_string();
    let mut args: Vec<&str> = vec!["restore", &snapshot_id, "--target", &target_dir_str];
    for file in &files {
        args.push("--include");
        args.push(&file.path);
    }

    state
        .restic
        .run(&state.location, &args, None)
        .map_err(|err| format!("Failed to restore files: {}", err))?;

    
    for file in &files {
        let relative = file.path.trim_start_matches('/');
        let restored_at = target_dir.join(relative);
        if !restored_at.exists() {
            continue;
        }
        let dest = target_dir.join(&file.name);
        if dest.exists() {
            if dest.is_dir() {
                let _ = std::fs::remove_dir_all(&dest);
            } else {
                let _ = std::fs::remove_file(&dest);
            }
        }
        if let Err(e) = std::fs::rename(&restored_at, &dest) {
            log::warn!("Failed to move '{}': {}", restored_at.display(), e);
        }
        
        let mut parent = restored_at.parent();
        while let Some(p) = parent {
            if p == target_dir {
                break;
            }
            if std::fs::remove_dir(p).is_err() {
                break;
            }
            parent = p.parent();
        }
    }

    Ok(target_dir.to_string_lossy().to_string())
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RestoreReport {
    pub target_dir: String,
    pub restored_files: u64,
    pub zero_byte_files: u64,
    pub fixed_files: u64,
    pub failed_files: u64,
    pub details: Vec<RestoreDetail>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RestoreDetail {
    pub path: String,
    pub status: String,
    pub source_snapshot: Option<String>,
}

#[tauri::command(async)]
pub fn restore_snapshot(
    snapshot_id: String,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<RestoreReport, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;
    state.verify_snapshot(&snapshot_id)?;

    let folder = app_window
        .dialog()
        .file()
        .set_title("Select target directory for snapshot restore")
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok());
    if folder.is_none() {
        return Err("Cancelled".to_string());
    }
    let target_dir = folder.unwrap();
    let target_dir_str = target_dir.to_string_lossy().to_string();

    log::info!(
        "Restoring snapshot {} to {}...",
        snapshot_id,
        target_dir.display()
    );
    state
        .restic
        .run(
            &state.location,
            &["restore", &snapshot_id, "--target", &target_dir_str],
            None,
        )
        .map_err(|err| err.to_string())?;

    let mut restored_files = 0u64;
    let mut zero_byte_files = 0u64;
    let mut fixed_files = 0u64;
    let mut failed_files = 0u64;
    let mut details = Vec::new();

    fn walk_dir(
        path: &std::path::Path,
        target_dir: &std::path::Path,
        state: &AppState,
        snapshot_id: &str,
        restored_files: &mut u64,
        zero_byte_files: &mut u64,
        fixed_files: &mut u64,
        failed_files: &mut u64,
        details: &mut Vec<RestoreDetail>,
    ) -> Result<(), String> {
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_type = entry.file_type().map_err(|e| e.to_string())?;
            if file_type.is_dir() {
                walk_dir(
                    &entry.path(),
                    target_dir,
                    state,
                    snapshot_id,
                    restored_files,
                    zero_byte_files,
                    fixed_files,
                    failed_files,
                    details,
                )?;
            } else if file_type.is_file() {
                *restored_files += 1;
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                let full_path = entry.path();
                if meta.len() > 0 {
                    details.push(RestoreDetail {
                        path: full_path.to_string_lossy().to_string(),
                        status: "ok".to_string(),
                        source_snapshot: None,
                    });
                    continue;
                }

                *zero_byte_files += 1;
                let relative = full_path
                    .strip_prefix(target_dir)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .to_string();
                let snapshot_path = if relative.starts_with('/') {
                    relative
                } else {
                    format!("/{}", relative)
                };

                let snaps_output = state
                    .restic
                    .run(&state.location, &["snapshots", "--json"], None)
                    .map_err(|err| err.to_string())?;
                let snapshots: Vec<restic::Snapshot> =
                    serde_json::from_str(&snaps_output).map_err(|err| err.to_string())?;

                let mut fixed = false;
                for snap in snapshots.iter().filter(|s| s.id != snapshot_id).rev() {
                    let ls_output = state
                        .restic
                        .run(
                            &state.location,
                            &["ls", &snap.id, "--json", &snapshot_path],
                            None,
                        );
                    let ls_output = match ls_output {
                        Ok(o) => o,
                        Err(_) => continue,
                    };
                    let mut file_size: Option<u64> = None;
                    for line in ls_output.lines().skip(1) {
                        let line = line.trim();
                        if line.is_empty() || !line.starts_with('{') {
                            continue;
                        }
                        if let Ok(node) = serde_json::from_str::<serde_json::Value>(line) {
                            if node.get("type").and_then(|t| t.as_str()) == Some("file") {
                                file_size = node.get("size").and_then(|s| s.as_u64());
                                break;
                            }
                        }
                    }
                    if file_size.unwrap_or(0) > 0 {
                        if let Err(err) = state.restic.run(
                            &state.location,
                            &[
                                "restore",
                                &snap.id,
                                "--target",
                                &target_dir.to_string_lossy(),
                                "--include",
                                &snapshot_path,
                            ],
                            None,
                        ) {
                            log::warn!(
                                "Failed to re-restore {} from snapshot {}: {}",
                                snapshot_path,
                                snap.id,
                                err
                            );
                            continue;
                        }
                        *fixed_files += 1;
                        fixed = true;
                        details.push(RestoreDetail {
                            path: full_path.to_string_lossy().to_string(),
                            status: "fixed".to_string(),
                            source_snapshot: Some(snap.short_id.clone()),
                        });
                        break;
                    }
                }
                if !fixed {
                    *failed_files += 1;
                    details.push(RestoreDetail {
                        path: full_path.to_string_lossy().to_string(),
                        status: "failed".to_string(),
                        source_snapshot: None,
                    });
                }
            }
        }
        Ok(())
    }

    walk_dir(
        &target_dir,
        &target_dir,
        &state,
        &snapshot_id,
        &mut restored_files,
        &mut zero_byte_files,
        &mut fixed_files,
        &mut failed_files,
        &mut details,
    )?;

    Ok(RestoreReport {
        target_dir: target_dir_str,
        restored_files,
        zero_byte_files,
        fixed_files,
        failed_files,
        details,
    })
}

#[tauri::command(async)]
pub fn forget_snapshots(
    snapshot_ids: Vec<String>,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<(), String> {
    
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    
    for snapshot_id in &snapshot_ids {
        state.verify_snapshot(snapshot_id)?;
    }

    if snapshot_ids.is_empty() {
        return Err("No snapshots selected".to_string());
    }

    
    let message = if snapshot_ids.len() == 1 {
        format!(
            "Are you sure you want to delete snapshot '{}'?\n\nThis action cannot be undone.",
            snapshot_ids[0]
        )
    } else {
        format!(
            "Are you sure you want to delete {} snapshots?\n\nThis action cannot be undone.",
            snapshot_ids.len()
        )
    };

    let confirmed = app_window
        .dialog()
        .message(message)
        .title("Delete Snapshots")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::YesNo)
        .blocking_show();

    if !confirmed {
        return Ok(());
    }

    
    log::info!("Deleting {} snapshot(s)...", snapshot_ids.len());

    
    let mut args: Vec<&str> = vec!["forget"];
    for id in &snapshot_ids {
        args.push(id.as_str());
    }
    args.push("--prune");

    state
        .restic
        .run_with_lock(&state.location, &args, None)
        .map_err(|err| err.to_string())?;

    Ok(())
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RepoStats {
    pub total_size: u64,
    pub total_file_count: u64,
    pub snapshots_count: usize,
}

#[tauri::command(async, rename_all = "camelCase")]
pub fn get_repo_stats(
    snapshot_ids: Option<Vec<String>>,
    app_state: tauri::State<SharedAppState>,
) -> Result<RepoStats, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    log::info!("Getting repository statistics...");

    
    let mut args: Vec<&str> = vec!["stats", "--json"];

    
    let ids = snapshot_ids.unwrap_or_default();
    let id_refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();

    if id_refs.is_empty() {
        args.push("latest");
    } else {
        args.extend(id_refs.iter());
    }

    let output = state
        .restic
        .run(&state.location, &args, None)
        .map_err(|err| err.to_string())?;

    
    
    let json_line = output
        .lines()
        .map(|l| l.trim())
        .find(|l| l.starts_with('{'))
        .ok_or_else(|| format!("Failed to find JSON in stats output: {}", output))?;
    let stats: serde_json::Value = serde_json::from_str(json_line)
        .map_err(|err| format!("Failed to parse stats: {}", err))?;

    let total_size = stats["total_size"].as_u64().unwrap_or(0);
    let total_file_count = stats["total_file_count"].as_u64().unwrap_or(0);
    let snapshots_count = if ids.is_empty() { 1 } else { ids.len() };

    Ok(RepoStats {
        total_size,
        total_file_count,
        snapshots_count,
    })
}

#[tauri::command(async)]
pub fn check_repository(app_state: tauri::State<SharedAppState>) -> Result<String, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    log::info!("Checking repository integrity...");

    state
        .restic
        .run(&state.location, &["check"], None)
        .map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub fn unlock_repository(app_state: tauri::State<SharedAppState>) -> Result<String, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    log::info!("Unlocking repository...");

    state
        .restic
        .run_with_lock(&state.location, &["unlock"], None)
        .map_err(|err| err.to_string())
}

#[tauri::command(async)]
pub fn prune_repository(
    app_state: tauri::State<SharedAppState>,
) -> Result<String, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    log::info!("Pruning repository...");

    state
        .restic
        .run_with_lock(&state.location, &["prune"], None)
        .map_err(|err| err.to_string())
}


#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DiffResult {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub modified: Vec<String>,
    pub metadata_changed: Vec<String>,
    pub type_changed: Vec<String>,
}

#[tauri::command(async)]
pub fn diff_snapshots(
    snapshot_id1: String,
    snapshot_id2: String,
    app_state: tauri::State<SharedAppState>,
) -> Result<DiffResult, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;
    state.verify_snapshot(&snapshot_id1)?;
    state.verify_snapshot(&snapshot_id2)?;

    log::info!(
        "Comparing snapshots {} and {}...",
        snapshot_id1,
        snapshot_id2
    );

    let output = state
        .restic
        .run(
            &state.location,
            &["diff", &snapshot_id1, &snapshot_id2],
            None,
        )
        .map_err(|err| err.to_string())?;

    
    
    
    let mut added = Vec::new();
    let mut removed = Vec::new();
    let mut modified = Vec::new();
    let mut metadata_changed = Vec::new();
    let mut type_changed = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        
        let (prefix, path) = if line.len() > 1 {
            (line.chars().next(), line[1..].trim())
        } else {
            continue;
        };

        match prefix {
            Some('+') => added.push(path.to_string()),
            Some('-') => removed.push(path.to_string()),
            Some('M') | Some('?') => modified.push(path.to_string()),
            Some('U') => metadata_changed.push(path.to_string()),
            Some('T') => type_changed.push(path.to_string()),
            _ => {}
        }
    }

    Ok(DiffResult {
        added,
        removed,
        modified,
        metadata_changed,
        type_changed,
    })
}


#[tauri::command(async)]
pub fn create_backup(
    paths: Vec<String>,
    tags: Vec<String>,
    app_state: tauri::State<SharedAppState>,
    app_window: tauri::Window,
) -> Result<String, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    if paths.is_empty() {
        
        let folder = app_window
            .dialog()
            .file()
            .set_title("Select folder to backup")
            .blocking_pick_folder()
            .and_then(|f| f.into_path().ok());

        if folder.is_none() {
            return Err("No folder selected".to_string());
        }

        let path = folder.unwrap();
        log::info!("Creating backup of {}...", path.display());

        let mut args = vec!["backup", path.to_str().unwrap_or("")];

        
        let tag_args: Vec<String> = tags.iter().map(|t| format!("--tag={}", t)).collect();
        let tag_refs: Vec<&str> = tag_args.iter().map(|s| s.as_str()).collect();
        args.extend(tag_refs);

        state
            .restic
            .run_with_lock(&state.location, &args, None)
            .map_err(|err| err.to_string())
    } else {
        log::info!("Creating backup of {:?}...", paths);

        let mut args: Vec<&str> = vec!["backup"];
        for path in &paths {
            args.push(path.as_str());
        }

        
        let tag_args: Vec<String> = tags.iter().map(|t| format!("--tag={}", t)).collect();
        let tag_refs: Vec<&str> = tag_args.iter().map(|s| s.as_str()).collect();
        args.extend(tag_refs);

        state
            .restic
            .run_with_lock(&state.location, &args, None)
            .map_err(|err| err.to_string())
    }
}


#[derive(Debug, Clone, serde::Deserialize)]
struct FindResult {
    #[serde(default)]
    matches: Vec<restic::File>,
}

#[tauri::command(async, rename_all = "camelCase")]
pub fn search_files(
    pattern: String,
    snapshot_ids: Option<Vec<String>>,
    app_state: tauri::State<SharedAppState>,
) -> Result<Vec<restic::File>, String> {
    let state = app_state.get()?;
    state.verify_restic_path()?;
    state.verify_location()?;

    if let Some(ref ids) = snapshot_ids {
        for id in ids {
            state.verify_snapshot(id)?;
        }
    }

    
    let search_pattern = if pattern.contains('*') || pattern.contains('?') {
        pattern.clone()
    } else {
        format!("*{}*", pattern)
    };

    log::info!(
        "Searching for files matching '{}' (original: '{}')...",
        search_pattern,
        pattern
    );

    let mut args: Vec<&str> = vec!["find", "--json", "--long", &search_pattern];

    let snapshot_args: Vec<String> = if let Some(ref ids) = snapshot_ids {
        ids.iter().map(|id| format!("--snapshot={}", id)).collect()
    } else {
        vec![]
    };
    for arg in &snapshot_args {
        args.push(arg);
    }

    let output = state
        .restic
        .run(&state.location, &args, "search_files")
        .map_err(|err| {
            log::error!("Search command failed: {}", err);
            err.to_string()
        })?;

    log::info!("Search raw output length: {} bytes", output.len());
    if output.len() < 2000 {
        log::info!("Search raw output: {}", output);
    }

    
    let mut files = Vec::new();
    let trimmed = output.trim();

    
    match serde_json::from_str::<Vec<FindResult>>(trimmed) {
        Ok(results) => {
            log::info!("Parsed as array with {} snapshot results", results.len());
            for result in results {
                log::info!("Snapshot has {} matches", result.matches.len());
                for mut file in result.matches {
                    
                    if file.name.is_empty() && !file.path.is_empty() {
                        if let Some(name) = std::path::Path::new(&file.path).file_name() {
                            file.name = name.to_string_lossy().to_string();
                        }
                    }
                    log::debug!("Found file: {} ({})", file.path, file.type_);
                    files.push(file);
                }
            }
        }
        Err(parse_err) => {
            log::error!("Failed to parse as array: {}", parse_err);
            log::error!(
                "First 500 chars of output: {}",
                &trimmed.chars().take(500).collect::<String>()
            );
            
            for line in output.lines() {
                let line = line.trim();
                if line.is_empty() || !line.starts_with('{') {
                    continue;
                }
                if let Ok(result) = serde_json::from_str::<FindResult>(line) {
                    for mut file in result.matches {
                        if file.name.is_empty() && !file.path.is_empty() {
                            if let Some(name) = std::path::Path::new(&file.path).file_name() {
                                file.name = name.to_string_lossy().to_string();
                            }
                        }
                        files.push(file);
                    }
                }
            }
        }
    }

    log::info!("Search completed, found {} files total", files.len());
    Ok(files)
}


