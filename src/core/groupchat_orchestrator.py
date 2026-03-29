"""
AutoNovel-Studio v5.1 — Multi-Agent Group Chat Orchestrator.
Single-call streaming with native thinking mode (enable_thinking).
"""
import asyncio
import json
import re
import time
import logging
from typing import AsyncGenerator, Dict, Any, Optional, List
from pathlib import Path

from src.core.models import AgentState, FileEdit
from src.core.llm_factory import get_llm_client
from src.core.groupchat_storage import (
    load_full_history, append_full_history,
    append_context_messages, build_llm_context,
    maybe_compress_context, make_msg_id
)
from src.core.agent_memory import build_memory_context, ensure_core_memory_initialized

# Bootstrap core memory files on first import
ensure_core_memory_initialized()

logger = logging.getLogger(__name__)

# ── Agent Definitions ──

AGENTS = [
    AgentState(agent_id="proposer", display_name="提案策划", avatar_color="#4FC3F7"),
    AgentState(agent_id="devil", display_name="魔鬼代言人", avatar_color="#EF5350"),
    AgentState(agent_id="author", display_name="作者", avatar_color="#66BB6A"),
    AgentState(agent_id="editor", display_name="总编辑", avatar_color="#E6A817"),
]

AGENT_ICONS = {
    "proposer": "💡",
    "devil": "😈",
    "author": "✍️",
    "editor": "👑",
    "human": "👤",
}

AGENT_SYSTEM_PROMPTS = {
    "proposer": (
        "你是「提案策划」💡，一位极具创造力的故事策划师。\n"
        "你的职责是：推进创意、抛出脑洞、提供多个方案选择。\n"
        "风格：热情、发散性思维、不怕大胆。\n"
        "如果你觉得在当前话题上确实没有任何新的、有价值的观点可以补充，直接回复一个词: [PASS]\n"
        "注意：PASS是你自己基于实际思考做出的判断，只有在你真正没有新见解时才PASS。"
    ),
    "devil": (
        "你是「魔鬼代言人」😈，一位犀利的逻辑审查者。\n"
        "你的职责是：找逻辑漏洞、提出反对意见、挑战假设、防止平庸。\n"
        "风格：尖锐但有建设性，指出问题时必须给出替代方案。\n"
        "如果你觉得当前方案确实没有明显漏洞或可挑战之处，直接回复一个词: [PASS]\n"
        "注意：PASS是你自己基于实际思考做出的判断，只有在你真正找不到问题时才PASS。"
    ),
    "author": (
        "你是「作者」✍️，系统中最核心的创作引擎。\n"
        "你不是聊天机器人，而是拥有[工具箱]（Tools）的自主智能体。\n\n"
        "【铁律】\n"
        "- 动作泄密，不用旁白告知\n"
        "- 一段只许一个特写\n"
        "- 长短句交错呼吸\n"
        "- 数据库即圣经，查不到就不写\n"
        "- 写正文前先 load_skill('iceberg_writing')\n"
        "- 构思剧情前先 read_tree() 了解当前全局\n\n"
        "用 list_skills() 查看所有可用 skill。\n"
        "你的工作模式：自治循环调用工具直到完成任务，然后调用终止工具（如 present_options / submit_for_review）交给人类。\n"
        "注意：如果人类给你派发了写作或修改任务，你必须输出实质性的草稿文本，不要只是答应或讨论。"
    ),
    "editor": (
        "你是「总编辑」👑，一位资深的网文编辑。\n"
        "你和用户（作者）是搭档关系，一起探讨剧情、完善设定、打磨大纲。\n\n"
        "你的职责：\n"
        "- 认真阅读用户提供的设定和大纲，基于已有框架提出建议，不要推翻用户的架构\n"
        "- 帮助用户丰富剧情细节、设计支线、扩展场景\n"
        "- 发现逻辑漏洞时指出并给出修复建议\n"
        "- 当讨论充分时，明确说「拍板定案」并给出最终决策和要修改的内容\n"
        "- 你是唯一有权修改设定文件（大纲、卷纲、世界观、角色设定等）的人\n\n"
        "风格：专业、务实、尊重作者意图。每次回复都要有实质内容。\n"
        "如果你觉得没有需要补充的，直接回复一个词: [PASS]\n"
        "注意：PASS是你自己基于实际思考做出的判断，只有在你真正没有见解时才PASS。"
    ),
}


