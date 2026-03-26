import os
import json
import logging
from typing import Dict, Any
from pathlib import Path
from src.core.llm_factory import get_llm_client

logger = logging.getLogger(__name__)

def _get_lore_dir(book_id: str) -> Path:
    data_dir = os.environ.get("AUTONOVEL_DATA_DIR", "books")
    return Path(data_dir) / book_id / "01_Global_Settings"

async def extract_and_update_lore(book_id: str, new_text: str) -> None:
    """Passively analyze the given new text (from a completed task) and extract new/updated lore entities."""
    if not new_text or len(new_text.strip()) < 50:
        return
        
    llm = get_llm_client()
    system_prompt = (
        "你是「考据/设定保管员」（Lore Agent）。\n"
        "你的任务是仔细阅读这段刚刚完成的正文片段，从中提取出任何**新的、重要的**设定信息：\n"
        "1. 新出现的人物、地点、物品、功法体系等。\n"
        "2. 已知人物的重大变化（如修为突破、断臂、拿到新武器）。\n"
        "\n"
        "请以严格的 JSON 格式输出你的提取结果：\n"
        "{\n"
        "  \"characters\": {\"CharacterName\": {\"desc\": \"Short update or description\"}},\n"
        "  \"world_lore\": {\"LocationOrItem\": {\"desc\": \"Description\"}}\n"
        "}\n"
        "如果没有值得提取的设定，请返回: {\"characters\": {}, \"world_lore\": {}}"
    )
    
    user_prompt = f"最新正文片段：\n{new_text[:3000]}" # Limit size if needed
    
    try:
        response = await llm.generate_with_fallback(system_prompt, user_prompt, response_format={"type": "json_object"})
        
        if isinstance(response, str):
            data = json.loads(response)
        else:
            data = response
            
        new_chars = data.get("characters", {})
        new_world = data.get("world_lore", {})
        
        # Merge characters
        if new_chars:
            _merge_lore_file(book_id, "characters.json", new_chars)
            
        # Merge world lore
        if new_world:
            _merge_lore_file(book_id, "world_lore.json", new_world)
            
    except Exception as e:
        logger.error(f"Lore extraction failed: {e}")

def _merge_lore_file(book_id: str, filename: str, new_data: Dict[str, Any]) -> None:
    lore_dir = _get_lore_dir(book_id)
    lore_dir.mkdir(parents=True, exist_ok=True)
    file_path = lore_dir / filename
    
    existing_data = {}
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception:
            existing_data = {}
            
    # Simple top-level key merge
    for key, val in new_data.items():
        if key in existing_data and isinstance(existing_data[key], dict) and isinstance(val, dict):
            existing_data[key].update(val)
        else:
            existing_data[key] = val
            
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)
