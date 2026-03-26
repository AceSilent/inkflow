import pytest
from datetime import datetime
from src.core.models import TaskRecord, TaskStatus

def test_task_status_enum():
    assert TaskStatus.DRAFTING.value == "drafting"
    assert TaskStatus.EDITORIAL_REVIEW.value == "editorial_review"
    assert TaskStatus.HUMAN_APPROVAL_PENDING.value == "human_approval_pending"
    assert TaskStatus.COMPLETED.value == "completed"
    assert TaskStatus.REJECTED.value == "rejected"
    assert TaskStatus.ERROR.value == "error"

def test_task_record_model():
    now = datetime.now()
    task = TaskRecord(
        id="task_123",
        book_id="book_abc",
        type="write_chapter",
        status=TaskStatus.DRAFTING,
        created_at=now.timestamp(),
        updated_at=now.timestamp(),
        payload={"scene_node": "Node 1"},
        metadata={"retry_count": 0}
    )
    
    assert task.id == "task_123"
    assert task.book_id == "book_abc"
    assert task.type == "write_chapter"
    assert task.status == TaskStatus.DRAFTING
    assert isinstance(task.payload, dict)
    assert task.metadata["retry_count"] == 0
