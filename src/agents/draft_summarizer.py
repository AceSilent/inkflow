"""
Draft Summarizer Agent for AutoNovel-Studio v2.1.
Generates intelligent summaries based on Editor's decision (none/brief/full).

This enables the smart retry mechanism:
- Severity 4-5 errors → blind rewrite (no summary provided)
- Severity 1-3 errors → brief/full summary for polishing
"""
import logging
from typing import Dict, Any, Optional
from pathlib import Path

from pydantic import BaseModel, Field

from ..core.llm_client import BaseLLMClient

logger = logging.getLogger(__name__)


class DraftSummary(BaseModel):
    """
    Draft summary output from DraftSummarizer.
    """
    summary_level: str = Field(
        ...,
        description="Type of summary: 'brief' or 'full'"
    )
    brief_summary: Optional[str] = Field(
        None,
        description="1-2 sentence summary for minor errors (Severity 1-2)"
    )
    full_summary: Optional[str] = Field(
        None,
        description="Comprehensive summary preserving key details for moderate errors (Severity 3)"
    )

    # Key elements extraction (for both brief and full)
    key_characters: list[str] = Field(
        default_factory=list,
        description="Characters present in the scene"
    )
    key_events: list[str] = Field(
        default_factory=list,
        description="Key events that must be preserved"
    )
    emotional_tone: str = Field(
        ...,
        description="Emotional tone of the scene"
    )

    # What NOT to repeat (for full summary)
    repeated_issues: list[str] = Field(
        default_factory=list,
        description="Issues that were identified and should be avoided in rewrite"
    )


