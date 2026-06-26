mod commands;
mod engine;

use engine::EngineState;
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(EngineState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            // First launch without engine: open the component setup CMD wizard.
            if !EngineState::sidecar_installed(&handle) {
                let _ = EngineState::run_component_setup(&handle);
            }
            let state = app.state::<EngineState>();
            state.start(&handle);
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
            commands::open_folder,
            commands::reveal_in_explorer,
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
