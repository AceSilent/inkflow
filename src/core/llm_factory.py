"""
LLM Client Factory
Provides a unified way to instantiate LLM clients based on dynamic multi-provider settings.
"""
from typing import Optional
from src.core.openai_client import OpenAILLMClient
from src.api.routes.settings import get_settings_sync

def get_llm_client(role: str = "author") -> OpenAILLMClient:
    """
    Get an LLM client configured for the specified role based on global settings.
    
    Args:
        role: "author", "editor", or "reader"
    """
    settings = get_settings_sync()
    
    # Get the configured model string, e.g., "dashscope/kimi-k2.5"
    model_str = settings.get(f"{role}Model", "dashscope/kimi-k2.5")
    
    provider_id = "openai"
    model_name = "gpt-4o-mini"
    
    if "/" in model_str:
        provider_id, model_name = model_str.split("/", 1)
    else:
        model_name = model_str
        
    # Find the corresponding provider config
    provider = next((p for p in settings.get("providers", []) if p["id"] == provider_id), None)
    
    if not provider:
        # Fallback if provider not found
        api_key = settings.get("apiKey", "")
        base_url = settings.get("baseUrl", "https://api.openai.com/v1")
    else:
        api_key = provider.get("apiKey", "")
        base_url = provider.get("baseUrl", "")
        
    return OpenAILLMClient(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url
    )
