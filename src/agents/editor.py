"""
Editor Agent - The final arbitrator.
Filters reader feedback and provides revision instructions.
"""
import logging
from typing import Dict, Any, List
from ..core.llm_client import BaseLLMClient
from ..core.models import ReaderFeedback, EditorRevisionPlan
from ..utils.prompt_utils import PromptBuilder, get_prompt_manager

logger = logging.getLogger(__name__)


class EditorAgent:
    """
    The Editor Agent reviews all reader feedback and makes the final decision.
    Acts as the Loss Function in the GAN-inspired architecture.
    """

    def __init__(
        self,
        llm_client: BaseLLMClient,
        prompt_manager: Any = None
    ):
        """
        Initialize Editor Agent.

        Args:
            llm_client: LLM client for arbitration (should use strongest model)
            prompt_manager: Optional prompt manager instance
        """
        self.llm_client = llm_client
        self.prompt_manager = prompt_manager or get_prompt_manager()
        logger.info(f"Initialized Editor Agent with model: {llm_client.model_name}")

    async def review(
        self,
        draft_content: str,
        reader_feedbacks: Dict[str, ReaderFeedback],
        chapter_outline: Dict[str, Any],
        book_meta: Dict[str, Any],
        scene_target: str
    ) -> EditorRevisionPlan:
        """
        Review all reader feedback and make editorial decision.

        Args:
            draft_content: The draft being reviewed
            reader_feedbacks: Dictionary of feedback from all readers
            chapter_outline: Current chapter outline
            book_meta: Novel metadata (the "constitution")
            scene_target: Current scene description

        Returns:
            EditorRevisionPlan with pass/fail decision and instructions
        """
        logger.info("Editor: Starting review of reader feedback")

        # Convert feedback objects to dicts for template
        feedbacks_list = []
        for role, feedback in reader_feedbacks.items():
            feedback_dict = {
                "reader_role": feedback.reader_role,
                "immersion_score": feedback.immersion_score,
                "emotional_watermark": feedback.emotional_watermark,
                "issues": [
                    {
                        "error_type": issue.error_type,
                        "severity": issue.severity,
                        "quote": issue.quote,
                        "description": issue.description,
                        "suggestion": issue.suggestion
                    }
                    for issue in feedback.issues
                ],
                "overall_comment": feedback.overall_comment
            }
            feedbacks_list.append(feedback_dict)

        # Build context
        context = PromptBuilder.editor_context(
            draft_content=draft_content,
            reader_feedbacks=feedbacks_list,
            chapter_outline=chapter_outline,
            book_meta=book_meta,
            scene_target=scene_target
        )

        # Add additional metadata
        context["book_title"] = book_meta.get("title", "Untitled")

        # Render prompt
        system_prompt = "You are the Editor, the constitutional guardian of novel integrity."
        user_prompt = self.prompt_manager.render("editor_review.j2", context)

        # Generate editorial decision
        try:
            decision = await self.llm_client.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=EditorRevisionPlan,
                temperature=0.2  # Very low temperature for consistent logic
            )

            logger.info(
                f"Editor decision: {'PASS' if decision.pass_status else 'REJECT'} "
                f"({len(decision.revision_instructions)} instructions, "
                f"{len(decision.priority_fixes)} priority fixes)"
            )
            return decision

        except Exception as e:
            logger.error(f"Editor review failed: {e}")
            # Return safe default on error
            return EditorRevisionPlan(
                pass_status=False,
                rejected_feedbacks=["Editor review failed, defaulting to reject"],
                revision_instructions=[
                    f"Editor system error: {str(e)}",
                    "Please retry the review process"
                ],
                scene_target=scene_target,
                priority_fixes=["Fix editor system error"]
            )

    def analyze_feedback_quality(
        self,
        reader_feedbacks: Dict[str, ReaderFeedback]
    ) -> Dict[str, Any]:
        """
        Analyze the quality and distribution of reader feedback.

        Args:
            reader_feedbacks: Dictionary of reader feedback

        Returns:
            Analysis results
        """
        analysis = {
            "total_issues": 0,
            "critical_issues": 0,
            "severity_distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            "average_immersion": 0.0,
            "error_types": {},
            "reader_agreement": None
        }

        if not reader_feedbacks:
            return analysis

        # Count issues
        for feedback in reader_feedbacks.values():
            analysis["total_issues"] += len(feedback.issues)

            for issue in feedback.issues:
                analysis["severity_distribution"][issue.severity] += 1
                if issue.severity >= 4:
                    analysis["critical_issues"] += 1

                # Track error types
                error_type = issue.error_type
                analysis["error_types"][error_type] = \
                    analysis["error_types"].get(error_type, 0) + 1

        # Calculate average immersion
        total_score = sum(f.immersion_score for f in reader_feedbacks.values())
        analysis["average_immersion"] = total_score / len(reader_feedbacks)

        # Check reader agreement (simple heuristic)
        if len(reader_feedbacks) > 1:
            scores = [f.immersion_score for f in reader_feedbacks.values()]
            score_range = max(scores) - min(scores)
            analysis["reader_agreement"] = "high" if score_range <= 2 else \
                                            "medium" if score_range <= 4 else "low"

        return analysis

    def should_auto_approve(
        self,
        reader_feedbacks: Dict[str, ReaderFeedback],
        analysis: Dict[str, Any]
    ) -> bool:
        """
        Determine if a draft should be auto-approved without editor review.

        Args:
            reader_feedbacks: Reader feedback dictionary
            analysis: Feedback analysis

        Returns:
            True if auto-approve conditions are met
        """
        # Auto-approve if:
        # 1. No critical issues
        # 2. Average immersion >= 8
        # 3. Total issues <= 2

        if analysis["critical_issues"] > 0:
            return False

        if analysis["average_immersion"] < 8.0:
            return False

        if analysis["total_issues"] > 2:
            return False

        return True
