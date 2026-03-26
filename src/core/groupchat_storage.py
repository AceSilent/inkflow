"""
AutoNovel-Studio v5.0 — Dual-Layer Chat Storage for Multi-Agent Group Chat.
- chat_full.json: complete history (UI display, never deleted)
- chat_context.json: compressed context window (LLM input)
Supports channels: group chat + private 1:1 chats.
"""
import json
import time
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 1.5
KEEP_RECENT_TOKENS = 50_000


def _books_dir() -> Path:
    import os
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _channel_dir(book_id: str, channel_id: str = "group") -> Path:
    return _books_dir() / book_id / "brainstorm" / "channels" / channel_id


def _full_file(book_id: str, channel_id: str = "group") -> Path:
    return _channel_dir(book_id, channel_id) / "chat_full.json"


def _context_file(book_id: str, channel_id: str = "group") -> Path:
    return _channel_dir(book_id, channel_id) / "chat_context.json"


def _summaries_dir(book_id: str) -> Path:
    return _books_dir() / book_id / "brainstorm" / "summaries"


def make_msg_id() -> str:
    return f"gc_{uuid.uuid4().hex[:8]}"


# ── Full History (UI layer — never delete) ──

def load_full_history(book_id: str, channel_id: str = "group") -> List[Dict[str, Any]]:
    """Load complete chat history for UI display. Never compressed/deleted."""
    path = _full_file(book_id, channel_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("messages", [])
    return []


def append_full_history(book_id: str, messages: List[Dict[str, Any]], channel_id: str = "group"):
    """Append messages to full history (append-only, never delete)."""
    path = _full_file(book_id, channel_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("messages", [])
    for msg in messages:
        if not msg.get("id"):
            msg["id"] = make_msg_id()
        if not msg.get("ts"):
            msg["ts"] = time.time()
    existing.extend(messages)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"messages": existing}, f, ensure_ascii=False, indent=2)


# ── Context Window (LLM layer — compressed) ──

def load_context(book_id: str, channel_id: str = "group") -> Dict[str, Any]:
    """Load compressed context for LLM consumption."""
    path = _context_file(book_id, channel_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"messages": [], "summary": ""}


