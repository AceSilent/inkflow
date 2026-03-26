"""
Reader Agents - Evaluate generated content from different perspectives.
All reader agents must run concurrently using asyncio.
"""
import logging
from typing import Dict, Any, Optional
from abc import ABC, abstractmethod
from ..core.llm_client import BaseLLMClient
from ..core.models import ReaderFeedback
from ..utils.prompt_utils import PromptBuilder, get_prompt_manager

logger = logging.getLogger(__name__)


class BaseReaderAgent(ABC):
    """
    Abstract base class for all reader agents.
    """

    def __init__(
        self,
        llm_client: BaseLLMClient,
        prompt_manager: Optional[Any] = None
    ):
        """
        Initialize reader agent.

        Args:
            llm_client: LLM client for review generation
            prompt_manager: Optional prompt manager instance
        """
        self.llm_client = llm_client
        self.prompt_manager = prompt_manager or get_prompt_manager()
        self.reader_role = self.__class__.__name__

    @abstractmethod
    def get_template_name(self) -> str:
        """Return the Jinja2 template name for this reader."""
        pass

    @abstractmethod
    def build_context(
        self,
        draft_content: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Build the prompt context for this reader."""
        pass

    async def review(
        self,
        draft_content: str,
        **kwargs
    ) -> ReaderFeedback:
        """
        Review a draft and return feedback.

        Args:
            draft_content: The draft to review
            **kwargs: Additional context parameters

        Returns:
            ReaderFeedback object
        """
        logger.info(f"{self.reader_role}: Starting review")

        # Build context
        context = self.build_context(draft_content, **kwargs)

        # Render prompt
        template_name = self.get_template_name()
        system_prompt = f"You are the {self.reader_role}, a specialized novel reviewer."
        user_prompt = self.prompt_manager.render(template_name, context)

        # Generate feedback
        try:
            feedback = await self.llm_client.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=ReaderFeedback,
                temperature=0.3  # Lower temperature for consistent evaluation
            )

            logger.info(
                f"{self.reader_role}: Review complete "
                f"(score: {feedback.immersion_score}/10, "
                f"issues: {len(feedback.issues)})"
            )
            return feedback

        except Exception as e:
            logger.error(f"{self.reader_role}: Review failed: {e}")
            # Return minimal feedback on error
            return ReaderFeedback(
                reader_role=self.reader_role.lower().replace("agent", ""),
                immersion_score=1,
                emotional_watermark="confused",
                issues=[],
                overall_comment=f"Review failed due to error: {str(e)}"
            )


class LoreKeeperAgent(BaseReaderAgent):
    """
    The Lore Keeper checks factual consistency against established lore.
    Focuses on character states, world rules, and continuity.
    """

    def get_template_name(self) -> str:
        return "reader_lore_keeper.j2"

    def build_context(
        self,
        draft_content: str,
        characters: Dict[str, Any],
        world_lore: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        return PromptBuilder.reader_context(
            draft_content=draft_content,
            characters=characters,
            world_lore=world_lore
        )


class PacingJunkieAgent(BaseReaderAgent):
    """
    The Pacing Junkie evaluates emotional experience and narrative flow.
    Tracks engagement, pacing, and tone consistency.
    """

    def get_template_name(self) -> str:
        return "reader_pacing_junkie.j2"

    def build_context(
        self,
        draft_content: str,
        book_meta: Dict[str, Any],
        chapter_outline: Optional[Dict[str, Any]] = None,
        previous_chapters: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        return PromptBuilder.reader_context(
            draft_content=draft_content,
            characters={},  # Not used
            world_lore={},  # Not used
            chapter_outline=chapter_outline,
            book_meta=book_meta,
            previous_chapters=previous_chapters
        )


class AntiTropeScannerAgent(BaseReaderAgent):
    """
    The Anti-Trope Scanner detects forbidden content and clichés.
    Performs mechanical and quality scans.
    """

    def get_template_name(self) -> str:
        return "reader_anti_trope.j2"

    def build_context(
        self,
        draft_content: str,
        book_meta: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        return PromptBuilder.reader_context(
            draft_content=draft_content,
            characters={},  # Not used
            world_lore={},  # Not used
            book_meta=book_meta
        )


class AIToneScannerAgent(BaseReaderAgent):
    """
    The AI Tone Scanner detects AI-generated writing patterns.
    Focuses on mechanical flaws, redundant phrases, and unnatural expression.
    """

    def get_template_name(self) -> str:
        return "reader_ai_tone.j2"

    def build_context(
        self,
        draft_content: str,
        book_meta: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        return {
            "draft": draft_content,
            "book_tone": book_meta.get("tone", "neutral"),
            "genre": book_meta.get("genre", "")
        }


class ReaderMatrix:
    """
    Manages all reader agents and executes them concurrently.
    """

    def __init__(
        self,
        lore_keeper: LoreKeeperAgent,
        pacing_junkie: PacingJunkieAgent,
        anti_trope_scanner: AntiTropeScannerAgent,
        ai_tone_scanner: AIToneScannerAgent
    ):
        """
        Initialize reader matrix.

        Args:
            lore_keeper: Lore Keeper agent instance
            pacing_junkie: Pacing Junkie agent instance
            anti_trope_scanner: Anti-Trope Scanner agent instance
            ai_tone_scanner: AI Tone Scanner agent instance
        """
        self.lore_keeper = lore_keeper
        self.pacing_junkie = pacing_junkie
        self.anti_trope_scanner = anti_trope_scanner
        self.ai_tone_scanner = ai_tone_scanner

    async def review_concurrently(
        self,
        draft_content: str,
        context: Dict[str, Any]
    ) -> Dict[str, ReaderFeedback]:
        """
        Execute all reader agents concurrently.

        Args:
            draft_content: The draft to review
            context: Shared context dictionary

        Returns:
            Dictionary mapping reader names to their feedback
        """
        import asyncio

        logger.info("Starting concurrent reader review")

        # Prepare parameters for each reader
        lore_params = {
            "draft_content": draft_content,
            "characters": context.get("characters", {}),
            "world_lore": context.get("world_lore", {})
        }

        pacing_params = {
            "draft_content": draft_content,
            "book_meta": context.get("book_meta", {}),
            "chapter_outline": context.get("chapter_outline"),
            "previous_chapters": context.get("previous_chapters")
        }

        trope_params = {
            "draft_content": draft_content,
            "book_meta": context.get("book_meta", {})
        }

        ai_tone_params = {
            "draft_content": draft_content,
            "book_meta": context.get("book_meta", {})
        }

        # Execute concurrently
        results = await asyncio.gather(
            self.lore_keeper.review(**lore_params),
            self.pacing_junkie.review(**pacing_params),
            self.anti_trope_scanner.review(**trope_params),
            self.ai_tone_scanner.review(**ai_tone_params),
            return_exceptions=True
        )

        # Collect results
        feedbacks = {}
        reader_names = ["lore_keeper", "pacing_junkie", "anti_trope_scanner", "ai_tone_scanner"]

        for name, result in zip(reader_names, results):
            if isinstance(result, Exception):
                logger.error(f"{name} failed with exception: {result}")
                # Create error feedback
                feedbacks[name] = ReaderFeedback(
                    reader_role=name,
                    immersion_score=1,
                    emotional_watermark="confused",
                    issues=[],
                    overall_comment=f"Review failed: {str(result)}"
                )
            else:
                feedbacks[name] = result

        logger.info("Concurrent review complete")
        return feedbacks

    def get_average_immersion_score(self, feedbacks: Dict[str, ReaderFeedback]) -> float:
        """Calculate average immersion score across all readers."""
        if not feedbacks:
            return 0.0
        total = sum(f.immersion_score for f in feedbacks.values())
        return total / len(feedbacks)

    def get_critical_issues(self, feedbacks: Dict[str, ReaderFeedback], min_severity: int = 4) -> list:
        """Get all issues with severity >= min_severity."""
        critical_issues = []
        for feedback in feedbacks.values():
            for issue in feedback.issues:
                if issue.severity >= min_severity:
                    critical_issues.append({
                        "reader": feedback.reader_role,
                        "issue": issue
                    })
        return critical_issues


class BaseReader:
    """
    Simplified reader for the v4.5 self-healing workflow loop.
    Provides a synchronous evaluate() method used by ShowrunnerWorkflow.step().
    """
    def evaluate(self, draft_text: str) -> Dict[str, Any]:
        """Evaluate a draft and return score + feedback. Override or mock in tests."""
        return {"score": 5, "feedback": "Default review - no LLM connected."}


# Alias for workflow imports
QualityReviewer = BaseReader