def _books_dir() -> Path:
    import os
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _load_book_context(book_id: str) -> Dict[str, Any]:
    """Load book metadata and lore for agent context."""
    book_dir = _books_dir() / book_id
    meta = {}
    lore = {}
    meta_file = book_dir / "book_meta.json"
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as f:
            meta = json.load(f)
    # Try multiple lore locations
    for lore_path in [book_dir / "lore" / "world_setting.json",
                       book_dir / "brainstorm" / "chat.json"]:
        if lore_path.exists():
            try:
                with open(lore_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "lore" in data:
                        lore = data["lore"]
                    else:
                        lore = data
                    break
            except Exception:
                pass
    return {"meta": meta, "lore": lore}


MAX_FILE_CHARS = 10000  # per file; larger files get truncated with notice

def _uploads_dir(book_id: str) -> Path:
    return _books_dir() / book_id / "brainstorm" / "uploads"


def _save_attachments(book_id: str, attachments: List[Dict]):
    """Persist uploaded attachments to disk so they survive across messages."""
    if not attachments:
        return
    udir = _uploads_dir(book_id)
    udir.mkdir(parents=True, exist_ok=True)
    for att in attachments:
        name = att.get("name", "unnamed.txt")
        content = att.get("content", "")
        fpath = udir / name
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
    logger.info(f"Saved {len(attachments)} attachments to {udir}")


def _load_attachments(book_id: str) -> List[Dict]:
    """Load all persisted attachments from disk."""
    udir = _uploads_dir(book_id)
    if not udir.exists():
        return []
    result = []
    for fpath in sorted(udir.iterdir()):
        if fpath.is_file():
            try:
                content = fpath.read_text(encoding="utf-8")
                result.append({"name": fpath.name, "content": content})
            except Exception:
                pass
    return result

def _build_documents_xml(attachments: List[Dict]) -> str:
    """Wrap uploaded file attachments in <documents> XML for optimal LLM attention."""
    if not attachments:
        return ""
    parts = ['<documents>']
    for i, att in enumerate(attachments, 1):
        name = att.get('name', f'file_{i}')
        content = att.get('content', '')
        # Truncate large files with notice
        if len(content) > MAX_FILE_CHARS:
            content = content[:MAX_FILE_CHARS] + f'\n... [文件过长，已截断至前{MAX_FILE_CHARS}字符，共{len(att.get("content", ""))}字符]'
        parts.append(f'    <document index="{i}">')
        parts.append(f'        <source>{name}</source>')
        parts.append(f'        <content>')
        parts.append(f'{content}')
        parts.append(f'        </content>')
        parts.append(f'    </document>')
    parts.append('</documents>')
    return '\n'.join(parts)


def _parse_json_safe(raw: str) -> Optional[Any]:
    """Try to extract JSON from raw text."""
    raw = raw.strip()
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        pass
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            pass
    first = raw.find('{')
    last = raw.rfind('}')
    if first == -1:
        first = raw.find('[')
        last = raw.rfind(']')
    if first >= 0 and last > first:
        candidate = raw[first:last + 1]
        candidate = re.sub(r',\s*([}\]])', r'\1', candidate)
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            pass
    return None


async def _editor_parse_file_edits(llm, reply: str, book_id: str, book_ctx: Dict) -> List[Dict]:
    """If the editor said '拍板', extract file edits."""
    if "拍板" not in reply and "定案" not in reply:
        return []
    try:
        raw = await llm.generate_text(
            system_prompt=(
                "你是文件编辑解析器。根据总编辑的拍板内容，提取需要修改的文件操作。\n"
                "以JSON数组格式输出：[{\"file_path\":\"路径\",\"edit_type\":\"update\",\"content\":\"内容\",\"summary\":\"摘要\"}]\n"
                "可修改的文件：outlines/outline.json, lore/world_setting.json, lore/characters.json, book_meta.json\n"
                "如果没有明确的文件修改需求，返回: []"
            ),
            user_prompt=f"总编辑拍板内容：\n{reply}\n\n当前元数据：{json.dumps(book_ctx.get('meta', {}), ensure_ascii=False)[:500]}",
            temperature=0.2,
        )
        data = _parse_json_safe(raw)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "edits" in data:
            return data["edits"]
    except Exception as e:
        logger.error(f"File edit extraction failed: {e}")
    return []


async def _execute_file_edits(book_id: str, edits: List[Dict]) -> List[Dict]:
    """Execute file edits and return confirmed edits."""
    book_dir = _books_dir() / book_id
    confirmed = []
    for edit in edits:
        try:
            fp = book_dir / edit["file_path"]
            fp.parent.mkdir(parents=True, exist_ok=True)
            if edit.get("edit_type") == "append":
                existing = fp.read_text(encoding="utf-8") if fp.exists() else ""
                fp.write_text(existing + "\n" + edit["content"], encoding="utf-8")
            else:
                fp.write_text(edit["content"], encoding="utf-8")
            confirmed.append(edit)
            logger.info(f"File edit: {edit['file_path']} ({edit.get('summary', '')})")
        except Exception as e:
            logger.error(f"File edit failed for {edit.get('file_path')}: {e}")
    return confirmed


async def _stream_agent_turn(
    llm,
    agent_id: str,
    display_name: str,
    avatar_color: str,
    system_prompt: str,
    full_context: str,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stream a single agent's turn using native thinking mode.
    Single LLM call with stream=True + enable_thinking=True.
    Yields SSE events: thinking_token, content_token, agent_reply (final).
    """
    thinking_parts = []
    content_parts = []

    # Emit: agent is now thinking
    yield {"event": "agent_thinking", "data": {
        "agent": agent_id, "display_name": display_name,
        "avatar_color": avatar_color,
    }}

    try:
        async for chunk_type, token in llm.generate_text_stream(
            system_prompt=system_prompt,
            user_prompt=full_context,
            temperature=0.7,
            max_tokens=16384,
            enable_thinking=True,
        ):
            if chunk_type == "thinking":
                thinking_parts.append(token)
                # Stream thinking tokens to frontend
                yield {"event": "thinking_token", "data": {
                    "agent": agent_id, "token": token,
                }}
            else:
                content_parts.append(token)
                # Stream content tokens to frontend
                yield {"event": "content_token", "data": {
                    "agent": agent_id, "token": token,
                }}
    except Exception as e:
        logger.error(f"Agent {agent_id} stream failed: {e}")
        content_parts.append(f"(生成失败: {e})")

    thinking = "".join(thinking_parts)
    reply = "".join(content_parts).strip()

    # PASS detection: only if the ENTIRE reply is essentially just [PASS]
    # Do NOT treat as PASS if substantial content was already generated
    stripped = reply.replace("[PASS]", "").replace("PASS", "").strip()
    is_pass = (
        len(reply) < 30  # very short reply
        and ("[PASS]" in reply or reply.upper() == "PASS")
    )

    # If reply has [PASS] embedded in real content, strip the tag
    if not is_pass and "[PASS]" in reply:
        reply = reply.replace("[PASS]", "").strip()

    # Yield the final assembled message
    yield {"event": "agent_reply", "data": {
        "agent": agent_id,
        "display_name": display_name,
        "content": "" if is_pass else reply,
        "thinking": thinking,
        "is_pass": is_pass,
        "avatar_color": avatar_color,
    }}


async def run_groupchat_round(
    book_id: str,
    human_message: str,
    channel_id: str = "group",
    attachments: List[Dict] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run one round of multi-agent group chat.
    Yields SSE events for each agent's streaming tokens and replies.
    """
    llm = get_llm_client("author")
    book_ctx = _load_book_context(book_id)
    memory_ctx = build_memory_context(book_id)

    # Build display content with attachment indicator
    att_names = [a.get('name', '') for a in (attachments or []) if a.get('name')]
    display_content = human_message
    if att_names:
        display_content += f"\n[附件: {', '.join(att_names)}]"

    # Persist human message to both layers
    human_msg = {
        "id": make_msg_id(),
        "role": "human",
        "display_name": "人类",
        "avatar_color": "#9E9E9E",
        "content": display_content,
        "is_pass": False,
        "round_number": 0,
        "ts": time.time(),
    }
    if att_names:
        human_msg["attachments"] = att_names
    append_full_history(book_id, [human_msg], channel_id)
    append_context_messages(book_id, [human_msg], channel_id)

    # Inject file contents as a context message (lives in history, compressible)
    if attachments:
        documents_xml = _build_documents_xml(attachments)
        doc_msg = {
            "id": make_msg_id(),
            "role": "system",
            "display_name": "参考文档",
            "avatar_color": "#607D8B",
            "content": f"请仔细阅读以下参考文件，根据 <source> 区分不同文件来源：\n{documents_xml}",
            "is_pass": False,
            "ts": time.time(),
        }
        append_context_messages(book_id, [doc_msg], channel_id)

    round_num = 0
    should_stop = False

    while not should_stop:
        round_num += 1
        passes_this_round = 0
        editor_finalized = False

        for agent in AGENTS:
            agent_id = agent.agent_id
            display_name = agent.display_name
            avatar_color = agent.avatar_color
            system_prompt = AGENT_SYSTEM_PROMPTS[agent_id]

            # Inject memory into system prompt
            if memory_ctx:
                system_prompt = f"{system_prompt}\n\n{memory_ctx}"

            # Build LLM context
            context = build_llm_context(book_id, channel_id)
            meta = book_ctx.get("meta", {})
            book_info = f"书名: {meta.get('title', '未命名')} | 类型: {meta.get('genre', '未知')}"
            full_context = f"{book_info}\n\n{context}"

            # Stream agent turn (thinking + content tokens)
            thinking = ""
            reply = ""
            is_pass = False

            async for event in _stream_agent_turn(
                llm, agent_id, display_name, avatar_color,
                system_prompt, full_context
            ):
                if event["event"] == "agent_reply":
                    # Final assembled reply — extract fields
                    thinking = event["data"]["thinking"]
                    reply = event["data"]["content"]
                    is_pass = event["data"]["is_pass"]
                    # Don't yield yet — we need to add metadata
                else:
                    # Pass through streaming tokens
                    yield event

            msg = {
                "id": make_msg_id(),
                "role": agent_id,
                "display_name": display_name,
                "avatar_color": avatar_color,
                "content": "" if is_pass else reply,
                "thinking": thinking,
                "is_pass": is_pass,
                "file_edits": [],
                "round_number": round_num,
                "ts": time.time(),
            }

            # Editor file edits (only if editor and not pass)
            file_edits_data = []
            if agent_id == "editor" and not is_pass:
                edits = await _editor_parse_file_edits(llm, reply, book_id, book_ctx)
                if edits:
                    confirmed = await _execute_file_edits(book_id, edits)
                    msg["file_edits"] = confirmed
                    file_edits_data = confirmed
                    if confirmed:
                        editor_finalized = True

            # Persist to both layers
            append_full_history(book_id, [msg], channel_id)
            append_context_messages(book_id, [msg], channel_id)

            # Emit: final agent reply with full metadata
            yield {
                "event": "agent_reply",
                "data": {
                    "agent": agent_id,
                    "display_name": display_name,
                    "content": msg["content"],
                    "thinking": thinking,
                    "is_pass": is_pass,
                    "avatar_color": avatar_color,
                    "round_number": round_num,
                    "file_edits": file_edits_data,
                    "id": msg["id"],
                    "ts": msg["ts"],
                },
            }

            if is_pass:
                passes_this_round += 1

        # Check termination conditions
        if passes_this_round == len(AGENTS):
            should_stop = True
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "all_passed"}}
        elif editor_finalized:
            should_stop = True
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "editor_finalized"}}
        else:
            # Continue to next round
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "continue"}}

    # Compress context if needed (UI layer untouched)
    await maybe_compress_context(book_id, channel_id)


