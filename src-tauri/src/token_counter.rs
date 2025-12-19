use std::collections::{HashMap, HashSet};
use tiktoken_rs::{CoreBPE};

pub struct TokenCounter {
    bpe_map: HashMap<String, CoreBPE>,
}

impl TokenCounter {
    pub fn new() -> Self {
        let mut bpe_map = HashMap::new();

        // Initialize common model tokenizers
        if let Ok(bpe) = tiktoken_rs::cl100k_base() {
            let bpe_clone = bpe.clone();
            bpe_map.insert("gpt-3.5-turbo".to_string(), bpe_clone);
            bpe_map.insert("gpt-4".to_string(), bpe.clone());
            bpe_map.insert("gpt-4-turbo".to_string(), bpe);
        }

        Self { bpe_map }
    }

    pub fn get_bpe_for_model(&self, model: &str) -> Option<&CoreBPE> {
        match model {
            m if m.starts_with("gpt-4") || m.starts_with("gpt-3.5") => self.bpe_map.get("gpt-4"),
            _ => self.bpe_map.get("gpt-3.5-turbo"),
        }
    }

    pub fn count_tokens(&self, text: &str, model: &str) -> Result<usize, String> {
        let bpe = self.get_bpe_for_model(model)
            .ok_or_else(|| format!("Model {} is not supported", model))?;

        let tokens = bpe.encode(text, HashSet::new());
        Ok(tokens.len())
    }

    pub fn find_smart_truncate_position(&self, text: &str, target_tokens: usize, model: &str) -> Result<usize, String> {
        let bpe = self.get_bpe_for_model(model)
            .ok_or_else(|| format!("Model {} is not supported", model))?;

        let tokens = bpe.encode(text, HashSet::new());

        if tokens.len() <= target_tokens {
            return Ok(text.len());
        }

        // Try to truncate at sentence boundaries
        let truncated_tokens = &tokens[..target_tokens];
        let truncated_text = bpe.decode(truncated_tokens.to_vec()).map_err(|e| e.to_string())?;

        // Find the nearest sentence ending
        let sentence_endings = [".", "!", "?", "。", "！", "？"];
        let mut best_position = truncated_text.len();

        for ending in &sentence_endings {
            if let Some(pos) = truncated_text.rfind(ending) {
                if pos + ending.len() > best_position {
                    best_position = pos + ending.len();
                }
            }
        }

        // If no sentence ending found, truncate at paragraph boundary
        if best_position == truncated_text.len() {
            if let Some(pos) = truncated_text.rfind("\n\n") {
                best_position = pos;
            }
        }

        // Find corresponding position in original text
        let bytes = text.as_bytes();
        let truncated_bytes = bytes.get(0..best_position).unwrap_or(bytes);
        Ok(std::str::from_utf8(truncated_bytes).unwrap_or(text).len())
    }

    pub fn estimate_cost(&self, prompt_tokens: u32, completion_tokens: u32, model: &str) -> f64 {
        let pricing = match model {
            m if m.starts_with("gpt-4-turbo") => (0.01, 0.03),
            m if m.starts_with("gpt-4") => (0.03, 0.06),
            m if m.starts_with("gpt-3.5-turbo") => (0.0015, 0.002),
            _ => (0.0015, 0.002),
        };

        let (prompt_price_per_m, completion_price_per_m) = pricing;
        let prompt_cost = (prompt_tokens as f64 / 1_000_000.0) * prompt_price_per_m;
        let completion_cost = (completion_tokens as f64 / 1_000_000.0) * completion_price_per_m;

        prompt_cost + completion_cost
    }
}

#[tauri::command]
pub async fn count_tokens_exact(
    text: String,
    model: String,
    token_counter: tauri::State<'_, std::sync::Arc<std::sync::Mutex<TokenCounter>>>
) -> Result<usize, String> {
    let counter = token_counter.lock().unwrap();
    counter.count_tokens(&text, &model)
}

#[tauri::command]
pub async fn smart_truncate_text(
    text: String,
    target_tokens: usize,
    model: String,
    token_counter: tauri::State<'_, std::sync::Arc<std::sync::Mutex<TokenCounter>>>
) -> Result<String, String> {
    let counter = token_counter.lock().unwrap();
    let truncate_pos = counter.find_smart_truncate_position(&text, target_tokens, &model)?;
    Ok(text[..truncate_pos].to_string())
}

#[tauri::command]
pub async fn estimate_api_cost(
    prompt: String,
    model: String,
    token_counter: tauri::State<'_, std::sync::Arc<std::sync::Mutex<TokenCounter>>>
) -> Result<f64, String> {
    let counter = token_counter.lock().unwrap();
    let prompt_tokens = counter.count_tokens(&prompt, &model)? as u32;
    let estimated_completion_tokens = (prompt_tokens as f64 * 0.4) as u32;
    Ok(counter.estimate_cost(prompt_tokens, estimated_completion_tokens, &model))
}

#[tauri::command]
pub async fn count_tokens_batch(
    texts: Vec<String>,
    model: String,
    token_counter: tauri::State<'_, std::sync::Arc<std::sync::Mutex<TokenCounter>>>
) -> Result<Vec<usize>, String> {
    let counter = token_counter.lock().unwrap();
    let mut results = Vec::new();

    for text in texts {
        let token_count = counter.count_tokens(&text, &model)?;
        results.push(token_count);
    }

    Ok(results)
}