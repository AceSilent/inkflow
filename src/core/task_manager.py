import os
import json
import logging
import time
import uuid
from typing import List, Optional, Dict, Any

from src.core.models import TaskRecord, TaskStatus

logger = logging.getLogger(__name__)

def get_task_dir(book_id: str) -> str:
    """Gets the path to the tasks directory for a specific book."""
    data_dir = os.getenv("AUTONOVEL_DATA_DIR", "books")
    tasks_dir = os.path.join(data_dir, book_id, "tasks")
    os.makedirs(tasks_dir, exist_ok=True)
    return tasks_dir

def _get_task_file_path(book_id: str, task_id: str) -> str:
    return os.path.join(get_task_dir(book_id), f"{task_id}.json")

def create_task(book_id: str, task_type: str, payload: Dict[str, Any] = None, metadata: Dict[str, Any] = None) -> TaskRecord:
    """Create a new task and persist it to JSON."""
    if payload is None:
        payload = {}
    if metadata is None:
        metadata = {}
        
    now = time.time()
    task = TaskRecord(
        id=f"tsk_{uuid.uuid4().hex[:8]}",
        book_id=book_id,
        type=task_type,
        status=TaskStatus.DRAFTING,
        created_at=now,
        updated_at=now,
        payload=payload,
        metadata=metadata
    )
    
    _save_task(task)
    return task

def get_task(book_id: str, task_id: str) -> Optional[TaskRecord]:
    """Retrieve a task by ID."""
    path = _get_task_file_path(book_id, task_id)
    if not os.path.exists(path):
        return None
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return TaskRecord(**data)
    except Exception as e:
        logger.warning("Error loading task %s: %s", task_id, e)
        return None

def update_task_status(book_id: str, task_id: str, status: TaskStatus, payload_updates: Dict[str, Any] = None, metadata_updates: Dict[str, Any] = None) -> Optional[TaskRecord]:
    """Update a task's status and optionally its payload/metadata."""
    task = get_task(book_id, task_id)
    if not task:
        return None
        
    task.status = status
    task.updated_at = time.time()
    
    if payload_updates:
        task.payload.update(payload_updates)
    if metadata_updates:
        task.metadata.update(metadata_updates)
        
    _save_task(task)
    return task

def list_tasks(book_id: str) -> List[TaskRecord]:
    """List all tasks for a book, sorted by creation time."""
    tasks_dir = get_task_dir(book_id)
    tasks = []
    
    for filename in os.listdir(tasks_dir):
        if filename.endswith(".json"):
            task_id = filename[:-5]
            task = get_task(book_id, task_id)
            if task:
                tasks.append(task)
                
    tasks.sort(key=lambda t: t.created_at)
    return tasks

def _save_task(task: TaskRecord) -> None:
    """Private helper to save a TaskRecord."""
    path = _get_task_file_path(task.book_id, task.id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(task.model_dump(), f, ensure_ascii=False, indent=2)
