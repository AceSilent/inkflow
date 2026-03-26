import pytest
import os
import shutil
from unittest.mock import AsyncMock, patch
from src.core.models import TaskRecord, TaskStatus
from src.core.task_manager import create_task
from src.core.workflow_engine import execute_drafting, execute_editorial_review

TEST_DATA_DIR = "test_books_output_workflow"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)
    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

@pytest.mark.asyncio
@patch("src.core.workflow_engine.get_llm_client")
async def test_execute_drafting(mock_get_client):
    # Mock LLM response
    mock_llm = AsyncMock()
    del mock_llm.client  # Prevent hasattr(llm, "client") from being true
    mock_llm.generate_with_fallback.return_value = "This is the drafted chapter text."
    mock_get_client.return_value = mock_llm

    book_id = "test_book_wf"
    task = create_task(book_id, "write_chapter", payload={"scene_id": "scene_1"})
    
    updated_task = await execute_drafting(task)
    
    assert updated_task.status == TaskStatus.EDITORIAL_REVIEW
    assert "draft_text" in updated_task.payload
    assert updated_task.payload["draft_text"] == "This is the drafted chapter text."

@pytest.mark.asyncio
@patch("src.core.workflow_engine.get_llm_client")
async def test_execute_editorial_review_pass(mock_get_client):
    # Mock LLM Editor response (returns a JSON dict indicating pass)
    mock_llm = AsyncMock()
    # Assuming the editor output is JSON string
    mock_llm.generate_with_fallback.return_value = '{"decision": "pass", "critique": ""}'
    mock_get_client.return_value = mock_llm

    book_id = "test_book_wf"
    task = create_task(book_id, "write_chapter", payload={"draft_text": "text"})
    
    updated_task = await execute_editorial_review(task)
    assert updated_task.status == TaskStatus.HUMAN_APPROVAL_PENDING

@pytest.mark.asyncio
@patch("src.core.workflow_engine.get_llm_client")
async def test_execute_editorial_review_reject(mock_get_client):
    # Mock LLM Editor response (returns a JSON dict indicating reject)
    mock_llm = AsyncMock()
    mock_llm.generate_with_fallback.return_value = '{"decision": "reject", "critique": "Needs more action."}'
    mock_get_client.return_value = mock_llm

    book_id = "test_book_wf"
    task = create_task(book_id, "write_chapter", payload={"draft_text": "text"})
    
    # First rejection -> DRAFTING, retry count = 1
    updated_task = await execute_editorial_review(task)
    assert updated_task.status == TaskStatus.DRAFTING
    assert updated_task.metadata.get("retry_count", 0) == 1
    assert "Needs more action." in updated_task.payload.get("editor_feedback", "")
    
    # Trigger 3 more rejections to hit limit
    task.metadata["retry_count"] = 3
    updated_task2 = await execute_editorial_review(task)
    # Should move to ERROR or HUMAN_APPROVAL_PENDING depending on logic. Let's say ERROR for failing to pass loop.
    assert updated_task2.status == TaskStatus.ERROR