def save_context(book_id: str, context: Dict[str, Any], channel_id: str = "group"):
    path = _context_file(book_id, channel_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(context, f, ensure_ascii=False, indent=2)


def append_context_messages(book_id: str, messages: List[Dict[str, Any]], channel_id: str = "group"):
    """Append messages to context window."""
    ctx = load_context(book_id, channel_id)
    for msg in messages:
        if not msg.get("id"):
            msg["id"] = make_msg_id()
        if not msg.get("ts"):
            msg["ts"] = time.time()
    ctx["messages"].extend(messages)
    save_context(book_id, ctx, channel_id)


def build_llm_context(book_id: str, channel_id: str = "group") -> str:
    """Build the context string for LLM consumption with clear speaker attribution."""
    ROLE_LABELS = {
        "human": "👤人类(用户)",
        "proposer": "💡提案策划",
        "devil": "😈魔鬼代言人",
        "author": "✍️作者",
        "editor": "👑总编辑",
    }
    ctx = load_context(book_id, channel_id)
    parts = []
    if ctx.get("summary"):
        parts.append(f"[历史摘要]\n{ctx['summary']}")
    recent = ctx.get("messages", [])[-30:]
    if recent:
        lines = []
        for m in recent:
            role = m.get("role", "?")
            label = ROLE_LABELS.get(role, m.get("display_name", role))
            content = m.get("content", "")
            if m.get("is_pass"):
                lines.append(f"[{label}]: [无补充/PASS]")
            else:
                lines.append(f"[{label}]: {content[:2000]}")
        parts.append("[近期对话]\n" + "\n\n".join(lines))
    return "\n\n".join(parts) if parts else ""


# ── Channel Management ──

DEFAULT_CHANNELS = [
    {"channel_id": "group", "channel_type": "group",
     "participants": ["human", "editor", "proposer", "devil", "author"],
     "display_name": "群聊"},
    {"channel_id": "human_editor", "channel_type": "private",
     "participants": ["human", "editor"], "display_name": "我↔总编辑"},
    {"channel_id": "human_author", "channel_type": "private",
     "participants": ["human", "author"], "display_name": "我↔作者"},
    {"channel_id": "human_proposer", "channel_type": "private",
     "participants": ["human", "proposer"], "display_name": "我↔策划"},
    {"channel_id": "human_devil", "channel_type": "private",
     "participants": ["human", "devil"], "display_name": "我↔魔鬼"},
    {"channel_id": "author_editor", "channel_type": "private",
     "participants": ["author", "editor"], "display_name": "作者↔编辑"},
]


def list_channels(book_id: str) -> List[Dict[str, Any]]:
    """List all available channels for a book."""
    channels_dir = _books_dir() / book_id / "brainstorm" / "channels"
    result = []
    for ch in DEFAULT_CHANNELS:
        ch_dir = channels_dir / ch["channel_id"]
        full_path = ch_dir / "chat_full.json"
        msg_count = 0
        if full_path.exists():
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    msg_count = len(json.load(f).get("messages", []))
            except Exception:
                pass
        result.append({**ch, "message_count": msg_count})
    return result


# ── Compression (LLM layer only, UI layer untouched) ──

async def maybe_compress_context(book_id: str, channel_id: str = "group"):
    """Compress old context messages into summary if over token limit.
    Only affects chat_context.json — chat_full.json is NEVER modified."""
    import os
    keep_tokens = int(os.environ.get("AUTONOVEL_KEEP_TOKENS", KEEP_RECENT_TOKENS))
    ctx = load_context(book_id, channel_id)
    msgs = ctx.get("messages", [])
    total = sum(int(len(m.get("content", "")) / CHARS_PER_TOKEN) for m in msgs)
    if total <= keep_tokens:
        return

    # Find split point — keep recent tokens
    kept = 0
    split_idx = len(msgs)
    for i in range(len(msgs) - 1, -1, -1):
        t = int(len(msgs[i].get("content", "")) / CHARS_PER_TOKEN)
        if kept + t > keep_tokens:
            split_idx = i + 1
            break
        kept += t

    if split_idx <= 0:
        return

    overflow = msgs[:split_idx]
    recent = msgs[split_idx:]
    old_summary = ctx.get("summary", "")
    overflow_text = "\n".join(
        f"{m.get('display_name', m.get('role', '?'))}: {m.get('content', '')[:500]}"
        for m in overflow
    )

    text_to_summarize = ""
    if old_summary:
        text_to_summarize += f"之前的摘要：\n{old_summary}\n\n"
    text_to_summarize += f"新增对话：\n{overflow_text}"

    try:
        from src.core.llm_factory import get_llm_client
        llm = get_llm_client("author")
        summary = await llm.generate_text(
            system_prompt=(
                "你是编辑助手。将以下多Agent讨论浓缩为摘要（500字以内），"
                "保留所有关键设定决策、角色信息、世界观要素、情节方向。"
            ),
            user_prompt=text_to_summarize,
            temperature=0.3,
            max_tokens=1000,
        )
    except Exception as e:
        logger.warning(f"Context compression failed: {e}")
        summary = text_to_summarize[:1000]

    # Save summary snapshot
    sdir = _summaries_dir(book_id)
    sdir.mkdir(parents=True, exist_ok=True)
    idx = len(list(sdir.glob("summary_*.json"))) + 1
    with open(sdir / f"summary_{idx:03d}.json", "w", encoding="utf-8") as f:
        json.dump({
            "channel_id": channel_id,
            "compressed_messages": len(overflow),
            "summary": summary.strip(),
            "ts": time.time()
        }, f, ensure_ascii=False, indent=2)

    ctx["summary"] = summary.strip()
    ctx["messages"] = recent
    save_context(book_id, ctx, channel_id)
    logger.info(f"Compressed {len(overflow)} messages in {channel_id}, kept {len(recent)}")
