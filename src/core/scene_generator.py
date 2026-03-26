"""
Scene-level generation workflow for AutoNovel-Studio v2.1.
Implements the new architecture: Scene Outline → Scene Draft → Scene Readers → Editor → Next Scene

v2.1 ENHANCEMENT: Smart retry mechanism with Editor decision
- Editor reviews scene reader feedbacks
- Editor decides whether Author can view previous draft (based on error severity)
- DraftSummarizer generates brief/full summary if Editor allows
- Author gets summary (or None for blind rewrite) when revising
"""
import logging
import json
from typing import Dict, Any, List
from pathlib import Path

from .models import SceneReaderFeedback
from ..agents.author import AuthorAgent
from ..agents.scene_readers import (
    ScenePacingReviewer,
    SceneLoreChecker,
    SceneAIToneDetector
)
from ..agents.editor import EditorAgent
from ..agents.draft_summarizer import DraftSummarizer

logger = logging.getLogger(__name__)


class SceneGenerator:
    """
    Manages scene-level generation workflow with smart retry mechanism.
    """

    def __init__(
        self,
        author: AuthorAgent,
        editor: EditorAgent,
        llm_client: Any,
        output_dir: Path
    ):
        """
        Initialize Scene Generator.

        Args:
            author: Author Agent instance
            editor: Editor Agent instance
            llm_client: LLM client for scene readers and summarizer
            output_dir: Base output directory
        """
        self.author = author
        self.editor = editor
        self.output_dir = output_dir

        # Initialize scene-level readers
        self.scene_pacing_reviewer = ScenePacingReviewer(llm_client)
        self.scene_lore_checker = SceneLoreChecker(llm_client)
        self.scene_ai_tone_detector = SceneAIToneDetector(llm_client)

        # v2.1 NEW: Initialize DraftSummarizer
        self.draft_summarizer = DraftSummarizer(llm_client)

    async def generate_scene_with_review(
        self,
        book_meta: Dict[str, Any],
        volume_outline: str,
        recent_summaries: str,
        chapter_outline: Dict[str, Any],
        scene_data: Dict[str, Any],
        scene_number: int,
        total_scenes: int,
        characters_info: str,
        world_lore: str,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """
        Generate a single scene with scene-level review iteration.

        Args:
            book_meta: Novel metadata
            volume_outline: Volume outline
            recent_summaries: Recent chapter summaries
            chapter_outline: Chapter outline
            scene_data: Basic scene data (title, pov, setting)
            scene_number: Current scene number (1-indexed)
            total_scenes: Total scenes in chapter
            characters_info: Character info JSON string
            world_lore: World lore JSON string
            max_retries: Maximum retry count for scene revision

        Returns:
            Dict with:
                - scene_content: Final scene content
                - scene_outline: Generated scene outline
                - all_feedbacks: List of all scene reader feedbacks
                - retry_count: Number of retries used
        """
        logger.info(f"=== Starting Scene {scene_number}/{total_scenes}: {scene_data.get('title')} ===")

        # Step 1: Generate detailed scene outline
        logger.info("Step 1: Generating scene outline...")
        scene_outline = await self.author.generate_scene_outline(
            book_meta=book_meta,
            volume_outline=volume_outline,
            chapter_outline=chapter_outline,
            scene_number=scene_number,
            total_scenes=total_scenes,
            scene_data=scene_data,
            characters_info=characters_info,
            world_lore=world_lore
        )

        # Save scene outline
        scene_outline_path = self.output_dir / "02_Outlines" / f"chapter_01_scene_{scene_number}_outline.json"
        scene_outline_path.parent.mkdir(parents=True, exist_ok=True)
        with open(scene_outline_path, 'w', encoding='utf-8') as f:
            json.dump(scene_outline, f, ensure_ascii=False, indent=2)
        logger.info(f"Scene outline saved to: {scene_outline_path}")

        # Step 2: Generate initial scene draft
        logger.info("Step 2: Generating scene draft...")
        scene_target = self._format_scene_target(scene_outline)

        scene_content = await self.author.generate_scene(
            book_meta=book_meta,
            volume_outline=volume_outline,
            recent_summaries=recent_summaries,
            chapter_outline=chapter_outline,
            scene_target=scene_target,
            word_count=scene_outline.get("word_count_target", 800),
            is_rewrite=False
        )

        # Step 3: Scene-level review iteration
        all_feedbacks = []
        retry_count = 0

        for retry in range(max_retries + 1):
            logger.info(f"=== Scene Review Iteration {retry + 1}/{max_retries + 1} ===")

            # Run scene-level reviewers concurrently
            logger.info("Running scene-level reviewers...")
            feedbacks = await self._run_scene_reviewers(
                draft=scene_content,
                scene_outline=scene_outline,
                book_meta=book_meta,
                characters_info=characters_info,
                world_lore=world_lore
            )
            all_feedbacks.append(feedbacks)

            # Check if all scene readers approve
            if self._check_scene_approval(feedbacks):
                logger.info("Scene approved by all scene-level readers!")
                break

            # If not approved, get Editor's revision plan
            if retry < max_retries:
                logger.info("Scene needs revision...")

                # v2.1 NEW: Get Editor's decision on draft viewing
                editor_plan = await self._get_editor_revision_plan(
                    feedbacks=feedbacks,
                    scene_outline=scene_outline,
                    book_meta=book_meta
                )

                # v2.1 NEW: Generate draft summary based on Editor's decision
                draft_summary = None
                if editor_plan.provide_previous_draft:
                    logger.info(f"Editor allows draft viewing (level: {editor_plan.draft_summary_level})")

                    # Extract all issues from feedbacks
                    all_issues = self._extract_all_issues(feedbacks)

                    # Generate summary
                    draft_summary = await self.draft_summarizer.summarize_draft(
                        draft=scene_content,
                        draft_summary_level=editor_plan.draft_summary_level,
                        identified_issues=all_issues,
                        scene_outline=scene_outline
                    )

                    if draft_summary:
                        logger.info(f"Draft summary generated: {draft_summary.summary_level}")
                else:
                    logger.info("Editor decided: blind rewrite (no draft viewing)")

                # Generate revised scene with summary (or None)
                scene_content = await self.author.generate_scene(
                    book_meta=book_meta,
                    volume_outline=volume_outline,
                    recent_summaries=recent_summaries,
                    chapter_outline=chapter_outline,
                    scene_target=scene_target,
                    editor_plan=self._format_editor_plan_for_author(editor_plan),
                    draft_summary=draft_summary,
                    word_count=scene_outline.get("word_count_target", 800),
                    is_rewrite=True
                )
                retry_count += 1
            else:
                logger.warning("Max retries reached for scene, proceeding anyway")

        # Save final scene content
        scene_path = self.output_dir / "04_Drafts" / f"ch01_scene_{scene_number}.txt"
        scene_path.parent.mkdir(parents=True, exist_ok=True)
        with open(scene_path, 'w', encoding='utf-8') as f:
            f.write(scene_content)
        logger.info(f"Scene content saved to: {scene_path}")

        return {
            "scene_content": scene_content,
            "scene_outline": scene_outline,
            "all_feedbacks": all_feedbacks,
            "retry_count": retry_count
        }

    async def _run_scene_reviewers(
        self,
        draft: str,
        scene_outline: Dict[str, Any],
        book_meta: Dict[str, Any],
        characters_info: str,
        world_lore: str
    ) -> Dict[str, SceneReaderFeedback]:
        """Run all scene-level reviewers concurrently."""
        import asyncio

        # Prepare context
        context = {
            "pov_character": scene_outline.get("pov_character", ""),
            "setting": scene_outline.get("setting", ""),
            "book_tone": book_meta.get("tone", ""),
            "book_genre": book_meta.get("genre", ""),
        }

        # Run all scene readers concurrently
        results = await asyncio.gather(
            self.scene_pacing_reviewer.review_scene(
                draft=draft,
                scene_outline=scene_outline,
                book_meta=book_meta,
                **context
            ),
            self.scene_lore_checker.review_scene(
                draft=draft,
                scene_outline=scene_outline,
                book_meta=book_meta,
                characters_info=characters_info,
                world_lore=world_lore,
                **context
            ),
            self.scene_ai_tone_detector.review_scene(
                draft=draft,
                scene_outline=scene_outline,
                book_meta=book_meta,
                **context
            ),
            return_exceptions=True
        )

        # Build feedback dict
        feedbacks = {
            "pacing": results[0] if not isinstance(results[0], Exception) else None,
            "lore": results[1] if not isinstance(results[1], Exception) else None,
            "ai_tone": results[2] if not isinstance(results[2], Exception) else None
        }

        # Log any errors
        reader_names = ["pacing", "lore", "ai_tone"]
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Scene reader {reader_names[i]} failed: {result}")

        return feedbacks

    def _check_scene_approval(self, feedbacks: Dict[str, SceneReaderFeedback]) -> bool:
        """Check if all scene readers approve the scene."""
        for reader_name, feedback in feedbacks.items():
            if feedback is None:
                logger.warning(f"Reader {reader_name} returned None, treating as failure")
                return False

            if not feedback.pass_status:
                logger.info(f"Scene rejected by {reader_name}: {feedback.quick_comment}")
                return False

            # Check for critical issues (severity 4-5)
            all_issues = (
                feedback.critical_issues +
                feedback.lore_violations +
                feedback.ai_tone_issues
            )
            for issue in all_issues:
                if issue.severity >= 4:
                    logger.warning(f"Critical issue (severity {issue.severity}) found by {reader_name}")
                    return False

        logger.info("All scene readers approved!")
        return True

    def _build_scene_revision_plan(self, feedbacks: Dict[str, SceneReaderFeedback]) -> str:
        """Build revision plan from scene feedbacks."""
        instructions = []

        for reader_name, feedback in feedbacks.items():
            if feedback is None:
                continue

            # Add quick comment as header
            if feedback.quick_comment:
                instructions.append(f"## {reader_name.upper()}: {feedback.quick_comment}")

            # Add all issues with severity >= 3
            all_issues = (
                feedback.critical_issues +
                feedback.lore_violations +
                feedback.ai_tone_issues
            )

            for issue in all_issues:
                if issue.severity >= 3:
                    instructions.append(f"- [{issue.type}] (Severity {issue.severity}): {issue.fix_instruction}")
                    if issue.quote:
                        instructions.append(f"  > 原文: \"{issue.quote}\"")

            instructions.append("")  # Blank line between readers

        return "\n".join(instructions)

    # v2.1 NEW: Editor decision methods
    async def _get_editor_revision_plan(
        self,
        feedbacks: Dict[str, SceneReaderFeedback],
        scene_outline: Dict[str, Any],
        book_meta: Dict[str, Any]
    ):
        """
        Get Editor's revision plan with smart retry decision.

        Args:
            feedbacks: Scene reader feedbacks
            scene_outline: Scene outline
            book_meta: Book metadata

        Returns:
            EditorRevisionPlan object
        """
        # Build feedback summary for Editor
        feedback_summary = self._build_scene_revision_plan(feedbacks)

        # Load Editor prompt
        editor_prompt_template = self._load_editor_prompt_template()

        # Format context
        context = {
            "book_tone": book_meta.get("tone", ""),
            "book_genre": book_meta.get("genre", ""),
            "scene_title": scene_outline.get("title", ""),
            "feedback_summary": feedback_summary
        }

        # Call Editor
        try:
            editor_plan = await self.editor.review_scene_feedback(
                scene_outline=scene_outline,
                feedback_summary=feedback_summary,
                book_meta=book_meta
            )

            logger.info(f"Editor decision: provide_previous_draft={editor_plan.provide_previous_draft}, "
                       f"draft_summary_level={editor_plan.draft_summary_level}")
            return editor_plan

        except Exception as e:
            logger.error(f"Failed to get editor plan: {e}, using fallback")
            # Fallback: build simple plan and deny draft viewing
            from .models import EditorRevisionPlan
            return EditorRevisionPlan(
                pass_status=False,
                rejected_feedbacks=[],
                revision_instructions=[feedback_summary],
                scene_target=scene_outline.get("focus_point", ""),
                priority_fixes=[],
                provide_previous_draft=False,  # Safe default: blind rewrite
                draft_summary_level="none"
            )

    def _extract_all_issues(self, feedbacks: Dict[str, SceneReaderFeedback]) -> List[Dict[str, Any]]:
        """
        Extract all issues from scene feedbacks.

        Args:
            feedbacks: Scene reader feedbacks

        Returns:
            List of issue dicts
        """
        all_issues = []

        for reader_name, feedback in feedbacks.items():
            if feedback is None:
                continue

            # Extract all issue types
            issue_lists = [
                feedback.critical_issues,
                feedback.lore_violations,
                feedback.ai_tone_issues
            ]

            for issue_list in issue_lists:
                for issue in issue_list:
                    all_issues.append({
                        "error_type": issue.type,
                        "severity": issue.severity,
                        "quote": issue.quote,
                        "description": issue.fix_instruction
                    })

        return all_issues

    def _format_editor_plan_for_author(self, editor_plan) -> str:
        """
        Format Editor's revision plan for Author.

        Args:
            editor_plan: EditorRevisionPlan object

        Returns:
            Formatted plan string
        """
        parts = []

        parts.append(f"## 修订目标\n{editor_plan.scene_target}")

        if editor_plan.priority_fixes:
            parts.append("\n## 优先修正（必须处理）")
            for fix in editor_plan.priority_fixes:
                parts.append(f"- {fix}")

        parts.append("\n## 详细指示")
        for instruction in editor_plan.revision_instructions:
            parts.append(f"- {instruction}")

        if editor_plan.rejected_feedbacks:
            parts.append("\n## 已忽略的反馈")
            for rejection in editor_plan.rejected_feedbacks:
                parts.append(f"- {rejection}")

        return "\n".join(parts)

    def _load_editor_prompt_template(self) -> Dict[str, str]:
        """Load Editor prompt template for scene-level review."""
        # For now, return a simple default
        # TODO: Load from prompts/editor_scene_review.j2
        return {
            "system": "You are an editor reviewing scene feedback.",
            "user": "Review the following feedback and provide revision instructions."
        }

    def _format_scene_target(self, scene_outline: Dict[str, Any]) -> str:
        """Format scene outline into scene target string."""
        parts = []

        parts.append(f"## 场景标题：{scene_outline.get('title', '')}")

        if scene_outline.get("plot_points"):
            parts.append("## 情节要点：")
            for i, point in enumerate(scene_outline["plot_points"], 1):
                parts.append(f"{i}. {point}")

        if scene_outline.get("logic_chain"):
            parts.append(f"\n## 因果逻辑链：\n{scene_outline['logic_chain']}")

        if scene_outline.get("emotional_arc"):
            parts.append(f"\n## 情绪弧线：\n{scene_outline['emotional_arc']}")

        if scene_outline.get("focus_point"):
            parts.append(f"\n## 描写要点：\n{scene_outline['focus_point']}")

        return "\n".join(parts)
