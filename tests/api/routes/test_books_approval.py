import pytest
from fastapi.testclient import TestClient
from src.api.main import app
from src.core.task_manager import create_task, get_task
from src.core.models import TaskStatus
import os
import shutil

client = TestClient(app)

TEST_DATA_DIR = "test_books_output_api_approve"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)
    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

def test_approve_task():
    book_id = "test_book_approve"
    task = create_task(book_id, "write_chapter", payload={"draft_text": "hello"})
    
    response = client.post(f"/api/v1/books/{book_id}/tasks/{task.id}/approve")
    assert response.status_code == 200
    
    updated = get_task(book_id, task.id)
    assert updated.status == TaskStatus.COMPLETED

def test_reject_task():
    book_id = "test_book_reject"
    task = create_task(book_id, "write_chapter", payload={"draft_text": "hello"})
    
    response = client.post(f"/api/v1/books/{book_id}/tasks/{task.id}/reject", json={"feedback": "bad logic"})
    assert response.status_code == 200
    
    updated = get_task(book_id, task.id)
    assert updated.status == TaskStatus.DRAFTING
    assert "bad logic" in updated.payload.get("human_feedback", "")
