"""
Scene-level Reader Agents.
Fast, focused reviewers for scene draft iteration.
"""
import logging
from typing import Dict, Any
from ..core.llm_client import BaseLLMClient
from ..core.models import SceneReaderFeedback
from ..utils.prompt_utils import get_prompt_manager

logger = logging.getLogger(__name__)


class BaseSceneReader:
    """Base class for scene-level readers."""

    def __init__(
        self,
        llm_client: BaseLLMClient,
        prompt_template: str,
        reader_role: str
    ):
        self.llm_client = llm_client
        self.prompt_template = prompt_template
        self.reader_role = reader_role
        self.prompt_manager = get_prompt_manager()

    async def review_scene(
        self,
        draft: str,
        scene_outline: Dict[str, Any],
        book_meta: Dict[str, Any],
        **kwargs
    ) -> SceneReaderFeedback:
        """Review a scene draft and return feedback."""
        try:
            # Build context
            context = {
                "draft": draft,
                "scene_target": scene_outline.get("title", ""),
                "book_tone": book_meta.get("tone", ""),
                "book_genre": book_meta.get("genre", ""),
            }

            # Add scene-specific fields
            if "logic_chain" in scene_outline:
                context["logic_chain"] = scene_outline["logic_chain"]
            if "emotional_arc" in scene_outline:
                context["emotional_arc"] = scene_outline["emotional_arc"]
            if "focus_point" in scene_outline:
                context["focus_point"] = scene_outline["focus_point"]

            # Add kwargs (characters_info, world_lore, etc.)
            context.update(kwargs)

            # Render prompt
            prompt = self.prompt_manager.render(self.prompt_template, context)

            # Generate feedback
            feedback = await self.llm_client.generate_json(
                system_prompt=f"You are the {self.reader_role}.",
                user_prompt=prompt,
                response_model=SceneReaderFeedback,
                temperature=0.3
            )

            logger.info(
                f"{self.reader_role}: Scene review complete - "
                f"pass={feedback.pass_status}, "
                f"issues={len(feedback.critical_issues) + len(feedback.lore_violations) + len(feedback.ai_tone_issues)}"
            )
            return feedback

        except Exception as e:
            logger.error(f"{self.reader_role}: Scene review failed: {e}")
            # Return safe default
            return SceneReaderFeedback(
                reader_role=self.reader_role,
                pass_status=False,
                quick_comment=f"Review failed: {str(e)}",
                critical_issues=[],
                lore_violations=[],
                ai_tone_issues=[]
            )


class ScenePacingReviewer(BaseSceneReader):
    """Scene-level pacing and physics engine reviewer."""

    def __init__(self, llm_client: BaseLLMClient):
        super().__init__(
            llm_client=llm_client,
            prompt_template="reader_scene_pacing.j2",
            reader_role="scene_pacing_reviewer"
        )


class SceneLoreChecker(BaseSceneReader):
    """Scene-level lore consistency checker."""

    def __init__(self, llm_client: BaseLLMClient):
        super().__init__(
            llm_client=llm_client,
            prompt_template="reader_scene_lore.j2",
            reader_role="scene_lore_checker"
        )


class SceneAIToneDetector(BaseSceneReader):
    """Scene-level AI tone detector."""

    def __init__(self, llm_client: BaseLLMClient):
        super().__init__(
            llm_client=llm_client,
            prompt_template="reader_scene_ai_tone.j2",
            reader_role="scene_ai_tone_detector"
        )
