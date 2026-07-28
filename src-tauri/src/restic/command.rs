use std::{
    borrow::Cow,
    collections::HashMap,
    ffi::{OsStr, OsString},
    fs,
    path::PathBuf,
    process::{Command, Output, Stdio},
    sync::{Arc, Mutex},
};

use semver::Version;

use scopeguard::defer;

use crate::restic::{Location, WebDAVBridge};


mod group;

use group::{
    add_command_to_group, process_was_terminated, remove_command_from_group,
    terminate_all_commands_in_group,
};


pub fn new_command(program: &PathBuf) -> Command {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000); 
    command
}


#[cfg(target_os = "windows")]
pub const RESTIC_EXECTUABLE_NAME: &str = "restic.exe";
#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub const RCLONE_EXECTUABLE_NAME: &str = "rclone.exe";

#[cfg(not(target_os = "windows"))]
pub const RESTIC_EXECTUABLE_NAME: &str = "restic";
#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
pub const RCLONE_EXECTUABLE_NAME: &str = "rclone";


#[derive(Debug, Default, Clone)]
pub struct Program {
    restic_version: Option<Version>,                          
    restic_path: PathBuf,                                     
    rclone_path: Option<PathBuf>,                             
    webdav_bridge: Arc<Mutex<Option<WebDAVBridge>>>,          
    webdav_bridge_key: Arc<Mutex<String>>,                    
}

impl Program {
    
    pub fn new(restic_path: PathBuf, rclone_path: Option<PathBuf>) -> Self {
        let restic_version = Self::query_restic_version(&restic_path);
        Self {
            restic_version,
            restic_path,
            rclone_path,
            webdav_bridge: Arc::new(Mutex::new(None)),
            webdav_bridge_key: Arc::new(Mutex::new(String::new())),
        }
    }

    
    pub fn restic_version(&self) -> &Option<Version> {
        &self.restic_version
    }

    
    pub fn restic_path(&self) -> &PathBuf {
        &self.restic_path
    }

    
    pub fn rclone_path(&self) -> &Option<PathBuf> {
        &self.rclone_path
    }

    
    
