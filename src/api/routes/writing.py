"""
AutoNovel-Studio v4.0 — Writing Agent API Routes
Scene-based chapter generation with Iceberg Engine + Reader Agents.
"""
import json
import os
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.core.scene_pipeline import (
    run_chapter_pipeline, generate_chapter_detail_outline,
)
from src.core.chat_session import append_messages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/writing", tags=["writing"])


def _get_books_dir() -> Path:
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


# ── Single Chapter Generation (Scene Pipeline) ──

class GenerateChapterRequest(BaseModel):
    regenerate: bool = False


@router.post("/{book_id}/generate-chapter/{chapter_id}")
async def generate_chapter(book_id: str, chapter_id: str, req: GenerateChapterRequest = GenerateChapterRequest()):
    """Generate a single chapter using the full scene pipeline."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    # Check if draft exists and not regenerating
    draft_file = book_dir / "drafts" / f"{chapter_id}.md"
    pipeline_file = book_dir / "drafts" / f"{chapter_id}_pipeline.json"
    if draft_file.exists() and not req.regenerate:
        # Return existing
        content = draft_file.read_text(encoding="utf-8")
        pipeline_data = {}
        if pipeline_file.exists():
            pipeline_data = json.loads(pipeline_file.read_text(encoding="utf-8"))
        return {
            "chapter_id": chapter_id,
            "content": content,
            "status": "existing",
            "word_count": len(content),
            "pipeline": pipeline_data,
        }

    # Delete old detail outline if regenerating
    if req.regenerate:
        detail_file = book_dir / "outlines" / f"{chapter_id}_detail.json"
        if detail_file.exists():
            detail_file.unlink()

    # Run the full pipeline
    result = await run_chapter_pipeline(book_id, chapter_id)

    # Emit tool message in brainstorm
    scene_count = len(result.scene_results)
    avg_score = 0
    total_reviews = 0
    for sr in result.scene_results:
        for fb in sr.reader_feedbacks:
            avg_score += fb.immersion_score
            total_reviews += 1
    avg_score = round(avg_score / max(total_reviews, 1), 1)

    append_messages(book_id, [{
        "role": "tool",
        "content": f"✍️ 已生成「{result.title}」— {result.total_word_count}字 · {scene_count}场景 · 读者均分{avg_score}/10",
        "tool_type": "chapter_generation",
        "tool_data": {
            "chapter_id": chapter_id,
            "word_count": result.total_word_count,
            "scenes": scene_count,
            "avg_score": avg_score,
        },
    }])

    return {
        "chapter_id": chapter_id,
        "content": result.assembled_text,
        "status": "generated",
        "word_count": result.total_word_count,
        "pipeline": result.model_dump(),
    }


# ── Chapter Detail Outline ──

@router.get("/{book_id}/chapters/{chapter_id}/detail-outline")
async def get_detail_outline(book_id: str, chapter_id: str):
    """Get chapter detail outline (scene-by-scene breakdown)."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    detail_file = book_dir / "outlines" / f"{chapter_id}_detail.json"
    if detail_file.exists():
        return json.loads(detail_file.read_text(encoding="utf-8"))
    return None


# ── Chapter Reviews ──

@router.get("/{book_id}/chapters/{chapter_id}/reviews")
async def get_chapter_reviews(book_id: str, chapter_id: str):
    """Get reader feedback + editor plans for a chapter."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    review_file = book_dir / "reviews" / f"{chapter_id}.json"
    if review_file.exists():
        return json.loads(review_file.read_text(encoding="utf-8"))
    return {"chapter_id": chapter_id, "scenes": []}


# ── Chapter Iceberg Analysis ──

@router.get("/{book_id}/chapters/{chapter_id}/iceberg")
async def get_chapter_iceberg(book_id: str, chapter_id: str):
    """Get iceberg analysis for all scenes in a chapter."""
    book_dir = _get_books_dir() / book_id
    iceberg_dir = book_dir / "drafts" / "iceberg"
    if not iceberg_dir.exists():
        return {"scenes": []}

    scenes = []
    for f in sorted(iceberg_dir.iterdir()):
        if f.name.startswith(chapter_id) and f.suffix == ".md":
            scenes.append({
                "scene_id": f.stem,
                "analysis": f.read_text(encoding="utf-8"),
            })
    return {"chapter_id": chapter_id, "scenes": scenes}


# ── Batch Generation ──

class BatchGenerateRequest(BaseModel):
    volume_id: Optional[str] = None
    regenerate: bool = False


@router.post("/{book_id}/generate-batch")
async def generate_batch(book_id: str, req: BatchGenerateRequest):
    """Generate multiple chapters sequentially. Returns SSE progress stream."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    # Load outline
    outline_file = book_dir / "outlines" / "outline.json"
    if not outline_file.exists():
        raise HTTPException(status_code=400, detail="大纲不存在")

    outline = json.loads(outline_file.read_text(encoding="utf-8"))
    chapters_to_gen = []

    if req.volume_id:
        for vol in outline.get("children", []):
            if vol.get("id") == req.volume_id:
                chapters_to_gen = [ch for ch in vol.get("children", []) if ch.get("type") == "chapter"]
                break
    else:
        for vol in outline.get("children", []):
            for ch in vol.get("children", []):
                if ch.get("type") == "chapter":
                    chapters_to_gen.append(ch)

    if not req.regenerate:
        chapters_to_gen = [
            ch for ch in chapters_to_gen
            if not (book_dir / "drafts" / f"{ch['id']}.md").exists()
        ]

    async def event_stream():
        import asyncio
        total = len(chapters_to_gen)
        total_words = 0

        yield f"data: {json.dumps({'type': 'start', 'total': total}, ensure_ascii=False)}\n\n"

        for i, ch in enumerate(chapters_to_gen):
            ch_id = ch["id"]
            ch_label = ch.get("label", ch_id)

            yield f"data: {json.dumps({'type': 'chapter_start', 'chapter_id': ch_id, 'label': ch_label, 'current': i+1, 'total': total}, ensure_ascii=False)}\n\n"

            try:
                # Define progress callback for scene-level SSE
                async def scene_progress(scene_id, state, data):
                    pass  # SSE handled at chapter level for now

                result = await run_chapter_pipeline(book_id, ch_id, on_progress=scene_progress)
                total_words += result.total_word_count

                # Calculate average reader score
                avg_score = 0
                n = 0
                for sr in result.scene_results:
                    for fb in sr.reader_feedbacks:
                        avg_score += fb.immersion_score
                        n += 1
                avg_score = round(avg_score / max(n, 1), 1)

                yield f"data: {json.dumps({'type': 'chapter_done', 'chapter_id': ch_id, 'label': ch_label, 'word_count': result.total_word_count, 'scenes': len(result.scene_results), 'avg_score': avg_score, 'total_words': total_words, 'current': i+1, 'total': total}, ensure_ascii=False)}\n\n"

            except Exception as e:
                logger.error(f"Failed to generate {ch_id}: {e}")
                yield f"data: {json.dumps({'type': 'error', 'chapter_id': ch_id, 'error': str(e)}, ensure_ascii=False)}\n\n"

            await asyncio.sleep(1)

        yield f"data: {json.dumps({'type': 'complete', 'total_words': total_words, 'chapters_generated': total}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