async def run_private_chat(
    book_id: str,
    channel_id: str,
    sender: str,
    message: str,
    participants: List[str],
    attachments: List[Dict] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run a private 1:1 chat turn with streaming.
    sender sends a message, the other participant(s) reply.
    """
    llm = get_llm_client("author")
    book_ctx = _load_book_context(book_id)
    memory_ctx = build_memory_context(book_id)

    # Determine sender info
    sender_name = "人类" if sender == "human" else next(
        (a.display_name for a in AGENTS if a.agent_id == sender), sender
    )
    sender_color = "#9E9E9E" if sender == "human" else next(
        (a.avatar_color for a in AGENTS if a.agent_id == sender), "#666"
    )

    # Build display content with attachment indicator
    att_names = [a.get('name', '') for a in (attachments or []) if a.get('name')]
    display_content = message
    if att_names:
        display_content += f"\n[附件: {', '.join(att_names)}]"

    # Persist sender message
    sender_msg = {
        "id": make_msg_id(),
        "role": sender,
        "display_name": sender_name,
        "avatar_color": sender_color,
        "content": display_content,
        "is_pass": False,
        "round_number": 0,
        "ts": time.time(),
    }
    if att_names:
        sender_msg["attachments"] = att_names
    append_full_history(book_id, [sender_msg], channel_id)
    append_context_messages(book_id, [sender_msg], channel_id)

    # Inject file contents as a context message (compressible by memory system)
    if attachments:
        documents_xml = _build_documents_xml(attachments)
        doc_msg = {
            "id": make_msg_id(),
            "role": "system",
            "display_name": "参考文档",
            "avatar_color": "#607D8B",
            "content": f"请仔细阅读以下参考文件，根据 <source> 区分不同文件来源：\n{documents_xml}",
            "is_pass": False,
            "ts": time.time(),
        }
        append_full_history(book_id, [doc_msg], channel_id)
        append_context_messages(book_id, [doc_msg], channel_id)

    # Get the responder(s) — agents that are not the sender
    responders = [p for p in participants if p != sender and p != "human"]

    for responder_id in responders:
        agent = next((a for a in AGENTS if a.agent_id == responder_id), None)
        if not agent:
            continue

        system_prompt = AGENT_SYSTEM_PROMPTS.get(responder_id, "你是一位专业的小说创作助手。")
        if memory_ctx:
            system_prompt = f"{system_prompt}\n\n{memory_ctx}"

        context = build_llm_context(book_id, channel_id)
        meta = book_ctx.get("meta", {})
        book_info = f"书名: {meta.get('title', '未命名')}"
        full_ctx = f"[私聊] 你正在与{sender_name}进行1对1对话。\n{book_info}\n\n{context}"

        # Stream agent turn
        thinking = ""
        reply = ""

        async for event in _stream_agent_turn(
            llm, responder_id, agent.display_name, agent.avatar_color,
            system_prompt, full_ctx
        ):
            if event["event"] == "agent_reply":
                thinking = event["data"]["thinking"]
                reply = event["data"]["content"]
            else:
                yield event

        msg = {
            "id": make_msg_id(),
            "role": responder_id,
            "display_name": agent.display_name,
            "avatar_color": agent.avatar_color,
            "content": reply,
            "thinking": thinking,
            "is_pass": False,
            "file_edits": [],
            "round_number": 0,
            "ts": time.time(),
        }

        # Editor can do file edits even in private chat
        if responder_id == "editor":
            edits = await _editor_parse_file_edits(llm, reply, book_id, book_ctx)
            if edits:
                confirmed = await _execute_file_edits(book_id, edits)
                msg["file_edits"] = confirmed

        append_full_history(book_id, [msg], channel_id)
        append_context_messages(book_id, [msg], channel_id)

        yield {
            "event": "agent_reply",
            "data": {
                "agent": responder_id,
                "display_name": agent.display_name,
                "content": reply,
                "thinking": thinking,
                "is_pass": False,
                "avatar_color": agent.avatar_color,
                "file_edits": msg["file_edits"],
                "id": msg["id"],
                "ts": msg["ts"],
            },
        }

    yield {"event": "round_complete", "data": {"round": 1, "reason": "private_done"}}
    await maybe_compress_context(book_id, channel_id)
