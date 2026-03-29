"""
AutoNovel-Studio v4.0 — Brainstorm API Routes
Handles AI Director chat, conversation rollback, outline generation, and tool messages.
"""
import json as json_mod
import os
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from src.core.llm_factory import get_llm_client
from src.core.chat_session import (
    load_session, append_messages, delete_messages,
    clear_session, update_lore, maybe_compress, truncate_at
)

router = APIRouter(prefix="/brainstorm", tags=["brainstorm"])


# ── Models ──

class BrainstormChatRequest(BaseModel):
    book_id: str
    message: str
    current_lore: Dict[str, Any] = {}

class BrainstormChatResponse(BaseModel):
    reply: str = Field(description="The conversational reply to the user.")
    extracted_lore: Optional[Dict[str, str]] = Field(
        default=None,
        description="Newly extracted lore. Keys: protagonist, worldSetting, synopsis."
    )

class DeleteMessagesRequest(BaseModel):
    ids: List[str]

class TruncateRequest(BaseModel):
    message_id: str

class OutlineNode(BaseModel):
    id: str
    label: str
    type: str  # "volume", "chapter", "scene"
    summary: Optional[str] = None
    children: Optional[List["OutlineNode"]] = []

class GenerateOutlineResponse(BaseModel):
    children: List[OutlineNode] = Field(description="List of volumes, each containing chapters")

OutlineNode.model_rebuild()


# ── Chat History Endpoints ──

@router.get("/{book_id}/history")
async def get_chat_history(book_id: str):
    """Load the full chat session for a book (messages + summary + lore)."""
    session = load_session(book_id)
    return session


@router.delete("/{book_id}/history")
async def clear_chat_history(book_id: str):
    """Clear all messages, summary, and lore for a book."""
    session = clear_session(book_id)
    return session


@router.post("/{book_id}/history/delete")
async def delete_chat_messages(book_id: str, req: DeleteMessagesRequest):
    """Delete specific messages by ID list."""
    session = delete_messages(book_id, req.ids)
    return session


@router.post("/{book_id}/history/truncate")
async def truncate_chat(book_id: str, req: TruncateRequest):
    """Rollback conversation to before a specific message.
    Returns the truncated message content for re-editing."""
    result = truncate_at(book_id, req.message_id)
    return result


# ── Chat Endpoint (with tool messages) ──

@router.post("/chat", response_model=BrainstormChatResponse)
async def brainstorm_chat(req: BrainstormChatRequest):
    """Collaborative chat with the AI Director. Persists to disk automatically."""
    llm = get_llm_client("author")

    # Load existing session for context
    session = load_session(req.book_id)
    summary = session.get("summary", "")
    history = session.get("messages", [])

    # Build system prompt with current lore and summary
    system_parts = [
        "你是顶级网文制作人（AI Director）。你正在和一个网文作者头脑风暴他的新书。",
        "你需要通过对话，一步步引导作者完善设定（主角背景、世界观体系、核心梗概冲突）。",
        f"当前设定：{req.current_lore}",
    ]
    if summary:
        system_parts.append(f"\n[之前的讨论摘要]\n{summary}")
    
    system_parts.append(
        "\n回答要求：\n"
        "1. reply 字段给出你的回复，语言要专业、有建设性，像个内行编辑。如果作者毫无头绪，你可以主动抛出几个很有趣的脑洞供他选择。\n"
        "2. 如果你在对话中和作者敲定了新的设定细节，请在 extracted_lore 字段中提取出来（只更新变化的部分，key 必须是 protagonist, worldSetting, 或 synopsis 之一）。如果没有新的设定变动，extracted_lore 设为 null。\n"
        "3. 保持热情和启发性！"
    )
    system_prompt = "\n".join(system_parts)

    # Build recent history as conversation context (skip tool messages)
    recent_msgs = [m for m in history if m.get("role") != "tool"][-10:]
    history_str = "\n".join([f"{m['role']}: {m['content'][:800]}" for m in recent_msgs])
    user_prompt = f"最近对话:\n{history_str}\n\n用户新消息:\n{req.message}"

    import re as _re
    raw = await llm.generate_text(
        system_prompt=system_prompt,
        user_prompt=(
            user_prompt + "\n\n"
            "请以纯JSON格式回复，格式如下：\n"
            '{"reply":"你的回复内容","extracted_lore":null}\n'
            "如果提取了设定，extracted_lore格式为：\n"
            '{"protagonist":"主角设定","worldSetting":"世界观","synopsis":"梗概"}\n'
            "只包含有变更的字段。直接输出JSON，不要有其他文字。"
        ),
        temperature=0.7
    )
    # Parse JSON from raw text
    raw = raw.strip()
    json_data = None
    try:
        json_data = json_mod.loads(raw)
    except (json_mod.JSONDecodeError, ValueError):
        pass
    if json_data is None:
        m = _re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', raw, _re.DOTALL)
        if m:
            try:
                json_data = json_mod.loads(m.group(1).strip())
            except (json_mod.JSONDecodeError, ValueError):
                pass
    if json_data is None:
        first = raw.find('{')
        last = raw.rfind('}')
        if first >= 0 and last > first:
            candidate = raw[first:last+1]
            candidate = _re.sub(r',\s*([}\]])', r'\1', candidate)
            try:
                json_data = json_mod.loads(candidate)
            except (json_mod.JSONDecodeError, ValueError):
                pass
    if json_data is None:
        # Fallback: treat entire raw as reply text
        json_data = {"reply": raw, "extracted_lore": None}
    result = BrainstormChatResponse(**json_data)

    # Build messages to persist: user msg + AI reply + optional tool msgs
    all_msgs = [
        {"role": "user", "content": req.message},
        {"role": "assistant", "content": result.reply},
    ]

    # Emit tool message for lore extraction
    if result.extracted_lore:
        update_lore(req.book_id, result.extracted_lore)
        lore_keys = list(result.extracted_lore.keys())
        key_labels = {"protagonist": "主角设定", "worldSetting": "世界观", "synopsis": "核心梗概"}
        labels = [key_labels.get(k, k) for k in lore_keys]
        all_msgs.append({
            "role": "tool",
            "content": f"已提取设定：{'、'.join(labels)}",
            "tool_type": "lore_extraction",
            "tool_data": result.extracted_lore,
        })

    # Persist all messages
    append_messages(req.book_id, all_msgs)

    # Check if we need to compress (sliding window)
    await maybe_compress(req.book_id)

    return result


