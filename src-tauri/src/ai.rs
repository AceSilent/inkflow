use serde::{Deserialize, Serialize};
use rand::Rng;

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
    // For now, return a mock response with random suggestions matching frontend

    // Mock suggestions pool (matching frontend MOCK_SUGGESTIONS)
    let mock_suggestions = vec![
        "夜幕降临，城市的霓虹灯开始闪烁，街道上的行人渐渐稀少。",
        "微风吹过，带来了远方的花香，也吹起了心中的涟漪。",
        "雨滴敲打着窗户，发出清脆的声响，仿佛在诉说着什么。",
        "阳光透过云层的缝隙洒向大地，给这个清晨带来了温暖。",
        "月光如水般洒在湖面上，泛起层层银色的涟漪。",
        "远山如黛，近水含烟，构成了一幅绝美的山水画卷。",
    ];

    // Randomly select a suggestion
    let mut rng = rand::thread_rng();
    let selected_suggestion = mock_suggestions[rng.gen_range(0..mock_suggestions.len())];

    let mock_response = AIResponse {
        content: selected_suggestion.to_string(),
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