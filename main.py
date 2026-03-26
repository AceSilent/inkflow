"""
AutoNovel-Studio Main Entry Point
CLI interface for novel generation
"""
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional
import logging
from loguru import logger as loguru_logger

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core import NovelStateMachine, OpenAILLMClient
from src.agents import AuthorAgent, ReaderMatrix, LoreKeeperAgent, PacingJunkieAgent, AntiTropeScannerAgent, AIToneScannerAgent, EditorAgent
from src.agents.state_updater import StateUpdater
from src.utils import FileManager, get_file_manager


class NovelGenerator:
    """
    Main novel generation orchestrator.
    Coordinates all agents and manages the workflow.
    """

    def __init__(
        self,
        project_root: str = ".",
        author_model: str = "gpt-4o-mini",
        editor_model: str = "gpt-4o",
        reader_model: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        """
        Initialize novel generator.

        Args:
            project_root: Project root directory
            author_model: Model for author agent
            editor_model: Model for editor agent
            reader_model: Model for reader agents
            api_key: API key for LLM provider
            base_url: Base URL for API
        """
        self.project_root = Path(project_root).resolve()
        self.file_manager = FileManager(project_root)

        # Initialize LLM clients
        client_kwargs = {}
        if api_key:
            client_kwargs['api_key'] = api_key
        if base_url:
            client_kwargs['base_url'] = base_url

        self.author_client = OpenAILLMClient(model_name=author_model, **client_kwargs)
        self.editor_client = OpenAILLMClient(model_name=editor_model, **client_kwargs)
        self.reader_client = OpenAILLMClient(model_name=reader_model, **client_kwargs)

        # Initialize agents
        self.author = AuthorAgent(self.author_client)
        self.editor = EditorAgent(self.editor_client)

        # Initialize readers
        self.lore_keeper = LoreKeeperAgent(self.reader_client)
        self.pacing_junkie = PacingJunkieAgent(self.reader_client)
        self.anti_trope_scanner = AntiTropeScannerAgent(self.reader_client)
        self.ai_tone_scanner = AIToneScannerAgent(self.reader_client)
        self.reader_matrix = ReaderMatrix(
            self.lore_keeper,
            self.pacing_junkie,
            self.anti_trope_scanner,
            self.ai_tone_scanner
        )

        # Initialize state updater
        self.state_updater = StateUpdater(self.file_manager)

        # Initialize state machine
        self.state_machine = NovelStateMachine(max_retries=3)

    async def generate_chapter(self, chapter_number: int) -> bool:
        """
        Generate a complete chapter.

        Args:
            chapter_number: Chapter number to generate

        Returns:
            True if successful
        """
        loguru_logger.info(f"Starting generation of Chapter {chapter_number}")

        # Load chapter outline
        outline_path = f"02_Outlines/chapter_{chapter_number:02d}_outline.json"
        chapter_outline = self.file_manager.read_json(outline_path)

        if not chapter_outline:
            loguru_logger.error(f"Chapter outline not found: {outline_path}")
            return False

        # Load global settings
        book_meta = self.file_manager.read_json("00_Config/book_meta.json", default={})
        world_lore = self.file_manager.read_json("01_Global_Settings/world_lore.json", default={})
        characters = self.file_manager.read_json("01_Global_Settings/characters.json", default={})
        volume_outline = self.file_manager.read_text("02_Outlines/volume_01.md", default="")

        # Load chapter state
        self.state_machine.load_chapter(chapter_number, chapter_outline)
        self.state_machine.start()

        # Generate each scene
        while True:
            # Check if all scenes complete
            scene = self.state_machine.get_current_scene()
            if not scene:
                loguru_logger.info("All scenes generated, requesting human review")
                # Use state machine trigger
                self.state_machine.approve()  # Move to human intervention
                break

            loguru_logger.info(f"Generating scene {self.state_machine.current_scene_index + 1}/{self.state_machine.scene_count}")

            # DRAFTING phase
            try:
                recent_summaries = self.state_updater.get_recent_summaries(10)
                draft_content = await self.author.generate_scene(
                    book_meta=book_meta,
                    volume_outline=volume_outline,
                    recent_summaries=recent_summaries,
                    chapter_outline=chapter_outline,
                    scene_target=scene.get("title", ""),
                    word_count=scene.get("word_count_target", 800),
                    is_rewrite=self.state_machine.retry_count > 0  # Enable blind rewrite mode for retries
                )
                self.state_machine.current_draft = draft_content
                self.state_machine.finish_draft()

            except Exception as e:
                loguru_logger.error(f"Drafting failed: {e}")
                self.state_machine.error()
                return False

            # REVIEWING phase (concurrent readers)
            try:
                feedbacks = await self.reader_matrix.review_concurrently(
                    draft_content=draft_content,
                    context={
                        "book_meta": book_meta,
                        "chapter_outline": chapter_outline,
                        "characters": characters,
                        "world_lore": world_lore,
                        "previous_chapters": recent_summaries
                    }
                )
                self.state_machine.store_feedback(feedbacks)
                self.state_machine.finish_review()

            except Exception as e:
                loguru_logger.error(f"Review failed: {e}")
                self.state_machine.error()
                return False

            # EDITING phase
            try:
                revision_plan = await self.editor.review(
                    draft_content=draft_content,
                    reader_feedbacks=feedbacks,
                    chapter_outline=chapter_outline,
                    book_meta=book_meta,
                    scene_target=scene.get("title", "")
                )
                self.state_machine.current_revision_plan = revision_plan

                # Save draft and reviews before each iteration
                self._save_draft_and_reviews(
                    chapter_number=chapter_number,
                    draft_content=draft_content,
                    feedbacks=feedbacks,
                    revision_plan=revision_plan
                )

                # Check if human intervention needed
                if self.state_machine.should_enter_human_intervention(revision_plan):
                    self.state_machine.approve()
                    break
                elif revision_plan.pass_status:
                    # Scene approved, move to next scene
                    self.state_machine.advance_scene()
                    # Check if there are more scenes
                    if self.state_machine.has_more_scenes():
                        self.state_machine.continue_drafting()
                    # else: will exit loop and go to human intervention
                else:
                    # Scene rejected, retry
                    self.state_machine.increment_retry()
                    if self.state_machine.is_circuit_breaker_triggered():
                        loguru_logger.error("Circuit breaker triggered!")
                        self.state_machine.approve()  # Force to human intervention
                        break
                    self.state_machine.reject()

            except Exception as e:
                loguru_logger.error(f"Editing failed: {e}")
                self.state_machine.error()
                return False

        # Human intervention point
        if self.state_machine.state == "human_intervention":
            success = await self._handle_human_intervention(chapter_number)
            if not success:
                return False

        # COMMITTING phase
        try:
            await self.state_updater.update_after_approval(
                chapter_number=chapter_number,
                draft_content=self.state_machine.current_draft or "",
                chapter_outline=chapter_outline
            )
            self.state_machine.finish_commit()
            self.state_machine.complete_chapter()

            loguru_logger.info(f"Chapter {chapter_number} generation complete!")
            return True

        except Exception as e:
            loguru_logger.error(f"Commit failed: {e}")
            self.state_machine.error()
            return False

    def _save_draft_and_reviews(
        self,
        chapter_number: int,
        draft_content: str,
        feedbacks: dict,
        revision_plan
    ):
        """
        Save draft and reviews to files.

        Args:
            chapter_number: Chapter number
            draft_content: Draft content to save
            feedbacks: Reader feedbacks dictionary
            revision_plan: Editor's revision plan
        """
        import json
        from pathlib import Path

        # Get version number from retry count
        version = self.state_machine.retry_count + 1

        # Save draft with version number
        draft_filename = f"04_Drafts/ch{chapter_number:02d}_v{version}.txt"
        self.file_manager.write_text(draft_filename, draft_content, version=False)
        loguru_logger.info(f"Draft saved to: {draft_filename}")

        # Convert feedbacks to serializable format
        feedbacks_serializable = {}
        for reader_name, feedback in feedbacks.items():
            feedbacks_serializable[reader_name] = {
                "reader_role": feedback.reader_role,
                "immersion_score": feedback.immersion_score,
                "emotional_watermark": feedback.emotional_watermark,
                "overall_comment": feedback.overall_comment,
                "issues": [
                    {
                        "error_type": issue.error_type,
                        "severity": issue.severity,
                        "quote": issue.quote,
                        "description": issue.description,
                        "suggestion": issue.suggestion
                    }
                    for issue in feedback.issues
                ]
            }

        # Add editor decision
        feedbacks_serializable["_editor_decision"] = {
            "pass_status": revision_plan.pass_status,
            "revision_instructions": revision_plan.revision_instructions,
            "scene_target": revision_plan.scene_target,
            "priority_fixes": revision_plan.priority_fixes,
            "rejected_feedbacks": revision_plan.rejected_feedbacks
        }

        # Save reviews
        reviews_filename = f"05_Reviews/ch{chapter_number:02d}_v{version}_reviews.json"
        self.file_manager.write_json(reviews_filename, feedbacks_serializable, version=False)
        loguru_logger.info(f"Reviews saved to: {reviews_filename}")

    async def _handle_human_intervention(self, chapter_number: int) -> bool:
        """
        Handle human intervention point.

        Args:
            chapter_number: Current chapter number

        Returns:
            True to proceed, False to abort
        """
        loguru_logger.info("=" * 60)
        loguru_logger.info("HUMAN INTERVENTION REQUIRED")
        loguru_logger.info("=" * 60)
        loguru_logger.info(f"Chapter {chapter_number} is ready for final review.")

        # Print status
        status = self.state_machine.get_status_summary()
        loguru_logger.info(f"State: {status}")
        loguru_logger.info(f"Draft saved to: 04_Drafts/ch{chapter_number:02d}_v*.txt")
        loguru_logger.info(f"Reviews saved to: 05_Reviews/")

        print("\n" + "=" * 60)
        print("HUMAN INTERVENTION REQUIRED")
        print("=" * 60)
        print(f"\nChapter {chapter_number} has been generated and is pending final approval.\n")
        print("Options:")
        print("  1. Approve - Commit chapter and continue")
        print("  2. Rewrite - Send back for rewrite")
        print("  3. Modify Outline - Modify chapter outline and restart")
        print("  4. Abort - Stop generation")
        print()

        while True:
            choice = input("Enter choice (1-4): ").strip()

            if choice == "1":
                self.state_machine.human_approve()
                return True
            elif choice == "2":
                self.state_machine.human_request_rewrite()
                return True
            elif choice == "3":
                self.state_machine.human_modify_outline()
                loguru_logger.info("Please modify the chapter outline and restart.")
                return False
            elif choice == "4":
                loguru_logger.info("Generation aborted by user.")
                return False
            else:
                print("Invalid choice. Please enter 1-4.")


def setup_logging():
    """Configure logging with loguru."""
    loguru_logger.remove()
    loguru_logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>",
        level=os.getenv("LOG_LEVEL", "INFO")
    )
    loguru_logger.add(
        "logs/autonovel.log",
        rotation="10 MB",
        retention="1 week",
        level="DEBUG"
    )


