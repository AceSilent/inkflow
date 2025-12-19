use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AIRequest {
    pub prompt: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub model: String,
    pub stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIResponse {
    pub content: String,
    pub model: String,
    pub usage: TokenUsage,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub estimated_cost: Option<f64>,
}

#[tauri::command]
pub async fn generate_ai_suggestion(request: AIRequest) -> Result<AIResponse, String> {
    // TODO: Implement actual AI service integration
    // For now, return a mock response

    let mock_response = AIResponse {
        content: "这是一个模拟的AI续写建议。请继续您的故事创作...".to_string(),
        model: request.model,
        usage: TokenUsage {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            estimated_cost: Some(0.002),
        },
    };

    Ok(mock_response)
}