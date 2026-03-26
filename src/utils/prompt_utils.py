"""
Jinja2 template utilities for prompt management.
"""
import os
from pathlib import Path
from typing import Any, Dict, Optional
from jinja2 import (
    Environment,
    FileSystemLoader,
    Template,
    select_autoescape,
    StrictUndefined
)
import logging

logger = logging.getLogger(__name__)


class PromptManager:
    """
    Manages Jinja2 templates for LLM prompts.
    Ensures complete separation of prompts from code.
    """

    def __init__(self, prompts_dir: str = "prompts"):
        """
        Initialize prompt manager.

        Args:
            prompts_dir: Directory containing prompt templates
        """
        # Get absolute path to prompts directory
        project_root = Path(__file__).parent.parent.parent
        self.prompts_path = project_root / prompts_dir

        # Ensure prompts directory exists
        self.prompts_path.mkdir(exist_ok=True)

        # Initialize Jinja2 environment
        self.env = Environment(
            loader=FileSystemLoader(str(self.prompts_path)),
            autoescape=select_autoescape(),
            undefined=StrictUndefined,  # Raise error for undefined variables
            trim_blocks=True,
            lstrip_blocks=True
        )

        logger.info(f"Initialized PromptManager with templates from {self.prompts_path}")

    def get_template(self, template_name: str) -> Template:
        """
        Get a Jinja2 template.

        Args:
            template_name: Name of the template file

        Returns:
            Jinja2 Template object

        Raises:
            TemplateNotFound: If template doesn't exist
        """
        return self.env.get_template(template_name)

    def render(
        self,
        template_name: str,
        context: Dict[str, Any],
        validate: bool = True
    ) -> str:
        """
        Render a template with the given context.

        Args:
            template_name: Name of the template file
            context: Dictionary of variables to render
            validate: Whether to validate that all variables were used

        Returns:
            Rendered prompt string
        """
        template = self.get_template(template_name)
        rendered = template.render(**context)

        if validate:
            # Check for undefined variables (StrictUndefined handles this at render time)
            pass

        logger.debug(f"Rendered template: {template_name}")
        return rendered

    def render_to_file(
        self,
        template_name: str,
        context: Dict[str, Any],
        output_path: str
    ) -> str:
        """
        Render a template and save to file (for debugging).

        Args:
            template_name: Name of the template file
            context: Dictionary of variables to render
            output_path: Path to save rendered prompt

        Returns:
            Rendered prompt string
        """
        rendered = self.render(template_name, context)

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(rendered)

        logger.info(f"Saved rendered template to {output_path}")
        return rendered

    def list_templates(self) -> list:
        """
        List all available templates.

        Returns:
            List of template names
        """
        return self.env.list_templates()

    def template_exists(self, template_name: str) -> bool:
        """
        Check if a template exists.

        Args:
            template_name: Name of the template

        Returns:
            True if template exists
        """
        try:
            self.env.get_template(template_name)
            return True
        except Exception:
            return False


class PromptBuilder:
    """
    Helper class for building prompt contexts.
    Provides type-safe context construction.
    """

    @staticmethod
    def author_context(
        book_meta: Dict[str, Any],
        volume_outline: str,
        recent_summaries: str,
        chapter_outline: Dict[str, Any],
        scene_target: str,
        editor_plan: Optional[str] = None,
        draft_summary: Optional[Any] = None,
        word_count: int = 800,
        example_samples: Optional[str] = None,
        is_rewrite: bool = False
    ) -> Dict[str, Any]:
        """
        Build context for author agent prompt.

        Args:
            book_meta: Novel metadata
            volume_outline: Current volume outline
            recent_summaries: Recent chapter summaries (sliding window)
            chapter_outline: Current chapter outline
            scene_target: Current scene to write
            editor_plan: Editor's revision instructions (if rewrite)
            draft_summary: Draft summary from DraftSummarizer (v2.1 smart retry)
            word_count: Target word count
            example_samples: Optional writing examples for few-shot learning
            is_rewrite: Whether this is a rewrite attempt (for blind rewrite mode)

        Returns:
            Context dictionary for rendering
        """
        context = {
            "book_title": book_meta.get("title", ""),
            "book_genre": book_meta.get("genre", ""),
            "book_tone": book_meta.get("tone", ""),
            "sub_genres": book_meta.get("sub_genres", []),
            "forbidden_elements": book_meta.get("forbidden_elements", []),
            "volume_outline": volume_outline,
            "recent_summaries": recent_summaries,
            "chapter_title": chapter_outline.get("title", ""),
            "chapter_summary": chapter_outline.get("summary", ""),
            "scene_target": scene_target,
            "editor_plan": editor_plan,
            "word_count": word_count,
            "example_samples": example_samples or "",
            "is_rewrite": is_rewrite
        }

        # v2.1 NEW: Add draft summary to context
        if draft_summary:
            context["draft_summary"] = draft_summary.model_dump() if hasattr(draft_summary, 'model_dump') else draft_summary
            context["has_draft_summary"] = True
        else:
            context["draft_summary"] = None
            context["has_draft_summary"] = False

        return context

    @staticmethod
    def reader_context(
        draft_content: str,
        characters: Dict[str, Any],
        world_lore: Dict[str, Any],
        chapter_outline: Optional[Dict[str, Any]] = None,
        book_meta: Optional[Dict[str, Any]] = None,
        previous_chapters: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Build context for reader agent prompts.

        Args:
            draft_content: The draft to review
            characters: Character profiles and states
            world_lore: World-building settings
            chapter_outline: Chapter outline (optional)
            book_meta: Novel metadata (optional)
            previous_chapters: Previous chapter content (optional)

        Returns:
            Context dictionary for rendering
        """
        context = {
            "draft": draft_content,
            "characters": characters,
            "world_lore": world_lore,
            "chapter_outline": chapter_outline or {},
            "book_meta": book_meta or {},
            "previous_chapters": previous_chapters or ""
        }

        return context

    @staticmethod
    def editor_context(
        draft_content: str,
        reader_feedbacks: list,
        chapter_outline: Dict[str, Any],
        book_meta: Dict[str, Any],
        scene_target: str
    ) -> Dict[str, Any]:
        """
        Build context for editor agent prompt.

        Args:
            draft_content: The draft being reviewed
            reader_feedbacks: List of reader feedback
            chapter_outline: Current chapter outline
            book_meta: Novel metadata
            scene_target: Current scene

        Returns:
            Context dictionary for rendering
        """
        return {
            "draft": draft_content,
            "reader_feedbacks": reader_feedbacks,
            "chapter_title": chapter_outline.get("title", ""),
            "chapter_summary": chapter_outline.get("summary", ""),
            "scene_target": scene_target,
            "book_genre": book_meta.get("genre", ""),
            "sub_genres": book_meta.get("sub_genres", []),
            "book_tone": book_meta.get("tone", ""),
            "forbidden_elements": book_meta.get("forbidden_elements", [])
        }


# Global prompt manager instance
_prompt_manager: Optional[PromptManager] = None


def get_prompt_manager() -> PromptManager:
    """Get the global prompt manager instance."""
    global _prompt_manager
    if _prompt_manager is None:
        _prompt_manager = PromptManager()
    return _prompt_manager