    pub fn shutdown_webdav_bridge(&self) {
        let mut slot = self.webdav_bridge.lock().unwrap();
        if let Some(bridge) = slot.take() {
            let port = bridge.port();
            log::info!("WebDAV bridge shutdown: dropping bridge on port {port}");
            drop(bridge);
        }
        let mut key = self.webdav_bridge_key.lock().unwrap();
        key.clear();
    }

    
    
    
    pub fn run<C: Into<Option<&'static str>>>(
        &self,
        location: &Location,
        args: &[&str],
        command_group: C,
    ) -> Result<String, String> {
        self.run_internal(location, args, command_group, false)
    }

    
    
    pub fn run_with_lock<C: Into<Option<&'static str>>>(
        &self,
        location: &Location,
        args: &[&str],
        command_group: C,
    ) -> Result<String, String> {
        self.run_internal(location, args, command_group, true)
    }

    
    fn run_internal<C: Into<Option<&'static str>>>(
        &self,
        location: &Location,
        args: &[&str],
        command_group: C,
        with_lock: bool,
    ) -> Result<String, String> {
        
        
        
        let command_group = command_group.into();

        
        
        let bridged_location;
        let location = if location.prefix == "webdav" {
            bridged_location = self.bridge_webdav(location)?;
            &bridged_location
        } else {
            location
        };

        
        let args = self.args_internal(args, location, with_lock);
        let envs = self.envs(location);
        let mut child = new_command(&self.restic_path)
            .envs(envs)
            .args(args.clone())
            .stdin(Stdio::null()) 
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| err.to_string())?;
        
        let child_id = child.id();
        if let Some(command_group) = command_group {
            if let Err(err) = add_command_to_group(command_group, child_id) {
                log::error!("Failed to add process child: {err}");
            }
        }
        
        defer! {
            if let Some(command_group) = command_group {
                if let Err(err) = remove_command_from_group(command_group, child_id) {
                    log::error!("Failed to remove process child: {err}");
                }
            }
        }
        
        
        
        use std::io::Read;
        let mut stdout_pipe = child.stdout.take().expect("stdout piped");
        let mut stderr_pipe = child.stderr.take().expect("stderr piped");
        let stdout_thread = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = stdout_pipe.read_to_end(&mut buf);
            buf
        });
        let stderr_thread = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = stderr_pipe.read_to_end(&mut buf);
            buf
        });
        let timeout = std::time::Duration::from_secs(300);
        let start = std::time::Instant::now();
        let status = loop {
            match child.try_wait().map_err(|err| err.to_string())? {
                Some(s) => break s,
                None => {
                    if start.elapsed() > timeout {
                        log::warn!(
                            "restic '{:?}' command timed out after {}s — killing",
                            args,
                            timeout.as_secs()
                        );
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(format!(
                            "restic command timed out after {}s (killed)",
                            timeout.as_secs()
                        ));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
        };
        let stdout_buf = stdout_thread.join().unwrap_or_default();
        let stderr_buf = stderr_thread.join().unwrap_or_default();
        let output = std::process::Output {
            status,
            stdout: stdout_buf,
            stderr: stderr_buf,
        };
        let output: Result<std::process::Output, String> = Ok(output);
        let output = output?;
        if output.status.success() {
            let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
            Ok(stdout.to_string())
        } else {
            Err(Self::handle_run_error(&args, &output))
        }
    }

    
    
    
    
    pub fn run_redirected<C: Into<Option<&'static str>>>(
        &self,
        location: &Location,
        args: &[&str],
        file: fs::File,
        command_group: C,
    ) -> Result<(), String> {
        
        let command_group = command_group.into();
        if let Some(command_group) = command_group {
            if let Err(err) = terminate_all_commands_in_group(command_group) {
                log::error!("Failed to kill process childs: {err}");
            }
        }
        
        let args = self.args(args, location);
        let envs = self.envs(location);
        let child = new_command(&self.restic_path)
            .envs(envs)
            .args(args.clone())
            .stdin(Stdio::null()) 
            .stdout(std::process::Stdio::from(file))
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| err.to_string())?;
        
        let child_id = child.id();
        if let Some(command_group) = command_group {
            if let Err(err) = add_command_to_group(command_group, child_id) {
                log::error!("Failed to add process child: {err}");
            }
        }
        
        defer! {
            if let Some(command_group) = command_group {
                if let Err(err) = remove_command_from_group(command_group, child_id) {
                    log::error!("Failed to remove process child: {err}");
                }
            }
        }
        
        let output = child.wait_with_output().map_err(|err| err.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            Err(Self::handle_run_error(&args, &output))
        }
    }

    
    fn args<'a>(&self, args: &'a [&'a str], location: &Location) -> Vec<Cow<'a, OsStr>> {
        self.args_internal(args, location, false)
    }

    
    
    fn args_internal<'a>(
        &self,
        args: &'a [&'a str],
        location: &Location,
        with_lock: bool,
    ) -> Vec<Cow<'a, OsStr>> {
        let mut args = args
            .iter()
            .copied()
            .map(|s| Cow::Borrowed(OsStr::new(s)))
            .collect::<Vec<_>>();
        
        
        if !with_lock {
            args.push(Cow::Borrowed(OsStr::new("--no-lock")));
        }
        if location.prefix.starts_with("rclone") {
            if let Some(rclone_path) = &self.rclone_path {
                args.push(Cow::Borrowed(OsStr::new("--option")));
                args.push(Cow::Owned(OsString::from(format!(
                    "rclone.program={}",
                    &rclone_path.to_str().unwrap_or("[invalid path]")
                ))));
            }
        }
        if location.allow_empty_password {
            args.push(Cow::Borrowed(OsStr::new("--insecure-no-password")));
        }
        if location.insecure_tls {
            args.push(Cow::Borrowed(OsStr::new("--insecure-tls")));
        }
        args
    }

    
    fn envs(&self, location: &Location) -> HashMap<String, String> {
        let mut envs = HashMap::new();
        
        if let Ok(cache_dir) = std::env::var("RESTIC_CACHE_DIR") {
            envs.insert("RESTIC_CACHE_DIR".to_string(), cache_dir);
        }
        
        if !location.path.is_empty() {
            if !location.prefix.is_empty() {
                envs.insert(
                    "RESTIC_REPOSITORY".to_string(),
                    location.prefix.clone() + ":" + &location.path,
                );
            } else {
                envs.insert("RESTIC_REPOSITORY".to_string(), location.path.clone());
            }
            
            envs.insert("RESTIC_REPOSITORY_FILE".to_string(), "".to_string());
        }
        
        
        
        if location.allow_empty_password {
            
            
        } else if !location.password.is_empty() {
            
            envs.insert("RESTIC_PASSWORD".to_string(), location.password.clone());
        }
        
        

        
        envs.insert("RESTIC_PASSWORD_FILE".to_string(), "".to_string());
        
        for credential in location.credentials.clone() {
            envs.insert(credential.name, credential.value);
        }
        envs
    }

    
    fn handle_run_error<S: AsRef<OsStr> + std::fmt::Debug>(args: &[S], output: &Output) -> String {
        
        if process_was_terminated(&output.status) {
            log::info!("Restic '{:?}' command got aborted", args);
            return "Command got aborted".to_string();
        }
        
        let stderr = std::str::from_utf8(&output.stderr).unwrap_or("");
        log::warn!(
            "Restic '{:?}' command failed with status {}:\n{}",
            args,
            output.status,
            stderr
        );
        stderr.to_string()
    }

    
    fn query_restic_version(path: &PathBuf) -> Option<Version> {
        if !path.exists() {
            return None;
        }
        
        
        
        
        let mut child = match new_command(path)
            .arg("version")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(err) => {
                log::warn!("Failed to spawn restic binary for version query: {err}");
                return None;
            }
        };
        
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(10);
        let output = loop {
            match child.try_wait() {
                Ok(Some(_status)) => break child.wait_with_output(),
                Ok(None) => {
                    if start.elapsed() > timeout {
                        log::warn!(
                            "restic '{}' version query timed out after 10s — killing",
                            path.to_string_lossy()
                        );
                        let _ = child.kill();
                        let _ = child.wait();
                        return None;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(err) => {
                    log::warn!("Failed to poll restic version child: {err}");
                    return None;
                }
            }
        };
        match output {
            Ok(output) => {
                if output.status.success() {
                    
                    let stdout = std::str::from_utf8(&output.stdout).unwrap_or("");
                    let mut name_and_version = stdout.split(' ');
                    if let Some(version_str) = name_and_version.nth(1) {
                        match lenient_semver::parse(version_str) {
                            Ok(version) => return Some(version),
                            Err(err) => log::warn!(
                                "Failed to parse version info from restic binary: {}",
                                err
                            ),
                        }
                    }
                } else {
                    let stderr = std::str::from_utf8(&output.stderr).unwrap_or("");
                    log::warn!("Failed to read version info from restic binary: {}", stderr);
                }
            }
            Err(err) => {
                log::warn!("Failed to read version info from restic binary: {err}");
            }
        }
        None
    }

    
    
    
    fn bridge_webdav(&self, location: &Location) -> Result<Location, String> {
        
        let mut url = String::new();
        let mut user = String::new();
        let mut pass = String::new();
        for cred in &location.credentials {
            match cred.name.as_str() {
                "WEBDAV_URL" => url = cred.value.clone(),
                "WEBDAV_USERNAME" => user = cred.value.clone(),
                "WEBDAV_PASSWORD" => pass = cred.value.clone(),
                _ => {}
            }
        }
        let mut path = location.path.clone();
        
        
        
        if url.is_empty() && (path.starts_with("http://") || path.starts_with("https://")) {
            let scheme_end = path.find("://").unwrap_or(0) + 3;
            let after_scheme = &path[scheme_end..];
            if let Some(slash_rel) = after_scheme.rfind('/') {
                let slash_abs = scheme_end + slash_rel;
                url = path[..slash_abs + 1].to_string();
                path = path[slash_abs + 1..].to_string();
            } else {
                url = path.clone();
                path = String::new();
            }
            
            while path.ends_with('/') {
                path.pop();
            }
        }
        if url.is_empty() {
            return Err(
                "WebDAV URL is empty. Set WEBDAV_URL or use RESTIC_REPOSITORY=webdav:https://..."
                    .to_string(),
            );
        }
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(format!(
                "WebDAV URL must start with http:// or https:// (got '{url}')"
            ));
        }
        let key = crate::restic::bridge_key(&url, &user, &pass, &path);

        
        {
            let cached_key = self.webdav_bridge_key.lock().unwrap();
            if *cached_key == key {
                let bridge = self.webdav_bridge.lock().unwrap();
                if bridge.is_some() {
                    let bridge = bridge.as_ref().unwrap();
                    let rest_url = bridge.rest_url();
                    return Ok(rest_location(rest_url, location));
                }
            }
        }

        
        
        let rclone_path = match self.rclone_path.clone() {
            Some(p) => p,
            None => {
                
                match which::which(crate::restic::RCLONE_EXECTUABLE_NAME) {
                    Ok(p) => p,
                    Err(_) => {
                        crate::dep_check::show_dialog_and_exit(
                            "rclone is not installed or not found in PATH.\n\n\
                             rclone is required to access WebDAV repositories.\n\n\
                             Please install rclone, then start the program again.",
                        );
                    }
                }
            }
        };
        if !rclone_path.exists() {
            crate::dep_check::show_dialog_and_exit(&format!(
                "rclone executable '{}' does not exist.\n\n\
                 Please install rclone, then start the program again.",
                rclone_path.display()
            ));
        }

        log::info!("WebDAV: spawning fresh bridge for {url} (path={path})");
        let new_bridge = crate::restic::WebDAVBridge::start(&url, &user, &pass, &path, &rclone_path)?;
        let rest_url = new_bridge.rest_url();

        
        {
            let mut slot = self.webdav_bridge.lock().unwrap();
            *slot = Some(new_bridge);
        }
        {
            let mut cached_key = self.webdav_bridge_key.lock().unwrap();
            *cached_key = key;
        }

        Ok(rest_location(rest_url, location))
    }
}


fn rest_location(rest_url: String, original: &Location) -> Location {
    Location {
        prefix: "rest".to_string(),
        path: rest_url,
        credentials: vec![],
        allow_empty_password: original.allow_empty_password,
        password: original.password.clone(),
        insecure_tls: false,
    }
}
