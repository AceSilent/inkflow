use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::api::dialog::FileDialogBuilder;
use tauri::{Manager, Window};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    path: String,
    exists: bool,
    is_directory: bool,
    size: Option<u64>,
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Err(format!("Failed to create directory: {}", e));
        }
    }

    match fs::write(&path, content) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e)),
    }
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    match fs::create_dir_all(&path) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to create directory: {}", e)),
    }
}

#[tauri::command]
pub async fn directory_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists() && Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists() && Path::new(&path).is_file())
}

// Utility function to open file dialog
pub fn open_file_dialog(window: &Window) -> Option<String> {
    FileDialogBuilder::new()
        .add_filter("Text Files", &["txt", "md"])
        .add_filter("JSON Files", &["json"])
        .pick_file()
}

// Utility function to save file dialog
pub fn save_file_dialog(window: &Window, default_name: &str) -> Option<String> {
    FileDialogBuilder::new()
        .add_filter("Text Files", &["txt", "md"])
        .add_filter("JSON Files", &["json"])
        .set_file_name(default_name)
        .save_file()
}