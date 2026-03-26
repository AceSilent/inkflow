"""
AutoNovel-Studio v4.0 — Generate API Routes
"""
import asyncio
from fastapi import APIRouter
from pydantic import BaseModel

from src.api.sse import sse_manager

router = APIRouter(prefix="/generate", tags=["generate"])


class OutlineRequest(BaseModel):
    book_id: str = "default"
    chapter: int = 1
    scene: int = 1


class DraftRequest(BaseModel):
    book_id: str = "default"
    chapter: int = 1
    scene: int = 1


@router.post("/outline")
async def generate_outline(req: OutlineRequest):
    """Generate a scene outline."""
    return {
        "status": "completed",
        "outline": {
            "chapter": req.chapter,
            "scene": req.scene,
            "scene_goal": "The protagonist's first direct confrontation with the antagonist",
            "key_beats": [
                "Opening with casual dialogue that conceals probing",
                "Revealing flaws through subtle body language",
                "Both sides mistakenly believe the other knows nothing",
            ],
            "information_gaps": [
                {"character": "Lin Chen", "knows": "Ye went to forbidden zone", "doesnt_know": "Ye is controlled"},
                {"character": "Ye Liuyun", "knows": "Lin has abnormal energy", "doesnt_know": "Lin is reborn"},
            ],
        }
    }


@router.post("/draft")
async def generate_draft(req: DraftRequest):
    """Start draft generation (triggers SSE streaming)."""
    asyncio.create_task(_simulate_draft_generation(req))
    return {"status": "started", "message": "Iceberg Engine started, listen via SSE"}


async def _simulate_draft_generation(req: DraftRequest):
    """Simulate draft generation with SSE events."""
    await sse_manager.broadcast("workflow_progress", {
        "phase": "drafting",
        "step": 1, "total": 3,
        "message": "Iceberg Engine: generating internal script..."
    })
    await asyncio.sleep(0.5)

    internal_lines = [
        "Analysis: Core game of this scene - probing and disguise\n\n",
        "Lin Chen (subtext): He clearly went to the forbidden zone last night, ",
        "yet acts as if nothing happened. I need to make him slip.\n",
        "Ye Liuyun (subtext): Is he testing me? Impossible. ",
        "Just maintain the facade.\n",
    ]
    for line in internal_lines:
        await sse_manager.broadcast("draft_chunk", {
            "type": "internal_script",
            "content": line,
            "char_count": len(line),
        })
        await asyncio.sleep(0.08)

    await sse_manager.broadcast("workflow_progress", {
        "phase": "drafting",
        "step": 2, "total": 3,
        "message": "Iceberg Engine: generating final prose..."
    })
    await asyncio.sleep(0.3)

    prose_lines = [
        "Morning light cut through the silence of the Qingyun Sect's great hall ",
        "like a blade.\n\n",
        "Lin Chen sat on the meditation mat, the tea cup in his hand trembling ",
        "ever so slightly. It was deliberate - to make Ye Liuyun across from him ",
        "think his mind was unsettled.\n\n",
        '"Senior Brother Ye, how was your cultivation practice last night?" ',
        "He looked up, his tone as casual as asking about the weather.\n\n",
        "Ye Liuyun's chopsticks paused for less than half a breath. ",
        "If not for Lin Chen's thirty years of micro-expression training ",
        "from his past life in the Shadow Hall, he would never have noticed.\n\n",
        '"Thank you for your concern, all is well." ',
        "Ye Liuyun smiled - a smile as perfect as a painting.\n\n",
        "But paintings are dead things. And dead things don't sweat.",
    ]
    for line in prose_lines:
        await sse_manager.broadcast("draft_chunk", {
            "type": "final_prose",
            "content": line,
            "char_count": len(line),
        })
        await asyncio.sleep(0.05)

    await sse_manager.broadcast("workflow_progress", {
        "phase": "drafting",
        "step": 3, "total": 3,
        "message": "Iceberg Engine rendering complete"
    })
    await sse_manager.broadcast("workflow_complete", {
        "phase": "drafting",
        "result": "success",
    })


@router.get("/stream")
async def stream_events():
    """SSE endpoint for streaming generation events."""
    return sse_manager.create_stream_response()