# ── Outline Generation ──

@router.post("/{book_id}/generate-outline")
async def generate_outline(book_id: str):
    """Generate structured outline from brainstorm conversation context."""
    import re
    
    session = load_session(book_id)
    summary = session.get("summary", "")
    msgs = session.get("messages", [])
    lore = session.get("lore", {})

    # Build concise context
    context_parts = []
    if summary:
        context_parts.append(f"[对话摘要]\n{summary}")
    if lore:
        context_parts.append(f"[当前设定]\n{json_mod.dumps(lore, ensure_ascii=False)}")

    recent = [m for m in msgs if m.get("role") != "tool"][-10:]
    chat_text = "\n".join([f"{m['role']}: {m['content'][:500]}" for m in recent])
    context_parts.append(f"[近期对话]\n{chat_text}")

    full_context = "\n\n".join(context_parts)

    from pydantic import BaseModel, Field
    from typing import List as TList
    
    class OutlineChapter(BaseModel):
        model_config = {"extra": "ignore"}
        id: str = ""
        label: str = ""
        type: str = "chapter"
        summary: str = ""
    
    class OutlineVolume(BaseModel):
        model_config = {"extra": "ignore"}
        id: str = ""
        label: str = ""
        type: str = "volume"
        summary: str = ""
        children: TList[OutlineChapter] = Field(default_factory=list)
    
    class OutlineResponse(BaseModel):
        model_config = {"extra": "ignore"}
        children: TList[OutlineVolume] = Field(default_factory=list)
    
    llm = get_llm_client("author")
    
    import re as _re
    raw_outline = await llm.generate_text(
        system_prompt=(
            "你是专业的网文架构师。根据以下创意讨论内容，生成JSON格式的小说大纲。\n"
            "要求：\n"
            "1. 按照讨论中的卷结构拆分为多卷\n"
            "2. 每卷包含15-20个章节\n"
            "3. 每章的summary用一句话概括本章的核心事件和冲突\n"
            "4. id格式：卷用vol_1, vol_2...章用ch_1_1, ch_1_2...\n"
            "5. label格式：第X卷：标题 / 第X章：标题\n"
        ),
        user_prompt=(
            full_context + "\n\n"
            "请以纯JSON格式输出大纲，格式：\n"
            '{"children":[{"id":"vol_1","label":"第一卷：标题","type":"volume","summary":"卷简介",'
            '"children":[{"id":"ch_1_1","label":"第1章：标题","type":"chapter","summary":"章节摘要"}]}]}\n'
            "直接输出JSON，不要有其他文字。"
        ),
    )
    # Parse JSON from raw text
    raw_outline = raw_outline.strip()
    outline_data = None
    try:
        outline_data = json_mod.loads(raw_outline)
    except (json_mod.JSONDecodeError, ValueError):
        pass
    if outline_data is None:
        m = _re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', raw_outline, _re.DOTALL)
        if m:
            try:
                outline_data = json_mod.loads(m.group(1).strip())
            except (json_mod.JSONDecodeError, ValueError):
                pass
    if outline_data is None:
        first = raw_outline.find('{')
        last = raw_outline.rfind('}')
        if first >= 0 and last > first:
            candidate = raw_outline[first:last+1]
            candidate = _re.sub(r',\s*([}\]])', r'\1', candidate)
            try:
                outline_data = json_mod.loads(candidate)
            except (json_mod.JSONDecodeError, ValueError):
                pass
    if outline_data is None:
        raise Exception(f"Failed to parse outline JSON: {raw_outline[:300]}")
    result = OutlineResponse(**outline_data)
    
    children = [vol.model_dump() for vol in result.children]

    # Load book meta for label
    books_dir = Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))
    book_dir = books_dir / book_id
    meta_file = book_dir / "book_meta.json"
    title = book_id
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as mf:
            title = json_mod.load(mf).get("title", book_id)

    outline = {
        "id": book_id,
        "label": title,
        "type": "book",
        "children": children
    }

    # Save outline
    outline_file = book_dir / "outlines" / "outline.json"
    outline_file.parent.mkdir(parents=True, exist_ok=True)
    with open(outline_file, "w", encoding="utf-8") as f:
        json_mod.dump(outline, f, ensure_ascii=False, indent=2)

    # Count volumes and chapters
    vol_count = len(children)
    ch_count = sum(len(v.get("children", [])) for v in children if isinstance(v, dict))

    # Append tool message
    append_messages(book_id, [{
        "role": "tool",
        "content": f"已生成大纲：{vol_count} 卷，共 {ch_count} 章",
        "tool_type": "outline_generation",
        "tool_data": {"volumes": vol_count, "chapters": ch_count},
    }])

    return outline

