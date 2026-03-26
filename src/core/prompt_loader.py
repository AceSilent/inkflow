"""
AutoNovel-Studio v4.0 — Jinja2 Prompt Loader
Renders .j2 templates from the prompts/ directory with context variables.
"""
import os
from pathlib import Path
from functools import lru_cache
from jinja2 import Environment, FileSystemLoader, TemplateNotFound
import logging

logger = logging.getLogger(__name__)

_env = None


def _get_env() -> Environment:
    global _env
    if _env is None:
        prompts_dir = Path(__file__).parent.parent.parent / "prompts"
        if not prompts_dir.exists():
            raise FileNotFoundError(f"Prompts directory not found: {prompts_dir}")
        _env = Environment(
            loader=FileSystemLoader(str(prompts_dir)),
            keep_trailing_newline=True,
            undefined=lambda: "",  # graceful undefined
        )
        logger.info(f"Jinja2 prompt loader initialized: {prompts_dir}")
    return _env


def render_prompt(template_name: str, **context) -> str:
    """Render a .j2 template with the given context.
    
    Args:
        template_name: Template filename without .j2 extension (e.g. 'reader_scene_lore')
        **context: Template variables
    
    Returns:
        Rendered prompt string
    """
    env = _get_env()
    filename = f"{template_name}.j2" if not template_name.endswith(".j2") else template_name
    try:
        template = env.get_template(filename)
        rendered = template.render(**context)
        return rendered.strip()
    except TemplateNotFound:
        logger.error(f"Prompt template not found: {filename}")
        raise
    except Exception as e:
        logger.error(f"Failed to render template {filename}: {e}")
        raise
