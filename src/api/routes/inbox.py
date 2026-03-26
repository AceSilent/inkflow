"""
Inbox API Routes — Human-in-the-loop approval endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from src.core.state_machine import StateMachine, WorkflowState, InboxItem

router = APIRouter(prefix="/api/v1/inbox", tags=["inbox"])

# In-memory workflow registry (in production, use a proper task queue)
_workflows: Dict[str, Any] = {}


def register_workflow(workflow):
    """Register a workflow instance so the API can interact with it."""
    _workflows[workflow.book_id] = workflow


class ApproveRequest(BaseModel):
    pass


class RejectRequest(BaseModel):
    director_note: str = ""
    modified_outline: Dict[str, Any] = {}


@router.get("", response_model=List[Dict[str, Any]])
async def get_inbox():
    """GET /api/v1/inbox — Fetch all pending human-intervention tasks."""
    items = []
    for book_id, wf in _workflows.items():
        item = wf.get_inbox_item()
        if item:
            items.append(item.model_dump())
    
    # Also scan checkpoint files for any orphaned blocking states
    try:
        checkpoints = StateMachine.list_all_checkpoints()
        for cp in checkpoints:
            state = cp.get("state", "")
            ctx = cp.get("context", {})
            bid = ctx.get("book_id", "")
            if bid not in _workflows and WorkflowState(state).is_blocking:
                items.append({
                    "task_id": f"{bid}_{ctx.get('scene_id', '')}",
                    "book_id": bid,
                    "state": state,
                    "title": f"Orphaned: {bid} at {state}",
                    "scene_id": ctx.get("scene_id", ""),
                    "chapter_id": ctx.get("chapter_id", ""),
                    "reader_scores": ctx.get("reader_feedbacks", {}),
                    "draft_excerpt": ctx.get("current_draft", "")[:200],
                })
    except Exception:
        pass
    
    return items


@router.post("/{task_id}/approve")
async def approve_task(task_id: str, body: ApproveRequest = ApproveRequest()):
    """POST /api/v1/inbox/{task_id}/approve — Approve and resume workflow."""
    book_id = task_id.rsplit("_", 1)[0] if "_" in task_id else task_id
    wf = _workflows.get(book_id)
    if not wf:
        raise HTTPException(status_code=404, detail=f"No active workflow for {book_id}")
    
    if not wf.state_machine.current_state.is_blocking:
        raise HTTPException(status_code=400, detail="Workflow is not in a blocking state")
    
    wf.approve()
    return {"status": "approved", "new_state": wf.state_machine.current_state.value}


@router.post("/{task_id}/reject")
async def reject_task(task_id: str, body: RejectRequest):
    """POST /api/v1/inbox/{task_id}/reject — Reject with director note and retry."""
    book_id = task_id.rsplit("_", 1)[0] if "_" in task_id else task_id
    wf = _workflows.get(book_id)
    if not wf:
        raise HTTPException(status_code=404, detail=f"No active workflow for {book_id}")
    
    wf.reject(
        director_note=body.director_note,
        modified_outline=body.modified_outline or None
    )
    return {
        "status": "rejected",
        "director_note": body.director_note,
        "new_state": wf.state_machine.current_state.value
    }
