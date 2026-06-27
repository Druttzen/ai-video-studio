//! In-app setup: hardware scan, component install, progress events to the UI.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::EngineState;

static SETUP_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppBootstrap {
    pub app_version: String,
    pub engine_installed: bool,
    pub update: UpdateInfo,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupProgress {
    pub phase: String,
    pub label: String,
    pub percent: f64,
    pub done_bytes: i64,
    pub total_bytes: i64,
    pub eta_seconds: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupStep {
    pub id: String,
    pub title: String,
    pub state: String,
    pub index: u32,
    pub total: u32,
}

pub fn resolve_install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().executable_dir() {
        if dir.exists() {
            return Ok(dir);
        }
    }
    std::env::current_exe()
        .map_err(|e| e.to_string())
        .and_then(|exe| {
            exe.parent()
                .map(|p| p.to_path_buf())
                .ok_or_else(|| "could not resolve install directory from executable".into())
        })
}

pub fn resolve_setup_script(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("installer").join("ave-setup.ps1"));
    }
    if let Ok(dir) = resolve_install_dir(app) {
        candidates.push(dir.join("resources").join("installer").join("ave-setup.ps1"));
        candidates.push(dir.join("ave-setup.ps1"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("resources").join("installer").join("ave-setup.ps1"));
            candidates.push(parent.join("ave-setup.ps1"));
        }
    }
    for p in candidates {
        if p.exists() {
            return Ok(p);
        }
    }
    Err("ave-setup.ps1 not found".into())
}

fn install_dir(app: &AppHandle) -> Result<PathBuf, String> {
    resolve_install_dir(app)
}

#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut Command) {}

fn run_powershell_json(script: &PathBuf, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script.to_string_lossy(),
    ]);
    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    hide_console(&mut cmd);

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    for line in stdout.lines() {
        if let Some(json) = line.strip_prefix("AVE_SETUP_JSON|") {
            return Ok(json.to_string());
        }
    }

    if output.status.success() {
        return Err(format!("setup scan produced no JSON output\n{stderr}"));
    }
    Err(format!(
        "setup scan failed (exit {})\n{stdout}\n{stderr}",
        output.status.code().unwrap_or(-1)
    ))
}

pub async fn check_update(app: &AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .user_agent("AI-Video-Tool")
        .build()
        .map_err(|e| e.to_string())?;

    let release: serde_json::Value = client
        .get("https://api.github.com/repos/Druttzen/ai-video-studio/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let tag = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    let html_url = release
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://github.com/Druttzen/ai-video-studio/releases")
        .to_string();

    let mut download_url = None;
    if let Some(assets) = release.get("assets").and_then(|a| a.as_array()) {
        for asset in assets {
            let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
            if name.starts_with("AI-Video-Tool-Setup-") && name.ends_with(".exe") {
                download_url = asset
                    .get("browser_download_url")
                    .and_then(|u| u.as_str())
                    .map(str::to_string);
                break;
            }
        }
    }

    let available = version_gt(&tag, &current);

    Ok(UpdateInfo {
        available,
        current_version: current,
        latest_version: tag,
        release_url: html_url,
        download_url,
    })
}

fn version_gt(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.split('.')
            .filter_map(|p| p.parse::<u32>().ok())
            .collect()
    };
    let a = parse(latest);
    let b = parse(current);
    for i in 0..3 {
        let va = a.get(i).copied().unwrap_or(0);
        let vb = b.get(i).copied().unwrap_or(0);
        if va > vb {
            return true;
        }
        if va < vb {
            return false;
        }
    }
    false
}

pub async fn bootstrap(app: AppHandle) -> Result<AppBootstrap, String> {
    let update = check_update(&app).await.unwrap_or_else(|_e| UpdateInfo {
        available: false,
        current_version: app.package_info().version.to_string(),
        latest_version: app.package_info().version.to_string(),
        release_url: "https://github.com/Druttzen/ai-video-studio/releases".into(),
        download_url: None,
    });

    Ok(AppBootstrap {
        app_version: app.package_info().version.to_string(),
        engine_installed: EngineState::sidecar_installed(&app),
        update,
    })
}

