use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct ServerSidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?.join("books");
            std::fs::create_dir_all(&data_dir)?;
            let (mut rx, child) = app
                .shell()
                .sidecar("inkflow-server")?
                .env("AUTONOVEL_DATA_DIR", data_dir)
                .spawn()?;
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

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                enable_macos_window_background_drag(&window);
            }

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
    #[cfg(target_os = "macos")]
    if matches!(event, RunEvent::Ready) {
        if let Some(window) = app.get_webview_window("main") {
            enable_macos_window_background_drag(&window);
        }
    }

    if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
        stop_sidecar(app);
    }
}

#[cfg(target_os = "macos")]
fn enable_macos_window_background_drag(window: &tauri::WebviewWindow) {
    use objc2_app_kit::NSWindow;

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };

    unsafe {
        let ns_window = &*ns_window_ptr.cast::<NSWindow>();
        ns_window.setMovableByWindowBackground(true);
    }
}
