// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::State;

// Import modules
mod ai;
mod file_system;
mod token_counter;

// Import all the command functions
use crate::ai::generate_ai_suggestion;
use crate::file_system::{read_file, write_file, create_directory, directory_exists, file_exists};
use crate::token_counter::{TokenCounter, count_tokens_exact, smart_truncate_text, estimate_api_cost, count_tokens_batch};

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