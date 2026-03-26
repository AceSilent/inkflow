import pytest
import tempfile
import json
import os
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Assuming structure to be built: src.core.state_machine
# We will mock/import the actual modules when we build them.
# For now, defining the test contract based on spec.

def test_checkpoint_serialization():
    from src.core.state_machine import WorkflowState, StateMachine, ProjectContext
    
    with tempfile.TemporaryDirectory() as tmpdir:
        checkpoint_dir = os.path.join(tmpdir, ".checkpoint")
        os.makedirs(checkpoint_dir)
        
        # 1. Create a complex state object
        ctx = ProjectContext(
            book_id="book_123",
            volume_id="vol_1",
            chapter_id="ch_1",
            scene_id="sc_1",
            current_draft="林辰端坐在蒲团上...",
            reader_feedbacks={"lore": 8, "pacing": 7},
            retry_count=1
        )
        
        machine = StateMachine(
            initial_state=WorkflowState.STATE_REVIEWING_DRAFT,
            context=ctx,
            checkpoint_dir=checkpoint_dir
        )
        
        # 2. Trigger a save
        machine.save_checkpoint()
        
        # 3. Assert file exists and contains valid JSON
        checkpoint_file = os.path.join(checkpoint_dir, "book_123_state.json")
        assert os.path.exists(checkpoint_file)
        
        with open(checkpoint_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        assert data["state"] == "STATE_REVIEWING_DRAFT"
        assert data["context"]["book_id"] == "book_123"
        assert data["context"]["current_draft"] == "林辰端坐在蒲团上..."
        assert "lore" in data["context"]["reader_feedbacks"]

def test_checkpoint_resume_from_crash():
    from src.core.state_machine import WorkflowState, StateMachine, ProjectContext
    
    with tempfile.TemporaryDirectory() as tmpdir:
        checkpoint_dir = os.path.join(tmpdir, ".checkpoint")
        os.makedirs(checkpoint_dir)
        
        # Write a dummy checkpoint simulating a crash during draft generation
        state_data = {
            "state": "STATE_WAITING_HUMAN_INTERVENTION",
            "context": {
                "book_id": "crash_book",
                "volume_id": "v1",
                "chapter_id": "c1",
                "scene_id": "s1",
                "current_draft": "",
                "reader_feedbacks": {},
                "retry_count": 3
            }
        }
        
        with open(os.path.join(checkpoint_dir, "crash_book_state.json"), "w", encoding="utf-8") as f:
            json.dump(state_data, f)
            
        # Resume machine
        machine = StateMachine.load_checkpoint("crash_book", checkpoint_dir=checkpoint_dir)
        
        assert machine.current_state == WorkflowState.STATE_WAITING_HUMAN_INTERVENTION
        assert machine.context.retry_count == 3
        assert machine.context.book_id == "crash_book"
