import pytest
from fastapi.testclient import TestClient
from src.api.main import app
from src.core.task_manager import create_task
import os
import shutil

client = TestClient(app)

TEST_DATA_DIR = "test_books_output_api_tasks"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)
    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

def test_list_tasks_api():
    book_id = "test_book_task_api"
    # Create two tasks
    task1 = create_task(book_id, "write_chapter")
    task2 = create_task(book_id, "editorial_review")
    
    response = client.get(f"/api/v1/books/{book_id}/tasks")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    ids = [t["id"] for t in data]
    assert task1.id in ids
    assert task2.id in ids

def test_get_task_api():
    book_id = "test_book_task_api"
    task = create_task(book_id, "write_chapter", payload={"scene": 1})
    
    response = client.get(f"/api/v1/books/{book_id}/tasks/{task.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task.id
    assert data["type"] == "write_chapter"
    assert data["payload"]["scene"] == 1

def test_get_task_api_not_found():
    response = client.get(f"/api/v1/books/any_book/tasks/non_existent_task")
    assert response.status_code == 404
