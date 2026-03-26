# Multi-Agent Group Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-agent BrainstormPanel chat with a multi-agent group chat featuring 4 AI agents (Editor, Proposer, Devil, Author) with sequential turn-taking, PASS mechanism, thinking mode, and seamless compression.

**Architecture:** Backend orchestrator manages agent turn-taking via SSE streaming. Dual-layer storage keeps full chat history for UI display and compressed context for LLM. Each agent uses two-phase generation (think → reply). Only the Editor agent can execute file edits.

**Tech Stack:** Python/FastAPI (SSE via `StreamingResponse`), React frontend, Pydantic models, Jinja2 prompts

**Spec:** [design spec](file:///d:/AI/AutoNovel-Studio/docs/superpowers/specs/2026-03-23-multi-agent-groupchat-design.md)

---

### Task 1: Data Models & Agent State

**Files:**
- Modify: `src/core/models.py` (append new models)
- Test: manual import check

- [ ] **Step 1: Add GroupChat data models to models.py**

Append to `src/core/models.py`:

```python
# ── Multi-Agent Group Chat Models ──

class FileEdit(BaseModel):
    """A file edit executed by the editor agent."""
    file_path: str = Field(description="相对于 book_dir 的路径")
    edit_type: str = Field("update", description="update | create | append")
    content: str = Field("", description="新内容")
    summary: str = Field("", description="变更摘要")

class GroupChatMessage(BaseModel):
    """A single message in the multi-agent group chat."""
    model_config = {"extra": "ignore"}
    id: str = ""
    role: str = Field(description="human | editor | proposer | devil | author")
    display_name: str = ""
    avatar_color: str = ""
    content: str = ""
    thinking: Optional[str] = None
    is_pass: bool = False
    file_edits: List[FileEdit] = Field(default_factory=list)
    round_number: int = 0
    ts: float = 0.0

class AgentState(BaseModel):
    """Runtime state for a single agent in the group chat."""
    agent_id: str
    display_name: str
    avatar_color: str = ""
    status: str = "idle"  # active | idle | thinking | passed
    consecutive_passes: int = 0
    last_spoke_round: int = 0
```

- [ ] **Step 2: Verify import**

Run: `python -c "from src.core.models import GroupChatMessage, AgentState, FileEdit; print('OK')"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add src/core/models.py
git commit -m "feat(models): add GroupChat data models — GroupChatMessage, AgentState, FileEdit"
```

---

### Task 2: Dual-Layer Chat Storage

**Files:**
- Create: `src/core/groupchat_storage.py`

- [ ] **Step 1: Create groupchat_storage.py**

```python
"""
Dual-layer chat storage for multi-agent group chat.
- chat_full.json: complete history (UI display, never deleted)
- chat_context.json: compressed context window (LLM input)
"""
import json
import time
import uuid
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from src.core.models import GroupChatMessage

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 1.5
KEEP_RECENT_TOKENS = 50_000


def _books_dir() -> Path:
    import os
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _full_file(book_id: str) -> Path:
    return _books_dir() / book_id / "brainstorm" / "chat_full.json"


def _context_file(book_id: str) -> Path:
    return _books_dir() / book_id / "brainstorm" / "chat_context.json"


def _summaries_dir(book_id: str) -> Path:
    return _books_dir() / book_id / "brainstorm" / "summaries"


def make_msg_id() -> str:
    return f"gc_{uuid.uuid4().hex[:8]}"


# ── Full History (UI layer — never delete) ──

def load_full_history(book_id: str) -> List[Dict[str, Any]]:
    path = _full_file(book_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("messages", [])
    return []


def append_full_history(book_id: str, messages: List[Dict[str, Any]]):
    path = _full_file(book_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            existing = json.load(f).get("messages", [])
    for msg in messages:
        if "id" not in msg or not msg["id"]:
            msg["id"] = make_msg_id()
        if "ts" not in msg or not msg["ts"]:
            msg["ts"] = time.time()
    existing.extend(messages)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"messages": existing}, f, ensure_ascii=False, indent=2)


# ── Context Window (LLM layer — compressed) ──

def load_context(book_id: str) -> Dict[str, Any]:
    path = _context_file(book_id)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"messages": [], "summary": ""}


def save_context(book_id: str, context: Dict[str, Any]):
    path = _context_file(book_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(context, f, ensure_ascii=False, indent=2)


def append_context_messages(book_id: str, messages: List[Dict[str, Any]]):
    ctx = load_context(book_id)
    for msg in messages:
        if "id" not in msg or not msg["id"]:
            msg["id"] = make_msg_id()
        if "ts" not in msg or not msg["ts"]:
            msg["ts"] = time.time()
    ctx["messages"].extend(messages)
    save_context(book_id, ctx)


def build_llm_context(book_id: str) -> str:
    """Build the context string for LLM consumption."""
    ctx = load_context(book_id)
    parts = []
    if ctx.get("summary"):
        parts.append(f"[历史摘要]\n{ctx['summary']}")
    recent = ctx.get("messages", [])[-30:]  # last 30 messages
    if recent:
        lines = []
        for m in recent:
            name = m.get("display_name", m.get("role", "?"))
            content = m.get("content", "")
            if m.get("is_pass"):
                lines.append(f"{name}: [无补充]")
            else:
                lines.append(f"{name}: {content[:600]}")
        parts.append(f"[近期对话]\n" + "\n".join(lines))
    return "\n\n".join(parts) if parts else ""


async def maybe_compress_context(book_id: str):
    """Compress old context messages into summary if over token limit."""
    import os
    keep_tokens = int(os.environ.get("AUTONOVEL_KEEP_TOKENS", KEEP_RECENT_TOKENS))
    ctx = load_context(book_id)
    msgs = ctx.get("messages", [])
    total = sum(int(len(m.get("content", "")) / CHARS_PER_TOKEN) for m in msgs)
    if total <= keep_tokens:
        return

    # Find split point
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

    # Save summary to file
    sdir = _summaries_dir(book_id)
    sdir.mkdir(parents=True, exist_ok=True)
    idx = len(list(sdir.glob("summary_*.json"))) + 1
    with open(sdir / f"summary_{idx:03d}.json", "w", encoding="utf-8") as f:
        json.dump({
            "compressed_messages": len(overflow),
            "summary": summary.strip(),
            "ts": time.time()
        }, f, ensure_ascii=False, indent=2)

    ctx["summary"] = summary.strip()
    ctx["messages"] = recent
    save_context(book_id, ctx)
```

- [ ] **Step 2: Verify import**

Run: `python -c "from src.core.groupchat_storage import load_full_history, build_llm_context; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add src/core/groupchat_storage.py
git commit -m "feat(storage): dual-layer chat storage — full history for UI + compressed context for LLM"
```

---

### Task 3: Agent Orchestrator

**Files:**
- Create: `src/core/groupchat_orchestrator.py`

- [ ] **Step 1: Create the orchestrator**

```python
"""
Multi-Agent Group Chat Orchestrator.
Manages turn-taking, PASS logic, thinking mode, and agent state.
"""
import asyncio
import json
import re
import time
import logging
from typing import AsyncGenerator, Dict, Any, Optional, List
from src.core.models import GroupChatMessage, AgentState, FileEdit
from src.core.llm_factory import get_llm_client
from src.core.prompt_loader import render_prompt
from src.core.groupchat_storage import (
    load_full_history, append_full_history,
    append_context_messages, build_llm_context,
    maybe_compress_context, make_msg_id
)
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Agent Definitions ──

AGENTS = [
    AgentState(agent_id="proposer", display_name="提案策划", avatar_color="#4FC3F7"),
    AgentState(agent_id="devil", display_name="魔鬼代言人", avatar_color="#EF5350"),
    AgentState(agent_id="author", display_name="作者", avatar_color="#66BB6A"),
    AgentState(agent_id="editor", display_name="总编辑", avatar_color="#E6A817"),
]

AGENT_SYSTEM_PROMPTS = {
    "proposer": (
        "你是「提案策划」，一位极具创造力的故事策划师。\n"
        "你的职责是：推进创意、抛出脑洞、提供多个方案选择。\n"
        "风格：热情、发散性思维、不怕大胆。\n"
        "如果你觉得在这个话题上没有新的观点可以补充，直接回复: [PASS]\n"
    ),
    "devil": (
        "你是「魔鬼代言人」，一位犀利的逻辑审查者。\n"
        "你的职责是：找逻辑漏洞、提出反对意见、挑战假设、防止平庸。\n"
        "风格：尖锐但有建设性，指出问题时必须给出替代方案。\n"
        "如果你觉得没有值得挑战的问题，直接回复: [PASS]\n"
    ),
    "author": (
        "你是「作者」，一位经验丰富的网文写手。\n"
        "你的职责是：从实际写作角度评估可行性——这个设定能否写出精彩的场景？文笔上有什么挑战？\n"
        "风格：务实、注重可操作性、关心读者体验。\n"
        "如果你觉得没有写作相关的补充，直接回复: [PASS]\n"
    ),
    "editor": (
        "你是「总编辑」，群聊中最资深的决策者。\n"
        "你的职责是：综合各方意见、发表看法或拍板定案。\n"
        "你是唯一有权修改设定文件（大纲、卷纲、世界观、角色设定等）的人。\n"
        "当你觉得讨论已经充分、可以定案时，在回复中明确说「拍板定案」并给出最终决策和要修改的内容。\n"
        "如果讨论还在进行中，你可以只发表看法参与讨论，不必每次都总结拍板。\n"
        "如果你觉得没有需要补充的，直接回复: [PASS]\n"
    ),
}

THINKING_PROMPT = (
    "在正式回复之前，你需要先进行内部思考：\n"
    "1. 分析当前讨论的核心问题\n"
    "2. 考虑其他Agent已经说过的观点\n"
    "3. 决定你是否有新的见解可以贡献（如果没有就PASS）\n"
    "4. 如果有，组织你的回复要点\n"
    "请输出你的思考过程。"
)


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
    lore_file = book_dir / "lore" / "world_setting.json"
    if lore_file.exists():
        with open(lore_file, "r", encoding="utf-8") as f:
            lore = json.load(f)
    return {"meta": meta, "lore": lore}


def _parse_json_from_text(raw: str) -> Optional[Dict]:
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
    if first >= 0 and last > first:
        candidate = raw[first:last+1]
        candidate = re.sub(r',\s*([}\]])', r'\1', candidate)
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            pass
    return None


async def _agent_think(llm, agent_id: str, system_prompt: str, context: str) -> str:
    """Phase 1: Agent thinks internally."""
    try:
        thinking = await llm.generate_text(
            system_prompt=f"{system_prompt}\n\n{THINKING_PROMPT}",
            user_prompt=context,
            temperature=0.7,
        )
        return thinking.strip()
    except Exception as e:
        logger.error(f"Agent {agent_id} thinking failed: {e}")
        return f"(思考过程生成失败: {e})"


async def _agent_reply(llm, agent_id: str, system_prompt: str, context: str, thinking: str) -> str:
    """Phase 2: Agent generates formal reply based on thinking."""
    try:
        reply = await llm.generate_text(
            system_prompt=system_prompt,
            user_prompt=(
                f"你的内部思考：\n{thinking}\n\n"
                f"群聊上下文：\n{context}\n\n"
                "请基于你的思考给出正式回复。如果没有新观点，直接回复: [PASS]"
            ),
            temperature=0.6,
        )
        return reply.strip()
    except Exception as e:
        logger.error(f"Agent {agent_id} reply failed: {e}")
        return f"(回复生成失败: {e})"


async def _editor_parse_file_edits(
    llm, reply: str, book_id: str, book_ctx: Dict
) -> List[Dict[str, Any]]:
    """If the editor said '拍板定案', extract file edits."""
    if "拍板" not in reply and "定案" not in reply:
        return []
    try:
        raw = await llm.generate_text(
            system_prompt=(
                "你是文件编辑解析器。根据总编辑的拍板内容，提取出需要修改的文件操作。\n"
                "以JSON数组格式输出：[{\"file_path\":\"相对路径\",\"edit_type\":\"update\",\"content\":\"新内容\",\"summary\":\"变更摘要\"}]\n"
                "如果没有明确的文件修改需求，返回空数组: []"
            ),
            user_prompt=f"总编辑的拍板内容：\n{reply}\n\n当前书籍元数据：{json.dumps(book_ctx.get('meta', {}), ensure_ascii=False)[:500]}",
            temperature=0.2,
        )
        data = _parse_json_from_text(raw)
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
            logger.info(f"File edit executed: {edit['file_path']} ({edit.get('summary', '')})")
        except Exception as e:
            logger.error(f"File edit failed for {edit.get('file_path')}: {e}")
    return confirmed


async def run_groupchat_round(
    book_id: str,
    human_message: str,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Run one round of multi-agent group chat.
    Yields SSE events for each agent's thinking, reply, file edits, etc.
    """
    llm = get_llm_client("author")
    book_ctx = _load_book_context(book_id)

    # Persist human message to both layers
    human_msg = {
        "id": make_msg_id(),
        "role": "human",
        "display_name": "人类",
        "avatar_color": "#9E9E9E",
        "content": human_message,
        "is_pass": False,
        "round_number": 0,
        "ts": time.time(),
    }
    append_full_history(book_id, [human_msg])
    append_context_messages(book_id, [human_msg])

    round_num = 0
    all_passed = False

    while not all_passed:
        round_num += 1
        passes_this_round = 0
        editor_finalized = False

        for agent in AGENTS:
            agent_id = agent.agent_id
            display_name = agent.display_name
            avatar_color = agent.avatar_color
            system_prompt = AGENT_SYSTEM_PROMPTS[agent_id]

            # Build LLM context
            context = build_llm_context(book_id)
            book_info = f"书名: {book_ctx['meta'].get('title', '未命名')} | 类型: {book_ctx['meta'].get('genre', '未知')}"
            full_context = f"{book_info}\n\n{context}"

            # Emit: agent thinking
            yield {"event": "agent_thinking", "data": {"agent": agent_id, "display_name": display_name}}

            # Phase 1: Think
            thinking = await _agent_think(llm, agent_id, system_prompt, full_context)

            yield {"event": "agent_thought", "data": {"agent": agent_id, "display_name": display_name, "thinking": thinking}}

            # Phase 2: Reply
            reply = await _agent_reply(llm, agent_id, system_prompt, full_context, thinking)

            is_pass = "[PASS]" in reply or reply.strip() == "[PASS]" or reply.strip() == "PASS"

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

            # Editor file edits
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
            append_full_history(book_id, [msg])
            append_context_messages(book_id, [msg])

            # Emit: agent reply
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

        # Check termination
        if passes_this_round == len(AGENTS):
            all_passed = True
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "all_passed"}}
        elif editor_finalized:
            all_passed = True
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "editor_finalized"}}
        else:
            yield {"event": "round_complete", "data": {"round": round_num, "reason": "continue"}}
            # Continue to next round

    # Compress context if needed
    await maybe_compress_context(book_id)
```

- [ ] **Step 2: Verify import**

Run: `python -c "from src.core.groupchat_orchestrator import run_groupchat_round, AGENTS; print(f'{len(AGENTS)} agents OK')"`

- [ ] **Step 3: Commit**

```bash
git add src/core/groupchat_orchestrator.py
git commit -m "feat(orchestrator): multi-agent group chat engine — turn-taking, PASS, thinking, file edits"
```

---

### Task 4: SSE API Endpoint

**Files:**
- Create: `src/api/routes/groupchat.py`
- Modify: `src/api/routes/__init__.py` (register router)

- [ ] **Step 1: Create groupchat.py API route**

```python
"""
Multi-Agent Group Chat API Routes.
SSE streaming for real-time agent responses.
"""
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.core.groupchat_orchestrator import run_groupchat_round, AGENTS
from src.core.groupchat_storage import load_full_history

router = APIRouter(prefix="/groupchat", tags=["groupchat"])


class GroupChatSendRequest(BaseModel):
    message: str


@router.post("/{book_id}/send")
async def send_message(book_id: str, req: GroupChatSendRequest):
    """Send a message and stream back agent responses via SSE."""

    async def event_stream():
        async for event in run_groupchat_round(book_id, req.message):
            evt_type = event.get("event", "message")
            evt_data = json.dumps(event.get("data", {}), ensure_ascii=False)
            yield f"event: {evt_type}\ndata: {evt_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{book_id}/history")
async def get_history(book_id: str):
    """Return full chat history for UI display."""
    messages = load_full_history(book_id)
    return {"messages": messages}


@router.get("/{book_id}/agents")
async def get_agents(book_id: str):
    """Return agent definitions and states."""
    return {
        "agents": [a.model_dump() for a in AGENTS]
    }
```

- [ ] **Step 2: Register router in __init__.py**

Find `src/api/routes/__init__.py` and add:
```python
from .groupchat import router as groupchat_router
```
And register it in the app.

- [ ] **Step 3: Verify endpoint**

Run: `curl http://localhost:9864/api/v1/groupchat/test/agents`
Expected: JSON with 4 agents

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/groupchat.py src/api/routes/__init__.py
git commit -m "feat(api): SSE group chat endpoint — /groupchat/{book_id}/send + /history + /agents"
```

---

### Task 5: Frontend — GroupChatPanel Component

**Files:**
- Create: `frontend/src/components/GroupChatPanel.jsx`

- [ ] **Step 1: Create GroupChatPanel.jsx**

Build a React component that:
- Renders messages with agent-specific avatars and colors
- Sends human messages via `POST /api/v1/groupchat/{book_id}/send`
- Consumes SSE events to progressively render agent thinking + replies
- Collapsible thinking blocks (collapsed by default, click to expand)
- PASS messages shown as subtle gray text
- File edit operations shown as inline cards
- File upload support (same as current)
- Human can type and send at any time (even mid-round — cancels and restarts)

Key UI elements per message:
```
┌─ [Avatar Dot colored] Agent Name ── Round N ──┐
│ ▸ 🧠 思考过程 (collapsed)                    │
│                                               │
│ Reply content...                              │
│                                               │
│ 📝 [已更新: outline.json] (if file edit)      │
└───────────────────────────────────────────────┘
```

Agent colors:
- 总编辑: #E6A817 (gold) 👑
- 提案策划: #4FC3F7 (sky blue) 💡
- 魔鬼代言人: #EF5350 (red) 😈
- 作者: #66BB6A (green) ✍️
- 人类: #9E9E9E (gray) 👤

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GroupChatPanel.jsx
git commit -m "feat(ui): GroupChatPanel — multi-agent chat with thinking, PASS, file edits"
```

---

### Task 6: Integrate GroupChatPanel into BrainstormPanel

**Files:**
- Modify: `frontend/src/components/BrainstormPanel.jsx`

- [ ] **Step 1: Replace single-agent chat with GroupChatPanel**

In `BrainstormPanel.jsx`:
- Import `GroupChatPanel`
- Replace the left-side chat area (single-agent messages, input, send logic) with `<GroupChatPanel />`
- Keep the right-side Lore Book panel unchanged
- Pass `currentBook`, `addToast`, `lore`, `setLore` as props

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BrainstormPanel.jsx
git commit -m "feat(ui): integrate GroupChatPanel into BrainstormPanel, replacing single-agent chat"
```

---

### Task 7: Update Design Documents

**Files:**
- Modify: `docs/spec.md`
- Modify: `docs/系统开发文档.md`

- [ ] **Step 1: Update spec.md**

Add section after §二 for multi-agent group chat:
- New §: 创意沙盘多Agent群聊
- Document 5 agent roles, turn-taking rules, dual-layer storage, thinking mode

- [ ] **Step 2: Update 系统开发文档.md**

Update:
- §1 Architecture Overview: add multi-agent orchestrator
- §2 File System: add brainstorm/chat_full.json, chat_context.json, summaries/
- §3 Data Contracts: add GroupChatMessage, AgentState, FileEdit models

- [ ] **Step 3: Commit**

```bash
git add docs/spec.md docs/系统开发文档.md
git commit -m "docs: update spec and system docs for multi-agent group chat architecture"
```

---

### Task 8: End-to-End Browser Verification

- [ ] **Step 1: Start server and open UI**
- [ ] **Step 2: Navigate to creative sandbox for existing book**
- [ ] **Step 3: Send a message in group chat**
- [ ] **Step 4: Verify all 4 agents respond with visible thinking blocks**
- [ ] **Step 5: Verify PASS mechanism works**
- [ ] **Step 6: Verify file edit card appears when editor finalizes**
- [ ] **Step 7: Scroll up to verify full history is preserved**
- [ ] **Step 8: Screenshot and document results**
