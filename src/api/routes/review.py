"""
AutoNovel-Studio v4.0 — Review API Routes
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/review", tags=["review"])


class ReviewStartRequest(BaseModel):
    book_id: str = "default"
    chapter: int = 1
    scene: int = 1


@router.post("/start")
async def start_review(req: ReviewStartRequest):
    """Start a review with the reader matrix."""
    return {
        "status": "completed",
        "readers": [
            {
                "name": "考据党",
                "role": "lore_keeper",
                "score": 8,
                "emotion": "engaged",
                "issues": [
                    {"type": "Lore_Minor", "severity": 1, "quote": "禁地封印", "desc": "封印等级未在前文建立"}
                ]
            },
            {
                "name": "节奏党",
                "role": "pacing_junkie",
                "score": 7,
                "emotion": "excited",
                "issues": [
                    {"type": "Pacing_Slow", "severity": 2, "quote": "第二段", "desc": "内心推演比例偏高 (38%)"}
                ]
            },
            {
                "name": "反套路",
                "role": "anti_trope",
                "score": 9,
                "emotion": "satisfied",
                "issues": []
            },
            {
                "name": "AI味扫雷",
                "role": "ai_tone",
                "score": 6,
                "emotion": "cautiously_engaged",
                "issues": [
                    {"type": "AI_Tone", "severity": 3, "quote": "晨光如刀", "desc": "过度修辞堆砌倾向"}
                ]
            },
        ],
        "verdict": {
            "decision": "PASS",
            "summary": "整体质量合格。AI味扫雷标记了修辞堆砌问题，建议在终版修改。节奏可接受。",
        }
    }


@router.get("/results")
async def get_results():
    """Get the latest review results."""
    return {"status": "no_results", "message": "请先启动审查"}