class DraftSummarizer:
    """
    草稿摘要生成器

    Generates summaries based on Editor's provide_previous_draft decision:
    - draft_summary_level = "none" → No summary (blind rewrite)
    - draft_summary_level = "brief" → 1-2 sentence summary + key characters/events
    - draft_summary_level = "full" → Full summary with all details + what to avoid

    Decision Logic (from Editor Agent):
    | Error Type           | Severity | provide_previous_draft | draft_summary_level |
    |----------------------|----------|----------------------|-------------------|
    | Lore_Conflict        | 4-5      | false                | none              |
    | Physics_Engine_Violation | 5    | false                | none              |
    | Logic_Leap           | 4-5      | false                | none              |
    | Cliche_Phrase        | 2-3      | true                 | brief             |
    | Redundant_Words      | 1-2      | true                 | brief             |
    | Weak_Wording         | 1-2      | true                 | full              |
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize DraftSummarizer.

        Args:
            llm_client: LLM client for generation
        """
        self.llm_client = llm_client

    async def summarize_draft(
        self,
        draft: str,
        draft_summary_level: str,
        identified_issues: list[Dict[str, Any]],
        scene_outline: Optional[Dict[str, Any]] = None
    ) -> Optional[DraftSummary]:
        """
        Generate draft summary based on Editor's decision.

        Args:
            draft: Previous draft content
            draft_summary_level: Editor decision ("none", "brief", or "full")
            identified_issues: List of issues identified by readers
            scene_outline: Optional scene outline for context

        Returns:
            DraftSummary object or None if level="none"
        """
        if draft_summary_level == "none":
            logger.info("Editor decided: blind rewrite (no summary provided)")
            return None

        logger.info(f"Generating {draft_summary_level} summary...")

        # Load prompt template
        prompt_template = self._load_prompt_template(draft_summary_level)

        # Format context
        context = self._format_context(
            draft=draft,
            scene_outline=scene_outline,
            identified_issues=identified_issues
        )

        # Generate summary
        try:
            summary = await self.llm_client.generate_json(
                system_prompt=prompt_template["system"],
                user_prompt=prompt_template["user"].format(**context),
                response_model=DraftSummary,
                temperature=0.5
            )

            logger.info(f"Summary generated: {summary.summary_level}")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate summary: {e}")
            return None

    def _load_prompt_template(self, summary_level: str) -> Dict[str, str]:
        """
        Load prompt template for summary generation.

        Args:
            summary_level: "brief" or "full"

        Returns:
            Dict with "system" and "user" prompts
        """
        base_dir = Path(__file__).parent.parent.parent / "prompts"

        if summary_level == "brief":
            template_file = base_dir / "summarizer_brief.j2"
        elif summary_level == "full":
            template_file = base_dir / "summarizer_full.j2"
        else:
            raise ValueError(f"Invalid summary level: {summary_level}")

        if not template_file.exists():
            logger.warning(f"Prompt template not found: {template_file}, using default")
            return self._get_default_prompt(summary_level)

        # Read template
        with open(template_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Parse system/user sections
        if "=== SYSTEM ===" in content and "=== USER ===" in content:
            parts = content.split("=== USER ===")
            system = parts[0].replace("=== SYSTEM ===", "").strip()
            user = parts[1].strip()
            return {"system": system, "user": user}
        else:
            logger.warning(f"Invalid template format in {template_file}")
            return self._get_default_prompt(summary_level)

    def _get_default_prompt(self, summary_level: str) -> Dict[str, str]:
        """Get default prompt if template not found."""

        if summary_level == "brief":
            system_prompt = """你是一个专业的小说摘要助手。

任务：为待修改的场景草稿生成简洁摘要（1-2句话）。

要求：
1. 提炼核心情节（什么人、做了什么、结果如何）
2. 提取出场的关键角色列表
3. 提取必须保留的关键事件（1-3个）
4. 总结情感基调

输出格式（JSON）：
{
  "summary_level": "brief",
  "brief_summary": "1-2句话的情节摘要",
  "key_characters": ["角色1", "角色2"],
  "key_events": ["事件1", "事件2"],
  "emotional_tone": "情感基调描述"
}"""

            user_prompt = """请为以下场景草稿生成简洁摘要：

【场景草稿】
{draft}

【已识别的问题】
{issues}

请生成简洁摘要。"""

        else:  # full
            system_prompt = """你是一个专业的小说摘要助手。

任务：为待修改的场景草稿生成详细摘要，保留所有关键细节。

要求：
1. 完整概述情节发展（起因、经过、转折、结果）
2. 提取所有出场角色及其在场景中的作用
3. 提取所有关键事件（按时间顺序）
4. 详细描述情感弧线
5. 明确指出需要避免的问题（基于已识别的问题）

输出格式（JSON）：
{
  "summary_level": "full",
  "full_summary": "详细的情节摘要（3-5句话）",
  "key_characters": ["角色1（作用）", "角色2（作用）"],
  "key_events": ["事件1", "事件2", "事件3"],
  "emotional_tone": "详细的情感基调描述",
  "repeated_issues": ["需要避免的问题1", "问题2"]
}"""

            user_prompt = """请为以下场景草稿生成详细摘要：

【场景草稿】
{draft}

【场景大纲参考】
{scene_outline}

【已识别的问题】
{issues}

请生成详细摘要，帮助作者重写时避免重复错误。"""

        return {"system": system_prompt, "user": user_prompt}

    def _format_context(
        self,
        draft: str,
        scene_outline: Optional[Dict[str, Any]],
        identified_issues: list[Dict[str, Any]]
    ) -> Dict[str, str]:
        """Format context for prompt."""

        context = {
            "draft": draft,
            "issues": self._format_issues(identified_issues),
            "scene_outline": ""
        }

        if scene_outline:
            context["scene_outline"] = self._format_scene_outline(scene_outline)

        return context

    def _format_issues(self, issues: list[Dict[str, Any]]) -> str:
        """Format identified issues for prompt."""
        if not issues:
            return "无"

        formatted = []
        for issue in issues:
            error_type = issue.get("error_type", issue.get("type", "Unknown"))
            severity = issue.get("severity", 0)
            description = issue.get("description", issue.get("fix_instruction", ""))

            formatted.append(f"- [{error_type}] (Severity {severity}): {description}")

        return "\n".join(formatted)

    def _format_scene_outline(self, outline: Dict[str, Any]) -> str:
        """Format scene outline for prompt."""
        parts = []

        if outline.get("title"):
            parts.append(f"标题: {outline['title']}")

        if outline.get("plot_points"):
            parts.append("情节要点:")
            for i, point in enumerate(outline["plot_points"], 1):
                parts.append(f"  {i}. {point}")

        if outline.get("logic_chain"):
            parts.append(f"因果逻辑链:\n{outline['logic_chain']}")

        if outline.get("emotional_arc"):
            parts.append(f"情绪弧线:\n{outline['emotional_arc']}")

        return "\n".join(parts)
