"""Author Agent 1v1 Chat API — streaming with thinking mode."""
import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
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
    trimmed = messages[-50:]
    p.write_text(json.dumps(trimmed, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Tool dispatch ──

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

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

# ── API Models ──

class ChatRequest(BaseModel):
    message: str

# ── Endpoints ──

@router.get("/{book_id}/history")
async def get_history(book_id: str):
    history = _load_history(book_id)
    display = [m for m in history if m.get("role") in ("user", "assistant")]
    return {"messages": display}

@router.delete("/{book_id}/history")
async def clear_history(book_id: str):
    _save_history(book_id, [])
    return {"status": "ok"}

@router.post("/{book_id}/send")
async def send_message(book_id: str, req: ChatRequest):
    """Send message to Author Agent. Returns SSE stream with thinking + content."""
    
    async def generate():
        llm = get_llm_client()
        
        system_prompt = (
            AGENT_SYSTEM_PROMPTS["author"] + "\n\n"
            "你正在与人类用户直接对话。用户可能给你下达写作任务、要求修改大纲、"
            "查询设定、或讨论创作方向。你可以使用所有工具来完成任务。\n"
            "回复时使用中文。完成写入操作后告诉用户你做了什么。"
        )
        
        history = _load_history(book_id)
        history.append({"role": "user", "content": req.message})
        
        # Build LLM messages
        llm_messages = [{"role": "system", "content": system_prompt}] + history[-20:]
        
        tools_used = []
        max_loops = 10
        
        # ── Phase 1: Tool-calling loop (non-streaming, fast) ──
        for loop_i in range(max_loops):
            try:
                if not hasattr(llm, "client"):
                    # Fallback: no streaming support
                    reply = await llm.generate_with_fallback(system_prompt, req.message)
                    yield _sse({"type": "content", "token": reply})
                    yield _sse({"type": "done"})
                    history.append({"role": "assistant", "content": reply})
                    _save_history(book_id, history)
                    return
                
                params = {
                    "model": llm.model_name,
                    "messages": llm_messages,
                    "temperature": 0.7,
                    "tools": AUTHOR_TOOLS,
                    "tool_choice": "auto"
                }
                response = await llm.client.chat.completions.create(**params)
                message = response.choices[0].message
                
                # Append assistant message to context
                if hasattr(message, "model_dump"):
                    msg_dict = message.model_dump(exclude_none=True)
                else:
                    msg_dict = {"role": "assistant", "content": message.content}
                    if getattr(message, "tool_calls", None):
                        msg_dict["tool_calls"] = [
                            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                            for tc in message.tool_calls
                        ]
                llm_messages.append(msg_dict)
                
                if getattr(message, "tool_calls", None):
                    # Execute tools, emit events
                    for tc in message.tool_calls:
                        args = json.loads(tc.function.arguments)
                        name = tc.function.name
                        tools_used.append(name)
                        
                        yield _sse({"type": "tool_start", "name": name, "args_preview": str(args)[:200]})
                        
                        result = _dispatch_tool(name, book_id, args)
                        
                        yield _sse({"type": "tool_done", "name": name, "result_preview": str(result)[:200]})
                        
                        llm_messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": name,
                            "content": str(result)
                        })
                    continue  # Loop back for more tools
                else:
                    # No tool calls — ready for final streaming response
                    break
                    
            except Exception as e:
                logger.error(f"Tool loop error: {e}")
                yield _sse({"type": "error", "message": str(e)})
                history.append({"role": "assistant", "content": f"错误: {e}"})
                _save_history(book_id, history)
                return
        
        # ── Phase 2: Final response — streaming with thinking ──
        try:
            # Remove tools param, add thinking mode
            stream_params = {
                "model": llm.model_name,
                "messages": llm_messages,
                "temperature": 0.7,
                "stream": True,
                "extra_body": {"enable_thinking": True}
            }
            
            content_parts = []
            thinking_parts = []
            
            stream = await llm.client.chat.completions.create(**stream_params)
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                
                # Thinking tokens (reasoning_content from DeepSeek)
                reasoning = getattr(delta, 'reasoning_content', None)
                if reasoning:
                    thinking_parts.append(reasoning)
                    yield _sse({"type": "thinking", "token": reasoning})
                
                # Content tokens
                if delta.content:
                    content_parts.append(delta.content)
                    yield _sse({"type": "content", "token": delta.content})
            
            final_content = "".join(content_parts)
            final_thinking = "".join(thinking_parts)
            
            if not final_content:
                final_content = "(Author Agent 没有生成回复)"
                yield _sse({"type": "content", "token": final_content})
            
        except Exception as e:
            logger.warning(f"Streaming with thinking failed, falling back: {e}")
            # Fallback: use the non-streaming response from the last loop iteration
            try:
                fallback_params = {
                    "model": llm.model_name,
                    "messages": llm_messages,
                    "temperature": 0.7,
                }
                fallback_resp = await llm.client.chat.completions.create(**fallback_params)
                final_content = fallback_resp.choices[0].message.content or ""
                final_thinking = ""
                yield _sse({"type": "content", "token": final_content})
            except Exception as e2:
                final_content = f"错误: {e2}"
                final_thinking = ""
                yield _sse({"type": "error", "message": str(e2)})
        
        # Save to history
        history.append({"role": "assistant", "content": final_content})
        _save_history(book_id, history)
        
        yield _sse({"type": "done", "tools_used": tools_used, "has_thinking": bool(final_thinking)})
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
