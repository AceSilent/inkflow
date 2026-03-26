import pytest
import os
import json
import shutil
from src.core.task_manager import create_task, get_task, update_task_status, list_tasks
from src.core.models import TaskStatus

# Setting a test data dir
TEST_DATA_DIR = "test_books_output_tasks"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)
    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

def test_create_and_get_task():
    book_id = "book_1"
    task = create_task(book_id, "write_chapter", {"chapter": 1})
    
    assert task.book_id == book_id
    assert task.type == "write_chapter"
    assert task.status == TaskStatus.DRAFTING
    assert task.payload["chapter"] == 1
    
    # Reload from disk
    loaded = get_task(book_id, task.id)
    assert loaded is not None
    assert loaded.id == task.id
    assert loaded.status == TaskStatus.DRAFTING

def test_update_task_status():
    book_id = "book_1"
    task = create_task(book_id, "write_chapter", {})
    
    updated = update_task_status(book_id, task.id, TaskStatus.EDITORIAL_REVIEW)
    assert updated.status == TaskStatus.EDITORIAL_REVIEW
    
    loaded = get_task(book_id, task.id)
    assert loaded.status == TaskStatus.EDITORIAL_REVIEW

def test_list_tasks():
    book_id = "book_1"
    create_task(book_id, "task_A", {})
    create_task(book_id, "task_B", {})
    
    tasks = list_tasks(book_id)
    assert len(tasks) == 2
    types = set(t.type for t in tasks)
    assert "task_A" in types
    assert "task_B" in types