pub fn setup_scan(app: &AppHandle) -> Result<serde_json::Value, String> {
    let script = resolve_setup_script(app)?;
    let dir = install_dir(app)?;
    let json = run_powershell_json(
        &script,
        &[
            "-ScanOnly",
            "-EmitJson",
            "-InstDir",
            &dir.to_string_lossy(),
            "-DownloadModels",
            "eligible",
        ],
    )?;
    serde_json::from_str(&json).map_err(|e| format!("invalid setup scan JSON: {e}"))
}

pub async fn setup_run(app: AppHandle) -> Result<(), String> {
    if SETUP_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("setup already running".into());
    }

    let script = resolve_setup_script(&app)?;
    let dir = install_dir(&app)?;
    let window = app
        .get_webview_window("main")
        .ok_or("main window not found")?;

    let app_restart = app.clone();

    tokio::task::spawn_blocking(move || {
        let result = (|| -> Result<(), String> {
            let mut cmd = Command::new("powershell");
            cmd.args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                &script.to_string_lossy(),
                "-PostInstall",
                "-EmitJson",
                "-Quiet",
                "-SkipLaunch",
                "-InstDir",
                &dir.to_string_lossy(),
                "-DownloadModels",
                "eligible",
                "-InstallAddons",
            ]);
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());
            hide_console(&mut cmd);

            let mut child = cmd.spawn().map_err(|e| e.to_string())?;

            let stderr = child.stderr.take();
            if let Some(stderr) = stderr {
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for _line in reader.lines().map_while(Result::ok) {}
                });
            }

            let stdout = child.stdout.take().ok_or("no stdout")?;
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Some(rest) = line.strip_prefix("AVE_SETUP_PROGRESS|") {
                    let parts: Vec<&str> = rest.split('|').collect();
                    if parts.len() >= 5 {
                        let payload = SetupProgress {
                            phase: "install".into(),
                            label: parts[0].to_string(),
                            percent: parts[1].parse().unwrap_or(0.0),
                            done_bytes: parts[2].parse().unwrap_or(0),
                            total_bytes: parts[3].parse().unwrap_or(1),
                            eta_seconds: parts[4].parse().unwrap_or(0.0),
                            message: parts.get(5).unwrap_or(&"").to_string(),
                        };
                        let _ = window.emit("setup-progress", &payload);
                    }
                } else if let Some(rest) = line.strip_prefix("AVE_SETUP_PHASE|") {
                    let parts: Vec<&str> = rest.split('|').collect();
                    if parts.len() >= 5 {
                        let payload = SetupStep {
                            id: parts[0].to_string(),
                            title: parts[1].to_string(),
                            state: parts[2].to_string(),
                            index: parts[3].parse().unwrap_or(1),
                            total: parts[4].parse().unwrap_or(4),
                        };
                        let _ = window.emit("setup-step", &payload);
                    }
                } else if let Some(msg) = line.strip_prefix("AVE_SETUP_LOG|") {
                    let payload = SetupProgress {
                        phase: "log".into(),
                        label: "setup".into(),
                        percent: 0.0,
                        done_bytes: 0,
                        total_bytes: 0,
                        eta_seconds: 0.0,
                        message: msg.to_string(),
                    };
                    let _ = window.emit("setup-progress", &payload);
                }
            }

            let status = child.wait().map_err(|e| e.to_string())?;
            if !status.success() {
                return Err(format!(
                    "setup exited with code {}",
                    status.code().unwrap_or(-1)
                ));
            }
            Ok(())
        })();

        SETUP_RUNNING.store(false, Ordering::SeqCst);

        match result {
            Ok(()) => {
                let _ = window.emit("setup-complete", serde_json::json!({ "ok": true }));
                let state = app_restart.state::<EngineState>();
                state.shutdown();
                state.start(&app_restart);
            }
            Err(e) => {
                let _ = window.emit("setup-complete", serde_json::json!({ "ok": false, "error": e }));
            }
        }
    });

    Ok(())
}

pub fn open_update_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
