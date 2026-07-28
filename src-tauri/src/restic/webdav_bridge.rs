use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::restic::new_command;


pub struct WebDAVBridge {
    child: Option<Child>,
    port: u16,
    temp_conf: Option<PathBuf>,
}

impl std::fmt::Debug for WebDAVBridge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WebDAVBridge")
            .field("port", &self.port)
            .field("has_child", &self.child.is_some())
            .field("temp_conf", &self.temp_conf)
            .finish()
    }
}

impl WebDAVBridge {
    
    
    pub fn start(
        url: &str,
        user: &str,
        pass: &str,
        path: &str,
        rclone_path: &PathBuf,
    ) -> Result<Self, String> {
        
        let obscured = obscure_password(pass, rclone_path)?;
        let temp_conf = write_temp_conf(url, user, &obscured)?;

        
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind: {e}"))?;
        let port = listener.local_addr().map_err(|e| format!("addr: {e}"))?.port();
        drop(listener);

        
        let remote = if path.is_empty() {
            "webdav:".to_string()
        } else {
            format!("webdav:{path}")
        };
        let addr = format!("127.0.0.1:{port}");
        log::info!("WebDAVBridge: starting rclone serve restic {remote} --addr {addr}");
        let mut child = {
            let mut cmd = new_command(rclone_path);
            cmd.arg("serve")
                .arg("restic")
                .arg(&remote)
                .arg("--addr").arg(&addr)
                .arg("--config").arg(&temp_conf)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            
            
            #[cfg(target_os = "linux")]
            unsafe {
                use std::os::unix::process::CommandExt;
                cmd.pre_exec(|| {
                    
                    extern "C" {
                        fn prctl(option: i32, arg2: usize, arg3: usize, arg4: usize, arg5: usize) -> i32;
                    }
                    let _ = prctl(1, 9, 0, 0, 0);
                    Ok(())
                });
            }
            cmd.spawn().map_err(|e| format!("failed to spawn rclone: {e}"))?
        };

        
        drain_in_background(child.stdout.take(), "rclone.stdout");
        drain_in_background(child.stderr.take(), "rclone.stderr");

        
        let bridge = WebDAVBridge {
            child: Some(child),
            port,
            temp_conf: Some(temp_conf),
        };
        if !bridge.wait_until_ready(Duration::from_secs(15)) {
            return Err(
                "rclone serve restic did not become ready within 15s. \
                 Check the WebDAV URL and credentials."
                    .to_string(),
            );
        }
        log::info!("WebDAVBridge: ready on port {port}");
        Ok(bridge)
    }

    
    pub fn rest_url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }

    
    pub fn port(&self) -> u16 {
        self.port
    }

    
    fn wait_until_ready(&self, timeout: Duration) -> bool {
        let started = Instant::now();
        let url = format!("http://127.0.0.1:{}/config", self.port);
        while started.elapsed() < timeout {
            
            if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
                &format!("127.0.0.1:{}", self.port).parse().unwrap(),
                Duration::from_millis(200),
            ) {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
                let req = format!("HEAD {} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n", url);
                let _ = stream.write_all(req.as_bytes());
                let mut buf = [0u8; 64];
                if let Ok(n) = stream.read(&mut buf) {
                    if n > 0 {
                        return true;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        false
    }
}

impl Drop for WebDAVBridge {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            log::info!("WebDAVBridge: stopping rclone (pid={})", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(path) = &self.temp_conf {
            let _ = fs::remove_file(path);
        }
    }
}


fn obscure_password(pass: &str, rclone_path: &PathBuf) -> Result<String, String> {
    let output = Command::new(rclone_path)
        .arg("obscure")
        .arg(pass)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("rclone obscure: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "rclone obscure failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}


fn write_temp_conf(url: &str, user: &str, obscured_pass: &str) -> Result<PathBuf, String> {
    let mut path = std::env::temp_dir();
    
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    path.push(format!("rclone-restic-browser-{nanos}.conf"));
    let conf = format!(
        "[webdav]\ntype = webdav\nurl = {url}\nvendor = other\nuser = {user}\npass = {obscured_pass}\n"
    );
    let mut f = fs::File::create(&path).map_err(|e| format!("create conf: {e}"))?;
    use std::os::unix::fs::PermissionsExt;
    let _ = f.set_permissions(fs::Permissions::from_mode(0o600));
    f.write_all(conf.as_bytes()).map_err(|e| format!("write conf: {e}"))?;
    Ok(path)
}


fn drain_in_background<R: Read + Send + 'static>(stream: Option<R>, name: &'static str) {
    use std::io::BufRead;
    if let Some(stream) = stream {
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stream);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        if !line.trim().is_empty() {
                            log::debug!("[{name}] {}", line.trim_end());
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}


pub fn bridge_key(url: &str, user: &str, pass: &str, path: &str) -> String {
    format!("{url}|{user}|{pass}|{path}")
}
