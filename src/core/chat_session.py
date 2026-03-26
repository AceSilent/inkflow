"""
AutoNovel-Studio v4.0 — Brainstorm Chat Session Manager
Handles per-book chat persistence, sliding window summary, and message CRUD.
"""
import json
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from src.core.llm_factory import get_llm_client


def _get_books_dir() -> Path:
    import os
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _chat_file(book_id: str) -> Path:
    return _get_books_dir() / book_id / "brainstorm" / "chat.json"


def _make_msg_id() -> str:
    return f"msg_{uuid.uuid4().hex[:8]}"


# ── Load / Save ──

def load_session(book_id: str) -> Dict[str, Any]:
    """Load the full chat session from disk. Returns a default empty structure if not found."""
    path = _chat_file(book_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"messages": [], "summary": "", "lore": {}}


def save_session(book_id: str, session: Dict[str, Any]):
    """Persist session to disk."""
    path = _chat_file(book_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(session, f, ensure_ascii=False, indent=2)


# ── Message CRUD ──

def append_messages(book_id: str, new_msgs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Append messages to session and save. Returns updated session."""
    session = load_session(book_id)
    for msg in new_msgs:
        if "id" not in msg:
            msg["id"] = _make_msg_id()
        if "ts" not in msg:
            msg["ts"] = time.time()
    session["messages"].extend(new_msgs)
    save_session(book_id, session)
    return session


def delete_messages(book_id: str, ids: List[str]) -> Dict[str, Any]:
    """Delete messages by ID. Returns updated session."""
    session = load_session(book_id)
    id_set = set(ids)
    session["messages"] = [m for m in session["messages"] if m["id"] not in id_set]
    save_session(book_id, session)
    return session


def truncate_at(book_id: str, message_id: str) -> Dict[str, Any]:
    """Truncate conversation: remove the message with given ID and everything after it.
    Returns updated session with the truncated message content (for re-editing)."""
    session = load_session(book_id)
    msgs = session["messages"]

    # Find the index of the target message
    target_idx = None
    for i, m in enumerate(msgs):
        if m["id"] == message_id:
            target_idx = i
            break

    if target_idx is None:
        return session  # message not found, no-op

    # Capture the content of the truncated message (to put back in input)
    truncated_content = msgs[target_idx].get("content", "")

    # Remove target and everything after
    session["messages"] = msgs[:target_idx]
    save_session(book_id, session)

    return {**session, "truncated_content": truncated_content}


def clear_session(book_id: str) -> Dict[str, Any]:
    """Clear all messages and summary. Returns empty session."""
    session = {"messages": [], "summary": "", "lore": {}}
    save_session(book_id, session)
    return session


def update_lore(book_id: str, lore_updates: Dict[str, str]) -> Dict[str, Any]:
    """Merge lore updates into the session."""
    session = load_session(book_id)
    session.setdefault("lore", {})
    session["lore"].update(lore_updates)
    save_session(book_id, session)
    return session


# ── Sliding Window Summary (Token-Based) ──

# Token estimation: ~1.5 chars per token for Chinese text
CHARS_PER_TOKEN = 1.5
KEEP_RECENT_TOKENS = 50_000   # don't compress the last N tokens
MAX_CONTEXT_TOKENS = 200_000  # model context window (configurable via env)


def _estimate_tokens(text: str) -> int:
    """Rough token estimate. Chinese ≈ 1.5 chars/token."""
    return int(len(text) / CHARS_PER_TOKEN)


def _session_token_count(msgs: list) -> int:
    """Total estimated tokens across all messages."""
    return sum(_estimate_tokens(m.get("content", "")) for m in msgs)


async def maybe_compress(book_id: str) -> Dict[str, Any]:
    """
    If total session tokens exceed KEEP_RECENT_TOKENS, compress older messages
    into a summary. Keeps the most recent ~KEEP_RECENT_TOKENS of conversation.
    """
    import os
    keep_tokens = int(os.environ.get("AUTONOVEL_KEEP_TOKENS", KEEP_RECENT_TOKENS))

    session = load_session(book_id)
    msgs = session["messages"]

    total_tokens = _session_token_count(msgs)
    if total_tokens <= keep_tokens:
        return session  # nothing to compress

    # Walk backwards to find the split point
    kept_tokens = 0
    split_idx = len(msgs)
    for i in range(len(msgs) - 1, -1, -1):
        msg_tokens = _estimate_tokens(msgs[i].get("content", ""))
        if kept_tokens + msg_tokens > keep_tokens:
            split_idx = i + 1
            break
        kept_tokens += msg_tokens

    if split_idx <= 0:
        return session  # everything fits

    overflow = msgs[:split_idx]
    recent = msgs[split_idx:]

    # Build text to summarize
    old_summary = session.get("summary", "")
    overflow_text = "\n".join([
        f"{m['role']}: {m['content'][:800]}" for m in overflow
    ])

    text_to_summarize = ""
    if old_summary:
        text_to_summarize += f"之前的摘要：\n{old_summary}\n\n"
    text_to_summarize += f"新增对话：\n{overflow_text}"

    try:
        llm = get_llm_client("author")
        summary = await llm.generate_text(
            system_prompt=(
                "你是一位专业编辑助手。请将以下对话历史浓缩为一段简洁摘要（500字以内），"
                "保留所有关键设定决策、角色信息、世界观要素、情节方向和已敲定的大纲结构。"
                "不要遗漏任何已经确认的重要细节。"
            ),
            user_prompt=text_to_summarize,
            temperature=0.3,
            max_tokens=1000
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Summary generation failed: {e}")
        lines = overflow_text.split("\n")
        summary = "\n".join(lines[:20]) + "\n..."

    session["summary"] = summary.strip()
    session["messages"] = recent
    save_session(book_id, session)
    return session

