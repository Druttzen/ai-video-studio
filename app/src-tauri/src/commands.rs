//! Tauri commands: thin async proxies from the UI to the Python engine.

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::engine::EngineState;
use crate::setup::{self, AppBootstrap};

#[tauri::command]
pub async fn app_bootstrap(app: AppHandle) -> Result<AppBootstrap, String> {
    setup::bootstrap(app).await
}

#[tauri::command]
pub fn setup_scan(app: AppHandle) -> Result<Value, String> {
    setup::setup_scan(&app)
}

#[tauri::command]
pub async fn setup_run(app: AppHandle) -> Result<(), String> {
    setup::setup_run(app).await
}

#[tauri::command]
pub fn open_app_update(url: String) -> Result<(), String> {
    setup::open_update_url(url)
}

#[tauri::command]
pub fn restart_engine(app: AppHandle, engine: State<'_, EngineState>) {
    engine.shutdown();
    engine.start(&app);
}

#[tauri::command]
pub async fn engine_health(engine: State<'_, EngineState>) -> Result<Value, String> {
    engine.get("/health").await
}

#[tauri::command]
pub async fn list_models(engine: State<'_, EngineState>) -> Result<Value, String> {
    engine.get("/models").await
}

#[tauri::command]
pub async fn download_model(
    engine: State<'_, EngineState>,
    model_id: String,
) -> Result<Value, String> {
    engine
        .post(&format!("/models/{model_id}/download"), Value::Null)
        .await
}

#[tauri::command]
pub async fn delete_model(
    engine: State<'_, EngineState>,
    model_id: String,
) -> Result<Value, String> {
    engine.delete(&format!("/models/{model_id}")).await
}

#[tauri::command]
pub async fn generate(engine: State<'_, EngineState>, request: Value) -> Result<Value, String> {
    engine.post("/generate", request).await
}

#[tauri::command]
pub async fn analyze_audio(
    engine: State<'_, EngineState>,
    request: Value,
) -> Result<Value, String> {
    engine.post("/analyze/audio", request).await
}

#[tauri::command]
pub async fn analyze_image(
    engine: State<'_, EngineState>,
    request: Value,
) -> Result<Value, String> {
    engine.post("/analyze/image", request).await
}

#[tauri::command]
pub async fn create_music_video(
    engine: State<'_, EngineState>,
    request: Value,
) -> Result<Value, String> {
    engine.post("/projects/music-video", request).await
}

#[tauri::command]
pub async fn create_canvas(
    engine: State<'_, EngineState>,
    request: Value,
) -> Result<Value, String> {
    engine.post("/projects/canvas", request).await
}

#[tauri::command]
pub async fn list_jobs(engine: State<'_, EngineState>) -> Result<Value, String> {
    engine.get("/jobs").await
}

#[tauri::command]
pub async fn job_status(
    engine: State<'_, EngineState>,
    job_id: String,
) -> Result<Value, String> {
    engine.get(&format!("/jobs/{job_id}")).await
}

#[tauri::command]
pub async fn cancel_job(
    engine: State<'_, EngineState>,
    job_id: String,
) -> Result<Value, String> {
    engine
        .post(&format!("/jobs/{job_id}/cancel"), Value::Null)
        .await
}

#[tauri::command]
pub async fn complete_onboarding(app: AppHandle) -> Result<Value, String> {
    use crate::setup::agent_debug_log;

    let data_dir = EngineState::resolve_data_dir(&app);
    let path = data_dir.join("onboarding.json");

    // #region agent log
    agent_debug_log(
        "A",
        "commands.rs:complete_onboarding",
        "writing onboarding.json locally",
        serde_json::json!({ "path": path.to_string_lossy() }),
    );
    // #endregion

    std::fs::create_dir_all(&data_dir).map_err(|e| {
        let msg = format!("cannot create data folder {}: {e}", data_dir.display());
        agent_debug_log(
            "B",
            "commands.rs:complete_onboarding",
            "mkdir failed",
            serde_json::json!({ "error": msg }),
        );
        msg
    })?;

    let completed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let state = serde_json::json!({
        "complete": true,
        "completed_at": completed_at.to_string(),
    });
    let body = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    std::fs::write(&path, &body).map_err(|e| {
        let msg = format!("cannot write {}: {e}", path.display());
        agent_debug_log(
            "B",
            "commands.rs:complete_onboarding",
            "write failed",
            serde_json::json!({ "error": msg }),
        );
        msg
    })?;

    // #region agent log
    agent_debug_log(
        "A",
        "commands.rs:complete_onboarding",
        "onboarding.json written",
        serde_json::json!({ "path": path.to_string_lossy(), "bytes": body.len() }),
    );
    // #endregion

    Ok(state)
}

/// Open a folder in the system file manager.
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let dir = if p.is_file() {
        p.parent()
            .map(std::path::Path::to_path_buf)
            .unwrap_or(p)
    } else {
        p
    };
    if !dir.exists() {
        return Err(format!("path does not exist: {}", dir.display()));
    }
    open::that(&dir).map_err(|e| e.to_string())
}

/// Reveal a file in Explorer (Windows) or the platform equivalent.
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("file does not exist: {}", p.display()));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(p.parent().unwrap_or(&p)).map_err(|e| e.to_string())
    }
}
