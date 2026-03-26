import os
import json
import logging
from enum import Enum
from typing import Dict, Any, Optional, Callable, List
from pydantic import BaseModel, Field
from datetime import datetime

logger = logging.getLogger(__name__)


class WorkflowState(str, Enum):
    """Enumeration of all possible states in the AutoNovel-Studio workflow."""
    STATE_INIT = "STATE_INIT"
    STATE_PLANNING_VOLUME = "STATE_PLANNING_VOLUME"
    STATE_PLANNING_CHAPTER = "STATE_PLANNING_CHAPTER"
    STATE_GENERATING_SCENE_OUTLINE = "STATE_GENERATING_SCENE_OUTLINE"
    STATE_WAITING_OUTLINE_APPROVAL = "STATE_WAITING_OUTLINE_APPROVAL"
    STATE_GENERATING_DRAFT = "STATE_GENERATING_DRAFT"
    STATE_REVIEWING_DRAFT = "STATE_REVIEWING_DRAFT"
    STATE_WAITING_DRAFT_APPROVAL = "STATE_WAITING_DRAFT_APPROVAL"
    STATE_WAITING_HUMAN_INTERVENTION = "STATE_WAITING_HUMAN_INTERVENTION"
    STATE_DONE = "STATE_DONE"

    @property
    def is_blocking(self) -> bool:
        return self in (
            WorkflowState.STATE_WAITING_OUTLINE_APPROVAL,
            WorkflowState.STATE_WAITING_DRAFT_APPROVAL,
            WorkflowState.STATE_WAITING_HUMAN_INTERVENTION,
        )


class ProjectContext(BaseModel):
    """Holds the current context of the generation workflow."""
    book_id: str
    volume_id: str = ""
    chapter_id: str = ""
    scene_id: str = ""
    current_draft: str = ""
    reader_feedbacks: Dict[str, Any] = Field(default_factory=dict)
    retry_count: int = 0
    director_note: str = ""
    book_title: str = ""
    modified_outline: Dict[str, Any] = Field(default_factory=dict)


class InboxItem(BaseModel):
    """A single pending item in the human inbox."""
    task_id: str
    book_id: str
    state: str
    title: str
    summary: str = ""
    created_at: str = ""
    scene_id: str = ""
    chapter_id: str = ""
    reader_scores: Dict[str, Any] = Field(default_factory=dict)
    draft_excerpt: str = ""


class StateMachine:
    """Manages workflow state transitions and checkpoint persistence."""
    def __init__(
        self, 
        initial_state: WorkflowState, 
        context: ProjectContext,
        checkpoint_dir: str = ".checkpoint"
    ):
        self.current_state = initial_state
        self.context = context
        self.checkpoint_dir = checkpoint_dir
        self._after_transition_hooks: List[Callable] = []
        
        if not os.path.exists(self.checkpoint_dir):
            os.makedirs(self.checkpoint_dir)

    def on_after_transition(self, hook: Callable):
        """Register a callback to fire after every transition."""
        self._after_transition_hooks.append(hook)

    def transition_to(self, new_state: WorkflowState):
        """Transition to a new state and save checkpoint."""
        old_state = self.current_state
        logger.info(f"Transitioning from {old_state} to {new_state}")
        self.current_state = new_state
        self.save_checkpoint()
        # Fire hooks
        for hook in self._after_transition_hooks:
            try:
                hook(old_state, new_state, self.context)
            except Exception as e:
                logger.error(f"After-transition hook failed: {e}")

    def save_checkpoint(self):
        """Save the current state and context atomically to a JSON file."""
        file_path = os.path.join(self.checkpoint_dir, f"{self.context.book_id}_state.json")
        temp_path = f"{file_path}.tmp"
        
        data = {
            "state": self.current_state.value,
            "context": self.context.model_dump(),
            "saved_at": datetime.now().isoformat()
        }
        
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(temp_path, file_path)
            logger.debug(f"Checkpoint saved to {file_path}")
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @classmethod
    def load_checkpoint(cls, book_id: str, checkpoint_dir: str = ".checkpoint") -> "StateMachine":
        """Load a state machine from a saved checkpoint."""
        file_path = os.path.join(checkpoint_dir, f"{book_id}_state.json")
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"No checkpoint found for book {book_id}")
            
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        state = WorkflowState(data["state"])
        context = ProjectContext(**data["context"])
        
        return cls(initial_state=state, context=context, checkpoint_dir=checkpoint_dir)

    @classmethod
    def list_all_checkpoints(cls, checkpoint_dir: str = ".checkpoint") -> List[Dict[str, Any]]:
        """List all saved checkpoints (for Inbox)."""
        items = []
        if not os.path.exists(checkpoint_dir):
            return items
        for fname in os.listdir(checkpoint_dir):
            if fname.endswith("_state.json"):
                fpath = os.path.join(checkpoint_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    items.append(data)
                except Exception:
                    pass
        return items
