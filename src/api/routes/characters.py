"""
AutoNovel-Studio v4.0 — Characters API Routes
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Optional

router = APIRouter(prefix="/characters", tags=["characters"])


class CharacterUpdate(BaseModel):
    known_facts: Optional[List[str]] = None
    false_beliefs: Optional[List[str]] = None
    hidden_motives: Optional[List[str]] = None


# In-memory demo state
_character_states: Dict[str, Dict[str, dict]] = {
    "default": {
        "lin_chen": {
            "name": "林辰",
            "role": "主角",
            "known_facts": ["叶流云昨夜去过禁地", "大长老的法器被人动过"],
            "false_beliefs": ["以为师尊没有参与暗杀"],
            "hidden_motives": ["复仇——找到前世杀害自己的幕后黑手"],
        },
        "ye_liuyun": {
            "name": "叶流云",
            "role": "对手",
            "known_facts": ["林辰身上有异常灵力波动"],
            "false_beliefs": ["认为自己的秘密无人知晓"],
            "hidden_motives": ["获取禁地中的上古传承"],
        },
        "mu_qingge": {
            "name": "慕青歌",
            "role": "女主",
            "known_facts": ["林辰与叶流云之间有嫌隙"],
            "false_beliefs": ["认为林辰只是普通弟子"],
            "hidden_motives": ["调查父亲失踪的真相"],
        },
    }
}


@router.get("/{book_id}/states")
async def get_character_states(book_id: str):
    """Get all character states for a book."""
    states = _character_states.get(book_id, _character_states.get("default", {}))
    return states


@router.put("/{book_id}/states/{char_id}")
async def update_character(book_id: str, char_id: str, update: CharacterUpdate):
    """Update a character's cognition state."""
    if book_id not in _character_states:
        _character_states[book_id] = dict(_character_states.get("default", {}))

    char = _character_states[book_id].get(char_id)
    if not char:
        return {"error": f"角色 {char_id} 不存在"}

    if update.known_facts is not None:
        char["known_facts"] = update.known_facts
    if update.false_beliefs is not None:
        char["false_beliefs"] = update.false_beliefs
    if update.hidden_motives is not None:
        char["hidden_motives"] = update.hidden_motives

    return char


@router.get("/{book_id}/gaps")
async def get_information_gaps(book_id: str):
    """Get the information gap matrix."""
    states = _character_states.get(book_id, _character_states.get("default", {}))
    chars = list(states.keys())
    matrix = {}
    for c1 in chars:
        matrix[c1] = {}
        for c2 in chars:
            if c1 != c2:
                matrix[c1][c2] = len(states.get(c2, {}).get("false_beliefs", []))
    return {"characters": chars, "matrix": matrix}
