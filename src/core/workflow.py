"""
Showrunner Workflow for AutoNovel-Studio v4.5.
Refactored with StateMachine, Checkpoint, Self-Healing, and Notifier integration.
"""
import logging
from typing import Dict, Any, Optional
from pathlib import Path

from .state_machine import StateMachine, WorkflowState, ProjectContext, InboxItem
from .notifier import WebhookNotifier
from ..agents.author import AuthorAgent
from ..agents.readers import QualityReviewer, BaseReader

logger = logging.getLogger(__name__)


class ShowrunnerWorkflow:
    def __init__(
        self,
        book_id: str,
        llm_client=None,
        output_dir: str = "books",
        max_retries: int = 3,
        webhook_url: str = ""
    ):
        self.book_id = book_id
        self.llm_client = llm_client
        self.output_dir = Path(output_dir)
        self.max_retries = max_retries
        self.notifier = WebhookNotifier(webhook_url=webhook_url or None)

        ctx = ProjectContext(book_id=book_id)
        self.state_machine = StateMachine(
            initial_state=WorkflowState.STATE_INIT,
            context=ctx
        )

        # Register notification hook for blocking states
        self.state_machine.on_after_transition(self._on_transition)

        self.author_agent = AuthorAgent(llm_client) if llm_client else AuthorAgent(None)

    def _on_transition(self, old_state, new_state, ctx):
        """Hook: send webhook when entering a blocking state."""
        if new_state.is_blocking:
            self.notifier.send_alert(
                title=f"[{ctx.book_id}] Workflow blocked at {new_state.value}",
                content=f"Scene: {ctx.scene_id}, Retries: {ctx.retry_count}"
            )

    def start_scene_generation(self, scene_id: str):
        self.state_machine.context.scene_id = scene_id
        self.state_machine.context.retry_count = 0
        self.state_machine.context.current_draft = ""
        self.state_machine.context.director_note = ""
        self.state_machine.transition_to(WorkflowState.STATE_GENERATING_DRAFT)

    def step(self):
        current = self.state_machine.current_state
        if current == WorkflowState.STATE_GENERATING_DRAFT:
            self._handle_generating_draft()
        elif current == WorkflowState.STATE_REVIEWING_DRAFT:
            self._handle_reviewing_draft()
        elif current.is_blocking or current == WorkflowState.STATE_DONE:
            logger.info(f"Workflow suspended at {current}.")
        else:
            logger.warning(f"Unhandled state: {current}")

    def _handle_generating_draft(self):
        draft = self.author_agent.generate_draft(self.state_machine.context)
        self.state_machine.context.current_draft = draft
        self.state_machine.transition_to(WorkflowState.STATE_REVIEWING_DRAFT)

    def _handle_reviewing_draft(self):
        reader = BaseReader()
        feedback = reader.evaluate(self.state_machine.context.current_draft)
        self.state_machine.context.reader_feedbacks = feedback
        score = feedback.get("score", 0)

        if score >= 8:
            self.state_machine.transition_to(WorkflowState.STATE_WAITING_DRAFT_APPROVAL)
        else:
            if self.state_machine.context.retry_count >= self.max_retries:
                logger.error("Max retries exceeded! Escalating to human intervention.")
                self.state_machine.transition_to(WorkflowState.STATE_WAITING_HUMAN_INTERVENTION)
            else:
                self.state_machine.context.retry_count += 1
                self.state_machine.context.director_note += f"\nPrevious feedback: {feedback.get('feedback', '')}"
                self.state_machine.transition_to(WorkflowState.STATE_GENERATING_DRAFT)

    # ── Inbox Actions ──

    def approve(self):
        """Human approves the current blocking state. Resume workflow."""
        current = self.state_machine.current_state
        if current == WorkflowState.STATE_WAITING_OUTLINE_APPROVAL:
            self.state_machine.transition_to(WorkflowState.STATE_GENERATING_DRAFT)
        elif current == WorkflowState.STATE_WAITING_DRAFT_APPROVAL:
            self.state_machine.transition_to(WorkflowState.STATE_DONE)
        elif current == WorkflowState.STATE_WAITING_HUMAN_INTERVENTION:
            # After human intervention, reset retry and go back to drafting
            self.state_machine.context.retry_count = 0
            self.state_machine.transition_to(WorkflowState.STATE_GENERATING_DRAFT)
        else:
            logger.warning(f"Cannot approve in state {current}")

    def reject(self, director_note: str = "", modified_outline: Dict[str, Any] = None):
        """Human rejects and provides feedback. Inject director_note and retry."""
        self.state_machine.context.director_note = director_note
        if modified_outline:
            self.state_machine.context.modified_outline = modified_outline
        self.state_machine.context.retry_count = 0
        self.state_machine.transition_to(WorkflowState.STATE_GENERATING_DRAFT)

    def get_inbox_item(self) -> Optional[InboxItem]:
        """Return an InboxItem if workflow is in a blocking state."""
        if not self.state_machine.current_state.is_blocking:
            return None
        ctx = self.state_machine.context
        return InboxItem(
            task_id=f"{ctx.book_id}_{ctx.scene_id}",
            book_id=ctx.book_id,
            state=self.state_machine.current_state.value,
            title=f"Scene {ctx.scene_id} - {self.state_machine.current_state.value}",
            scene_id=ctx.scene_id,
            chapter_id=ctx.chapter_id,
            reader_scores=ctx.reader_feedbacks,
            draft_excerpt=ctx.current_draft[:200] if ctx.current_draft else ""
        )
