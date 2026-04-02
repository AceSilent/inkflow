"""Author Agent 1v1 Chat API — unified streaming agent loop with thinking mode."""
import json
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.core.llm_factory import get_llm_client
from src.core.agent_tools import (
    AUTHOR_TOOLS, TERMINAL_TOOLS,
    read_file, search_lore, read_outline,
    load_skill, list_skills, save_draft, submit_for_review, save_outline, save_lore,
    read_tree, add_plot_node, confirm_path, prune_branch, merge_branches,
    present_options, request_guidance, browse_examples,
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

def _sanitize_for_llm(messages: list) -> list:
    """Strip UI-only fields from history before sending to LLM API.
    
    Saved history may contain 'tool_calls' as a list of plain strings (tool names)
    which is only for UI display. The LLM API expects proper ToolCall dicts.
    Also strip 'thinking', 'segments', 'id', 'hasAttachments', etc.
    """
    clean = []
    for msg in messages:
        entry = {"role": msg["role"], "content": msg.get("content", "")}
        # Only keep tool_calls if they are proper dicts (not string tool names)
        if "tool_calls" in msg and isinstance(msg["tool_calls"], list):
            if msg["tool_calls"] and isinstance(msg["tool_calls"][0], dict) and "function" in msg["tool_calls"][0]:
                entry["tool_calls"] = msg["tool_calls"]
        # Keep tool role fields
        if msg["role"] == "tool":
            if "tool_call_id" in msg:
                entry["tool_call_id"] = msg["tool_call_id"]
            if "name" in msg:
                entry["name"] = msg["name"]
        clean.append(entry)
    return clean

def _save_history(book_id: str, messages: list):
    p = _history_path(book_id)
    trimmed = messages[-50:]
    p.write_text(json.dumps(trimmed, ensure_ascii=False, indent=2), encoding="utf-8")

# ── Tool dispatch ──

def _dispatch_tool(name: str, book_id: str, args: dict) -> tuple[str, bool]:
    """Dispatch a tool call. Returns (result_string, is_terminal)."""
    is_terminal = name in TERMINAL_TOOLS

    if name == "read_file":
        return read_file(book_id, args.get("relative_path", "")), False
    elif name == "search_lore":
        return search_lore(book_id, args.get("query", "")), False
    elif name == "read_outline":
        return read_outline(book_id, args.get("volume")), False
    elif name == "load_skill":
        return load_skill(args.get("skill_name", "")), False
    elif name == "list_skills":
        return list_skills(), False
    elif name == "save_draft":
        return save_draft(book_id, args.get("file_path", ""), args.get("content", "")), False
    elif name == "save_outline":
        return save_outline(book_id, args.get("outline_json", "")), False
    elif name == "save_lore":
        return save_lore(book_id, args.get("category", ""), args.get("content_json", "")), False
    # Tree tools
    elif name == "read_tree":
        return read_tree(book_id, args.get("node_id")), False
    elif name == "add_plot_node":
        return add_plot_node(book_id, args.get("parent", ""), args.get("node_type", ""),
                             args.get("title", ""), args.get("description", ""),
                             args.get("characters", "")), False
    elif name == "confirm_path":
        return confirm_path(book_id, args.get("node_id", "")), False
    elif name == "prune_branch":
        return prune_branch(book_id, args.get("node_id", ""), args.get("reason", "")), False
    elif name == "merge_branches":
        return merge_branches(book_id, args.get("branch_ids", ""), args.get("convergence_title", "")), False
    elif name == "browse_examples":
        return browse_examples(book_id, args.get("category", ""), args.get("keyword", "")), False
    # Terminal tools
    elif name == "submit_for_review":
        return submit_for_review(book_id, args.get("task_id", ""), args.get("draft_text", "")), True
    elif name == "present_options":
        return present_options(book_id, args.get("description", ""), args.get("options", "")), True
    elif name == "request_guidance":
        return request_guidance(book_id, args.get("question", ""), args.get("context", "")), True
    else:
        return f"Error: Unknown tool {name}", False

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

def _should_enable_thinking(llm) -> bool:
    """Decide whether to send enable_thinking based on provider/model.

    - "only-thinking" models (kimi-k2-thinking, qwq-plus, deepseek-r1) always think
      and do NOT accept the enable_thinking param.
    - DashScope / DeepSeek mixed-thinking models need enable_thinking=True.
    - OpenAI and others don't support it.
    """
    provider = getattr(llm, '_provider_id', '')
    model = getattr(llm, 'model_name', '')

    only_thinking_models = ('kimi-k2-thinking', 'qwq-plus', 'qwq-32b', 'deepseek-r1')
    if any(m in model for m in only_thinking_models):
        return False  # model always thinks, no param needed

    if provider in ('dashscope', 'deepseek'):
        return True

    return False


@router.post("/{book_id}/send")
async def send_message(book_id: str, req: ChatRequest):
    """Send message to Author Agent — unified streaming agent loop."""

    async def generate():
        llm = get_llm_client()
        enable_thinking = _should_enable_thinking(llm)

        system_prompt = (
            AGENT_SYSTEM_PROMPTS["author"] + "\n\n"
            "你正在与人类用户直接对话。用户可能给你下达写作任务、要求修改大纲、"
            "查询设定、或讨论创作方向。你可以使用所有工具来完成任务。\n"
            "回复时使用中文。完成写入操作后告诉用户你做了什么。"
        )

        history = _load_history(book_id)
        history.append({"role": "user", "content": req.message})

        llm_messages = [{"role": "system", "content": system_prompt}] + _sanitize_for_llm(history[-20:])

        tools_used = []
        all_thinking = []
        all_content = []
        agent_hit_terminal = False

        yield _sse({"type": "status", "phase": "agent_loop"})

        # ── Unified streaming agent loop — no iteration limit ──
        use_streaming_tools = True  # will flip to False on fallback

        while True:
            loop_thinking = []
            loop_content = []
            finish_reason = None
            completed_tool_calls = []

            if use_streaming_tools:
                try:
                    async for event in llm.generate_with_tools_stream(
                        messages=llm_messages,
                        tools=AUTHOR_TOOLS,
                        temperature=0.7,
                        enable_thinking=enable_thinking,
                    ):
                        if event["type"] == "thinking":
                            loop_thinking.append(event["token"])
                            yield _sse({"type": "thinking", "token": event["token"]})

                        elif event["type"] == "content":
                            loop_content.append(event["token"])
                            yield _sse({"type": "content", "token": event["token"]})

                        elif event["type"] == "finish":
                            finish_reason = event["finish_reason"]
                            completed_tool_calls = event["tool_calls"]

                except Exception as e:
                    # Streaming + tools failed — fallback to non-streaming loop
                    logger.warning(f"Streaming tools loop failed: {e}, falling back to non-streaming")
                    use_streaming_tools = False

            if not use_streaming_tools:
                # ── Fallback: non-streaming tool loop (same as old Phase 1) ──
                # Reset per-loop state since streaming didn't complete
                loop_thinking = []
                loop_content = []
                finish_reason = None
                completed_tool_calls = []
                try:
                    if not hasattr(llm, "client"):
                        reply = await llm.generate_with_fallback(system_prompt, req.message)
                        yield _sse({"type": "content", "token": reply})
                        history.append({"role": "assistant", "content": reply})
                        _save_history(book_id, history)
                        yield _sse({"type": "done", "tools_used": tools_used, "has_thinking": False})
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

                    if getattr(message, "tool_calls", None):
                        # Build assistant msg dict for LLM context
                        if hasattr(message, "model_dump"):
                            msg_dict = message.model_dump(exclude_none=True)
                        else:
                            msg_dict = {"role": "assistant", "content": message.content or ""}
                            msg_dict["tool_calls"] = [
                                {"id": tc.id, "type": "function",
                                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                                for tc in message.tool_calls
                            ]
                        llm_messages.append(msg_dict)

                        # Dispatch each tool and emit SSE events
                        for tc in message.tool_calls:
                            args = json.loads(tc.function.arguments)
                            name = tc.function.name
                            tools_used.append(name)

                            yield _sse({"type": "tool_start", "name": name, "args_preview": str(args)[:200]})
                            result, is_terminal = _dispatch_tool(name, book_id, args)
                            yield _sse({"type": "tool_done", "name": name, "result_preview": str(result)[:200]})
                            if is_terminal:
                                agent_hit_terminal = True

                            llm_messages.append({
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "name": name,
                                "content": str(result)
                            })

                        # Set vars so shared "Process loop results" will continue
                        finish_reason = "tool_calls"
                        completed_tool_calls = [
                            {"id": tc.id, "type": "function",
                             "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                            for tc in message.tool_calls
                        ]
                        # Fall through to shared "Process loop results" → continue

                    else:
                        # No tool calls — this IS the final reply
                        finish_reason = "stop"
                        loop_content = [message.content or ""]

                except Exception as e:
                    logger.error(f"Non-streaming tool loop error: {e}")
                    yield _sse({"type": "error", "message": str(e)})
                    history.append({"role": "assistant", "content": f"错误: {e}"})
                    _save_history(book_id, history)
                    return

            # ── Process loop results ──
            thinking_text = "".join(loop_thinking)
            content_text = "".join(loop_content)
            if thinking_text:
                all_thinking.append(thinking_text)

            has_tool_calls = (
                bool(completed_tool_calls)
                or finish_reason in ("tool_calls", "function_call")
            )

            if has_tool_calls and completed_tool_calls:
                # Build assistant message with tool_calls for context
                assistant_msg = {"role": "assistant", "content": content_text or ""}
                assistant_msg["tool_calls"] = [
                    {"id": tc["id"], "type": "function",
                     "function": {"name": tc["function"]["name"],
                                  "arguments": tc["function"]["arguments"]}}
                    for tc in completed_tool_calls
                ]
                llm_messages.append(assistant_msg)

                # Dispatch each tool
                for tc in completed_tool_calls:
                    name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"]["arguments"])
                    except json.JSONDecodeError:
                        args = {}
                    tools_used.append(name)

                    yield _sse({"type": "tool_start", "name": name, "args_preview": str(args)[:200]})
                    result, is_terminal = _dispatch_tool(name, book_id, args)
                    yield _sse({"type": "tool_done", "name": name, "result_preview": str(result)[:200]})
                    if is_terminal:
                        agent_hit_terminal = True

                    llm_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "name": name,
                        "content": str(result)
                    })

                if agent_hit_terminal:
                    # Terminal tool was called — stop the loop
                    all_content.append(content_text)
                    break

                # Continue loop — agent gets tool results and decides next step
                continue

            else:
                # No tool calls — final response
                all_content.append(content_text)
                break

        # ── Finalize ──
        final_content = "".join(all_content) or "(Author Agent 没有生成回复)"
        if not all_content:
            yield _sse({"type": "content", "token": final_content})

        final_thinking = "\n---\n".join(t for t in all_thinking if t)

        assistant_entry = {"role": "assistant", "content": final_content}
        if final_thinking:
            assistant_entry["thinking"] = final_thinking
        if tools_used:
            assistant_entry["tool_calls"] = tools_used
        history.append(assistant_entry)
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