async def main():
    """Main entry point."""
    # Load .env file
    from dotenv import load_dotenv
    load_dotenv()

    setup_logging()

    loguru_logger.info("AutoNovel-Studio v1.0.0")
    loguru_logger.info("=" * 60)
    loguru_logger.info(f"API Base URL: {os.getenv('OPENAI_BASE_URL', 'default')}")
    loguru_logger.info(f"Author Model: {os.getenv('AUTHOR_MODEL', 'default')}")
    loguru_logger.info(f"Editor Model: {os.getenv('EDITOR_MODEL', 'default')}")

    # Load environment
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    author_model = os.getenv("AUTHOR_MODEL", "gpt-4o-mini")
    editor_model = os.getenv("EDITOR_MODEL", "gpt-4o")
    reader_model = os.getenv("READER_MODEL", "gpt-4o-mini")

    if not api_key:
        loguru_logger.warning("OPENAI_API_KEY not set. Using mock mode for testing.")
        loguru_logger.warning("Set OPENAI_API_KEY in .env file to use real LLM.")

    # Create generator
    generator = NovelGenerator(
        project_root=".",
        author_model=author_model,
        editor_model=editor_model,
        reader_model=reader_model,
        api_key=api_key,
        base_url=base_url
    )

    # Get chapter number from user or default to 1
    if len(sys.argv) > 1:
        try:
            chapter_num = int(sys.argv[1])
        except ValueError:
            loguru_logger.error(f"Invalid chapter number: {sys.argv[1]}")
            return
    else:
        chapter_num = 1

    # Generate chapter
    success = await generator.generate_chapter(chapter_num)

    if success:
        loguru_logger.info(f"Successfully generated Chapter {chapter_num}!")
    else:
        loguru_logger.error(f"Failed to generate Chapter {chapter_num}")


if __name__ == "__main__":
    asyncio.run(main())
