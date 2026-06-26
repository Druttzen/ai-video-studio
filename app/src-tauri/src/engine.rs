//! Supervises the Python model-engine sidecar and proxies HTTP to it.
//!
//! Lifecycle: on app setup we spawn the engine (a PyInstaller binary in a
//! bundled build, or `python -m ave_engine` in dev), read the `AVE_ENGINE_PORT`
//! sentinel from its stdout to learn the port, and keep the child handle so we
//! can kill it on exit. All UI traffic flows UI -> Tauri command -> here ->
//! engine, so the webview never needs network access or the engine URL.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct EngineState {
    inner: Arc<EngineInner>,
}

#[derive(Default)]
struct EngineInner {
    base_url: Mutex<Option<String>>,
    child: Mutex<Option<Child>>,
    client: reqwest::Client,
    last_log: Mutex<Vec<String>>,
}

impl EngineState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Resolve the data dir where the engine stores models + outputs.
    fn data_dir(app: &AppHandle) -> PathBuf {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("AIVideoStudio"))
    }

    /// Build the command used to launch the engine.
    ///
    /// Priority:
    ///   1. `AVE_ENGINE_BIN`            -> run that executable directly.
    ///   2. bundled sidecar next to exe -> `binaries/ave-engine[.exe]`.
    ///   3. dev fallback                -> `python -m ave_engine` in ../engine.
    fn build_command(app: &AppHandle) -> Command {
        let data_dir = Self::data_dir(app);

        // 1. explicit override
        if let Ok(bin) = std::env::var("AVE_ENGINE_BIN") {
            let mut c = Command::new(bin);
            c.env("AVE_DATA_DIR", &data_dir);
            return c;
        }

        // 2. bundled sidecar produced by PyInstaller and shipped as a resource.
        // PyInstaller one-folder builds put the exe inside an `ave-engine/`
        // subfolder; also accept a flat layout.
        if let Ok(res_dir) = app.path().resource_dir() {
            let exe = if cfg!(windows) { "ave-engine.exe" } else { "ave-engine" };
            for candidate in [
                res_dir.join("binaries").join("ave-engine").join(exe),
                res_dir.join("binaries").join(exe),
            ] {
                if candidate.exists() {
                    let mut c = Command::new(candidate);
                    c.env("AVE_DATA_DIR", &data_dir);
                    return c;
                }
            }
        }

        // 3. dev fallback: spawn the python module from the repo
        let python = std::env::var("AVE_PYTHON").unwrap_or_else(|_| "python".into());
        let engine_dir = std::env::var("AVE_ENGINE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("..")
                    .join("engine")
            });
        let mut c = Command::new(python);
        c.args(["-m", "ave_engine"]);
        c.current_dir(engine_dir);
        c.env("AVE_DATA_DIR", &data_dir);
        c
    }

    /// Spawn the engine and start reading its stdout for the port sentinel.
    pub fn start(&self, app: &AppHandle) {
        let mut cmd = Self::build_command(app);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[engine] failed to spawn: {e}");
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            let inner = self.inner.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    if let Some(rest) = line.strip_prefix("AVE_ENGINE_PORT=") {
                        if let Ok(port) = rest.trim().parse::<u16>() {
                            let url = format!("http://127.0.0.1:{port}");
                            *inner.base_url.lock().unwrap() = Some(url.clone());
                            eprintln!("[engine] ready at {url}");
                        }
                    }
                    let mut log = inner.last_log.lock().unwrap();
                    log.push(line);
                    if log.len() > 200 {
                        let drain = log.len() - 200;
                        log.drain(0..drain);
                    }
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    eprintln!("[engine:err] {line}");
                }
            });
        }

        *self.inner.child.lock().unwrap() = Some(child);
    }

    /// Block (with timeout) until the engine reports its port.
    async fn base_url(&self) -> Result<String, String> {
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if let Some(url) = self.inner.base_url.lock().unwrap().clone() {
                return Ok(url);
            }
            if Instant::now() > deadline {
                return Err("engine did not start within 60s".into());
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }

    pub async fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        let base = self.base_url().await?;
        self.inner
            .client
            .get(format!("{base}{path}"))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn post(
        &self,
        path: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let base = self.base_url().await?;
        let resp = self
            .inner
            .client
            .post(format!("{base}{path}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Self::parse(resp).await
    }

    pub async fn delete(&self, path: &str) -> Result<serde_json::Value, String> {
        let base = self.base_url().await?;
        let resp = self
            .inner
            .client
            .delete(format!("{base}{path}"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Self::parse(resp).await
    }

    async fn parse(resp: reqwest::Response) -> Result<serde_json::Value, String> {
        let status = resp.status();
        let value = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())?;
        if !status.is_success() {
            let detail = value
                .get("detail")
                .and_then(|d| d.as_str())
                .unwrap_or("request failed");
            return Err(detail.to_string());
        }
        Ok(value)
    }

    pub fn shutdown(&self) {
        if let Some(mut child) = self.inner.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}
