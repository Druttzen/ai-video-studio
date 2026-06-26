//! Tauri commands: thin async proxies from the UI to the Python engine.

use serde_json::Value;
use tauri::State;

use crate::engine::EngineState;

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
