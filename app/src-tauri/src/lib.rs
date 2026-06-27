mod commands;
mod engine;
mod setup;

use engine::EngineState;
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<EngineState>();
            if EngineState::sidecar_installed(&handle) {
                state.start(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                window.state::<EngineState>().shutdown();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::engine_health,
            commands::list_models,
            commands::download_model,
            commands::delete_model,
            commands::generate,
            commands::analyze_audio,
            commands::analyze_image,
            commands::create_music_video,
            commands::create_canvas,
            commands::list_jobs,
            commands::job_status,
            commands::cancel_job,
            commands::complete_onboarding,
            commands::open_folder,
            commands::reveal_in_explorer,
            commands::app_bootstrap,
            commands::setup_scan,
            commands::setup_run,
            commands::open_app_update,
            commands::restart_engine,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Make sure the sidecar dies with the app (covers all exit paths).
            if let RunEvent::Exit = event {
                app.state::<EngineState>().shutdown();
            }
        });
}
