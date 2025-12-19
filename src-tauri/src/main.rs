// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{State, Manager};

mod ai;
mod file_system;
mod token_counter;

use file_system::*;
use ai::*;
use token_counter::*;

// Shared state for token counter
type SharedTokenCounter = Arc<Mutex<TokenCounter>>;

fn main() {
    let token_counter = Arc::new(Mutex::new(TokenCounter::new()));

    tauri::Builder::default()
        .manage(token_counter)
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            create_directory,
            directory_exists,
            file_exists,
            generate_ai_suggestion,
            count_tokens_exact,
            smart_truncate_text,
            estimate_api_cost,
            count_tokens_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}