"""
AutoNovel-Studio v4.0 — Settings API Routes
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

router = APIRouter(prefix="/settings", tags=["settings"])

class ProviderConfig(BaseModel):
    id: str
    name: str
    baseUrl: str
    apiKey: str
    models: List[str]

class SettingsUpdate(BaseModel):
    providers: Optional[List[ProviderConfig]] = None
    authorModel: Optional[str] = None
    editorModel: Optional[str] = None
    readerModel: Optional[str] = None
    outputDir: Optional[str] = None

def _format_model(env_var: str, default: str) -> str:
    """Ensure model string has provider prefix like 'dashscope/kimi-k2.5'."""
    val = os.environ.get(env_var, default)
    if "/" not in val:
        return f"dashscope/{val}"
    return val

# In-memory settings with multi-provider default
_settings = {
    "providers": [
        {
            "id": "dashscope",
            "name": "阿里云百炼 (DashScope)",
            "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
            "apiKey": os.environ.get("OPENAI_API_KEY", ""),
            "models": ["kimi-k2.5", "qwen3.5-plus", "qwen3-max-2026-01-23", "glm-5", "MiniMax-M2.5"]
        },
        {
            "id": "openai",
            "name": "OpenAI",
            "baseUrl": "https://api.openai.com/v1",
            "apiKey": "",
            "models": ["gpt-4o", "gpt-4o-mini", "o1-preview", "o3-mini"]
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "baseUrl": "https://api.deepseek.com",
            "apiKey": "",
            "models": ["deepseek-chat", "deepseek-coder"]
        }
    ],
    "authorModel": _format_model("AUTHOR_MODEL", "dashscope/kimi-k2.5"),
    "editorModel": _format_model("EDITOR_MODEL", "dashscope/kimi-k2.5"),
    "readerModel": _format_model("READER_MODEL", "dashscope/kimi-k2.5"),
    "outputDir": os.environ.get("AUTONOVEL_DATA_DIR", "books"),
}

def get_settings_sync() -> Dict[str, Any]:
    """Expose settings to other backend modules synchronously."""
    return _settings

@router.get("/")
async def get_settings():
    """Get current settings with masked API keys."""
    import copy
    safe = copy.deepcopy(_settings)
    for p in safe.get("providers", []):
        key = p.get("apiKey", "")
        if key:
            p["apiKey"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    return safe


@router.put("/")
async def update_settings(update: SettingsUpdate):
    """Update settings."""
    if update.providers is not None:
        # Only update if the key is not masked
        new_providers = []
        for p in update.providers:
            p_dict = p.model_dump()
            if p_dict["apiKey"].endswith("..."):
                # Retain old key
                old_p = next((old for old in _settings["providers"] if old["id"] == p.id), None)
                if old_p:
                    p_dict["apiKey"] = old_p["apiKey"]
            new_providers.append(p_dict)
        _settings["providers"] = new_providers
        
    if update.authorModel is not None:
        _settings["authorModel"] = update.authorModel
    if update.editorModel is not None:
        _settings["editorModel"] = update.editorModel
    if update.readerModel is not None:
        _settings["readerModel"] = update.readerModel
    if update.outputDir is not None:
        _settings["outputDir"] = update.outputDir
    return {"status": "saved"}
