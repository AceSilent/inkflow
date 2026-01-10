use serde::{Deserialize, Serialize};
use reqwest::Client;
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

// ChatGLM API 请求结构 (兼容 Anthropic 格式)
#[derive(Debug, Serialize)]
struct ChatGLMRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

// ChatGLM API 响应结构
#[derive(Debug, Deserialize)]
struct ChatGLMResponse {
    id: Option<String>,
    choices: Vec<Choice>,
    model: String,
    usage: Option<Usage>,
    #[serde(flatten)]
    _extra: serde_json::Value, // 兼容不同响应格式
}

#[derive(Debug, Deserialize)]
struct Choice {
    index: Option<u32>,
    message: Option<Message>,
    delta: Option<Delta>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Message {
    role: Option<String>,
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[tauri::command]
pub async fn generate_ai_suggestion(
    request: AIRequest,
    api_key: Option<String>,
    api_base_url: Option<String>,
) -> Result<AIResponse, String> {
    // 检查是否配置了 API Key
    let api_key = match api_key {
        Some(key) if !key.is_empty() => key,
        _ => {
            let error_msg = "未配置 API Key，请在设置中配置";
            #[cfg(debug_assertions)]
            println!("⚠️  {}", error_msg);
            return Err(error_msg.to_string());
        }
    };

    let api_base = api_base_url.unwrap_or_else(||
        "https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string()
    );

    #[cfg(debug_assertions)]
    {
        println!("🚀 Calling AI API: {}", api_base);
        println!("📝 Model: {}", request.model);
    }

    let client = Client::new();

    // 构建请求
    let chat_request = ChatGLMRequest {
        model: request.model.clone(),
        messages: vec![
            ChatMessage {
                role: "user".to_string(),
                content: request.prompt.clone(),
            }
        ],
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: false,
    };

    // 发送请求
    let response = client
        .post(&api_base)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("x-api-key", &api_key) // Anthropic 格式需要
        .header("anthropic-version", "2023-06-01") // Anthropic 版本头
        .json(&chat_request)
        .send()
        .await
        .map_err(|e| format!("API请求失败: {}", e))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        #[cfg(debug_assertions)]
        println!("❌ API返回错误: {} - {}", status, response_text);
        return Err(format!("API返回错误 ({}): {}", status, response_text));
    }

    // 解析响应
    let chat_response: ChatGLMResponse = serde_json::from_str(&response_text)
        .map_err(|e| {
            #[cfg(debug_assertions)]
            {
                println!("❌ 解析响应失败: {}", e);
                println!("📄 响应内容: {}", response_text);
            }
            format!("解析响应失败: {}", e)
        })?;

    // 提取内容
    let content = if let Some(choice) = chat_response.choices.first() {
        if let Some(msg) = &choice.message {
            if let Some(c) = &msg.content {
                c.clone()
            } else if let Some(delta) = &choice.delta {
                delta.content.clone().unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        return Err("API返回空响应".to_string());
    };

    if content.is_empty() {
        return Err("API返回内容为空".to_string());
    }

    let usage = chat_response.usage.unwrap_or(Usage {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
    });

    #[cfg(debug_assertions)]
    println!("✅ API调用成功，生成内容长度: {} 字符", content.len());

    Ok(AIResponse {
        content,
        model: chat_response.model,
        usage: TokenUsage {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            estimated_cost: None,
        },
    })
}

// Mock 响应生成器（当 API 未配置时使用）
async fn generate_mock_response(request: &AIRequest) -> Result<AIResponse, String> {
    let mock_suggestions = vec![
        "夜幕降临，城市的霓虹灯开始闪烁，街道上的行人渐渐稀少。",
        "微风吹过，带来了远方的花香，也吹起了心中的涟漪。",
        "雨滴敲打着窗户，发出清脆的声响，仿佛在诉说着什么。",
        "阳光透过云层的缝隙洒向大地，给这个清晨带来了温暖。",
        "月光如水般洒在湖面上，泛起层层银色的涟漪。",
        "远山如黛，近水含烟，构成了一幅绝美的山水画卷。",
    ];

    let mut rng = rand::thread_rng();
    let selected_suggestion = mock_suggestions[rng.gen_range(0..mock_suggestions.len())];

    #[cfg(debug_assertions)]
    println!("🎭 Using mock suggestion: {}", selected_suggestion);

    Ok(AIResponse {
        content: selected_suggestion.to_string(),
        model: request.model.clone(),
        usage: TokenUsage {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            estimated_cost: Some(0.002),
        },
    })
}