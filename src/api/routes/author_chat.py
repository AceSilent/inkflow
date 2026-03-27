"""Author Agent 1v1 Chat API — direct conversation with tool-calling Author."""
import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.core.llm_factory import get_llm_client
from src.core.agent_tools import (
    AUTHOR_TOOLS, read_file, search_lore, read_outline,
    load_skill, save_draft, submit_for_review, save_outline, save_lore
)
from src.core.groupchat_orchestrator import AGENT_SYSTEM_PROMPTS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/author-chat", tags=["author-chat"])

# ── Chat history storage ──

def _history_path(book_id: str) -> Path:
    from src.core.agent_tools import _get_book_dir
    p = _get_book_dir(book_id) / "author_chat_history.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

def _load_history(book_id: str) -> list:
    p = _history_path(book_id)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save_history(book_id: str, messages: list):
    p = _history_path(book_id)
    # Keep only last 50 messages to avoid unbounded growth
    trimmed = messages[-50:]
    p.write_text(json.dumps(trimmed, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Tool dispatch (reuse same logic as workflow_engine) ──

def _dispatch_tool(name: str, book_id: str, args: dict) -> str:
    if name == "read_file":
        return read_file(book_id, args.get("relative_path", ""))
    elif name == "search_lore":
        return search_lore(book_id, args.get("query", ""))
    elif name == "read_outline":
        return read_outline(book_id, args.get("volume"))
    elif name == "load_skill":
        return load_skill(args.get("skill_name", ""))
    elif name == "save_draft":
        return save_draft(book_id, args.get("file_path", ""), args.get("content", ""))
    elif name == "save_outline":
        return save_outline(book_id, args.get("outline_json", ""))
    elif name == "save_lore":
        return save_lore(book_id, args.get("category", ""), args.get("content_json", ""))
    elif name == "submit_for_review":
        return submit_for_review(book_id, args.get("task_id", ""), args.get("draft_text", ""))
    else:
        return f"Error: Unknown tool {name}"

# ── API Models ──

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str
    tool_calls: list = []  # List of tool names called during this turn

# ── Endpoints ──

@router.get("/{book_id}/history")
async def get_history(book_id: str):
    """Get the chat history for display."""
    history = _load_history(book_id)
    # Filter to only user/assistant messages (not system/tool)
    display = [m for m in history if m.get("role") in ("user", "assistant")]
    return {"messages": display}

@router.delete("/{book_id}/history")
async def clear_history(book_id: str):
    """Clear the chat history."""
    _save_history(book_id, [])
    return {"status": "ok"}

@router.post("/{book_id}/send")
async def send_message(book_id: str, req: ChatRequest):
    """Send a message to the Author Agent and get a response."""
    llm = get_llm_client()
    
    system_prompt = (
        AGENT_SYSTEM_PROMPTS["author"] + "\n\n"
        "你正在与人类用户直接对话。用户可能给你下达写作任务、要求修改大纲、"
        "查询设定、或讨论创作方向。你可以使用所有工具来完成任务。\n"
        "回复时使用中文。完成写入操作后告诉用户你做了什么。"
    )
    
    # Load existing history
    history = _load_history(book_id)
    
    # Add user message
    history.append({"role": "user", "content": req.message})
    
    # Build messages for LLM (system + recent history)
    messages = [{"role": "system", "content": system_prompt}] + history[-20:]
    
    max_loops = 10
    tools_used = []
    final_reply = ""
    
    for _ in range(max_loops):
        try:
            if not hasattr(llm, "client"):
                final_reply = await llm.generate_with_fallback(system_prompt, req.message)
                break
            
            params = {
                "model": llm.model_name,
                "messages": messages,
                "temperature": 0.7,
                "tools": AUTHOR_TOOLS,
                "tool_choice": "auto"
            }
            response = await llm.client.chat.completions.create(**params)
            message = response.choices[0].message
            
            # Append assistant message
            if hasattr(message, "model_dump"):
                msg_dict = message.model_dump(exclude_none=True)
            else:
                msg_dict = {"role": "assistant", "content": message.content}
                if getattr(message, "tool_calls", None):
                    msg_dict["tool_calls"] = [
                        {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                        for tc in message.tool_calls
                    ]
            messages.append(msg_dict)
            
            if getattr(message, "tool_calls", None):
                for tc in message.tool_calls:
                    args = json.loads(tc.function.arguments)
                    result = _dispatch_tool(tc.function.name, book_id, args)
                    tools_used.append(tc.function.name)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.function.name,
                        "content": str(result)
                    })
                continue
            else:
                final_reply = message.content or ""
                break
                
        except Exception as e:
            logger.error(f"Author chat error: {e}")
            final_reply = f"抱歉，处理你的请求时出错了：{e}"
            break
    
    if not final_reply:
        final_reply = "（Author Agent 没有生成回复）"
    
    # Save to history (only user + assistant, not tool messages)
    history.append({"role": "assistant", "content": final_reply})
    _save_history(book_id, history)
    
    return ChatResponse(reply=final_reply, tool_calls=tools_used)
