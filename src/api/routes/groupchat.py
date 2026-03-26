"""
AutoNovel-Studio v5.0 — Multi-Agent Group Chat API Routes.
SSE streaming for real-time agent responses + channel management + memory.
"""
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from src.core.groupchat_orchestrator import run_groupchat_round, run_private_chat, AGENTS
from src.core.groupchat_storage import load_full_history, list_channels

router = APIRouter(prefix="/channels", tags=["groupchat"])


class FileAttachment(BaseModel):
    name: str
    content: str

class ChannelSendRequest(BaseModel):
    message: str
    sender: str = "human"
    attachments: List[FileAttachment] = []


# ══════════════════════════════════════════════════════════
#  FIXED-PATH ROUTES (must be defined before {channel_id} catch-alls)
# ══════════════════════════════════════════════════════════

# ── Channel List ──

@router.get("/{book_id}/list")
async def get_channel_list(book_id: str):
    """List all available channels with message counts."""
    channels = list_channels(book_id)
    return {"channels": channels}


# ── Agent Info ──

@router.get("/{book_id}/agents")
async def get_agents(book_id: str):
    """Return agent definitions."""
    return {"agents": [a.model_dump() for a in AGENTS]}


# ── Memory Endpoints ──

@router.get("/{book_id}/memory/project")
async def get_project_memory(book_id: str):
    """Get project memory (episodic, per-book)."""
    from src.core.agent_memory import load_project_memory
    return {"memory": load_project_memory(book_id)}


@router.get("/{book_id}/memory/core")
async def get_core_memory(book_id: str):
    """Get core memory (semantic, cross-book)."""
    from src.core.agent_memory import load_core_memory
    return {"memory": load_core_memory()}


@router.post("/{book_id}/memory/reflect")
async def trigger_memory_reflection(book_id: str, volume_id: str = ""):
    """Trigger Memory Reflection to extract writing principles from a completed volume."""
    from src.core.agent_memory import run_memory_reflection
    principles = await run_memory_reflection(book_id, volume_id)
    return {"extracted_principles": principles, "count": len(principles)}


# ══════════════════════════════════════════════════════════
#  PARAMETERIZED ROUTES (catch-all {channel_id} patterns last)
# ══════════════════════════════════════════════════════════

# ── Chat History ──

@router.get("/{book_id}/{channel_id}/history")
async def get_channel_history(book_id: str, channel_id: str):
    """Return full chat history for UI display (never compressed)."""
    messages = load_full_history(book_id, channel_id)
    return {"messages": messages}


# ── Send Message (SSE) ──

@router.post("/{book_id}/{channel_id}/send")
async def send_channel_message(book_id: str, channel_id: str, req: ChannelSendRequest):
    """Send a message to a channel. Streams back agent responses via SSE."""

    async def event_stream():
        # Convert attachments to dicts
        att_list = [a.model_dump() for a in req.attachments] if req.attachments else []

        if channel_id == "group":
            # Group chat: full multi-agent turn-taking
            async for event in run_groupchat_round(book_id, req.message, channel_id, attachments=att_list):
                evt_type = event.get("event", "message")
                evt_data = json.dumps(event.get("data", {}), ensure_ascii=False)
                yield f"event: {evt_type}\ndata: {evt_data}\n\n"
        else:
            # Private chat: 1:1 conversation
            participants = _channel_id_to_participants(channel_id)
            async for event in run_private_chat(
                book_id, channel_id, req.sender, req.message, participants, attachments=att_list
            ):
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


# ── Helpers ──

def _channel_id_to_participants(channel_id: str) -> list:
    """Convert channel_id like 'human_editor' to ['human', 'editor']."""
    mapping = {
        "human_editor": ["human", "editor"],
        "human_author": ["human", "author"],
        "human_proposer": ["human", "proposer"],
        "human_devil": ["human", "devil"],
        "author_editor": ["author", "editor"],
        "proposer_devil": ["proposer", "devil"],
        "proposer_author": ["proposer", "author"],
        "devil_author": ["devil", "author"],
    }
    return mapping.get(channel_id, channel_id.split("_"))
