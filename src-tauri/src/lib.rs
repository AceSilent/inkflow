use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ServerSidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let (mut rx, child) = app.shell().sidecar("inkflow-server")?.spawn()?;
            app.manage(ServerSidecar(Mutex::new(Some(child))));

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(bytes) => {
                            println!("[inkflow-server] {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(bytes) => {
                            eprintln!("[inkflow-server] {}", String::from_utf8_lossy(&bytes).trim_end());
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InkFlow");

    app.run(|app_handle, event| {
        handle_run_event(app_handle, &event);
    });
}

pub fn stop_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ServerSidecar>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(process) = child.take() {
                let _ = process.kill();
            }
        }
    }
}

pub fn handle_run_event(app: &tauri::AppHandle, event: &RunEvent) {
    if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        stop_sidecar(app);
    }
}
