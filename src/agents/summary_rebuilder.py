"""
Summary Rebuilder for AutoNovel-Studio v2.1.
Rebuilds chapter and scene summaries after scene reconstruction.

核心功能：
- 当场景被重构后，自动重新生成场景摘要
- 重新生成章节摘要
- 更新 recent_chapters 目录中的摘要
- 确保 full_summaries.md 与最新内容一致
"""
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
from pydantic import BaseModel, Field

from ..core.llm_client import BaseLLMClient

logger = logging.getLogger(__name__)


class SceneSummary(BaseModel):
    """Scene summary output."""
    scene_number: int
    summary: str = Field(..., description="One-sentence scene summary")
    key_events: List[str] = Field(
        default_factory=list,
        description="2-3 key events in this scene"
    )
    characters_present: List[str] = Field(
        default_factory=list,
        description="Characters present in this scene"
    )


class ChapterSummary(BaseModel):
    """Chapter summary output."""
    chapter_number: int
    summary: str = Field(..., description="One-paragraph chapter summary")
    scene_summaries: List[str] = Field(
        ...,
        description="List of scene summaries"
    )
    word_count: int = Field(..., description="Total word count")


from pydantic import BaseModel, Field


class SummaryRebuilder:
    """
    摘要重构器

    在场景重构后自动重新生成摘要，确保摘要与内容一致。
    """

    def __init__(self, llm_client: BaseLLMClient):
        """
        Initialize SummaryRebuilder.

        Args:
            llm_client: LLM client for generation
        """
        self.llm_client = llm_client

    async def rebuild_scene_summary(
        self,
        scene_text: str,
        scene_number: int,
        scene_outline: Optional[Dict[str, Any]] = None,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> Optional[SceneSummary]:
        """
        重新生成场景摘要。

        Args:
            scene_text: 场景文本
            scene_number: 场景编号
            scene_outline: 场景大纲（可选）
            book_meta: 书籍元数据（可选）

        Returns:
            SceneSummary object or None if failed
        """
        logger.info(f"Rebuilding summary for scene {scene_number}...")

        # Load prompt template
        prompt_template = self._load_prompt_template("scene_summary")

        # Build context
        context = {
            "scene_text": scene_text,
            "scene_number": scene_number,
            "scene_title": scene_outline.get("title", "") if scene_outline else "",
            "book_tone": book_meta.get("tone", "") if book_meta else ""
        }

        try:
            summary = await self.llm_client.generate_json(
                system_prompt=prompt_template["system"],
                user_prompt=prompt_template["user"].format(**context),
                response_model=SceneSummary,
                temperature=0.5
            )

            logger.info(f"Scene summary rebuilt: {summary.summary}")
            return summary

        except Exception as e:
            logger.error(f"Failed to rebuild scene summary: {e}")
            return None

    async def rebuild_chapter_summary(
        self,
        chapter_num: int,
        scene_texts: List[str],
        scene_summaries: List[SceneSummary],
        chapter_outline: Optional[Dict[str, Any]] = None,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> Optional[ChapterSummary]:
        """
        重新生成章节摘要。

        Args:
            chapter_num: 章节编号
            scene_texts: 所有场景文本列表
            scene_summaries: 所有场景摘要列表
            chapter_outline: 章节大纲（可选）
            book_meta: 书籍元数据（可选）

        Returns:
            ChapterSummary object or None if failed
        """
        logger.info(f"Rebuilding summary for chapter {chapter_num}...")

        # Load prompt template
        prompt_template = self._load_prompt_template("chapter_summary")

        # Calculate word count
        word_count = sum(len(text) for text in scene_texts)

        # Build context
        context = {
            "chapter_num": chapter_num,
            "chapter_title": chapter_outline.get("title", "") if chapter_outline else "",
            "chapter_outline": chapter_outline.get("summary", "") if chapter_outline else "",
            "scene_summaries_text": "\n".join([
                f"场景{s.scene_number}: {s.summary}"
                for s in scene_summaries
            ]),
            "word_count": word_count,
            "book_tone": book_meta.get("tone", "") if book_meta else ""
        }

        try:
            summary = await self.llm_client.generate_json(
                system_prompt=prompt_template["system"],
                user_prompt=prompt_template["user"].format(**context),
                response_model=ChapterSummary,
                temperature=0.5
            )

            logger.info(f"Chapter summary rebuilt: {summary.summary}")
            return summary

        except Exception as e:
            logger.error(f"Failed to rebuild chapter summary: {e}")
            return None

    async def update_full_summaries(
        self,
        book_id: str,
        path_manager,
        chapter_num: int,
        chapter_summary: str
    ) -> bool:
        """
        更新 full_summaries.md 文件。

        Args:
            book_id: Book ID
            path_manager: BookPathManager instance
            chapter_num: Chapter number
            chapter_summary: Chapter summary text

        Returns:
            True if successful
        """
        logger.info(f"Updating full_summaries.md for chapter {chapter_num}...")

        summaries_path = path_manager.get_full_summaries_path(book_id)

        try:
            # Read existing summaries
            if summaries_path.exists():
                with open(summaries_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            else:
                content = "# 完整章节摘要\n\n"

            # Check if chapter summary already exists
            chapter_header = f"## 第{chapter_num}章"
            if chapter_header in content:
                # Replace existing summary
                lines = content.split("\n")
                new_lines = []
                skip = False

                for i, line in enumerate(lines):
                    if line.startswith(chapter_header):
                        # Find next chapter header
                        new_lines.append(line)
                        j = i + 1
                        while j < len(lines) and not lines[j].startswith("## 第"):
                            j += 1
                        # Insert new summary
                        new_lines.append(chapter_summary)
                        new_lines.append("")
                        skip = True
                        continue

                    if skip and line.startswith("## 第"):
                        skip = False

                    if not skip:
                        new_lines.append(line)

                content = "\n".join(new_lines)
            else:
                # Append new summary
                content += f"{chapter_header}\n\n{chapter_summary}\n\n"

            # Write back
            with open(summaries_path, 'w', encoding='utf-8') as f:
                f.write(content)

            logger.info(f"Full summaries updated: {summaries_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to update full summaries: {e}")
            return False

    async def update_recent_chapter(
        self,
        book_id: str,
        path_manager,
        chapter_num: int,
        full_chapter_text: str
    ) -> bool:
        """
        更新 recent_chapters 目录中的章节文本。

        Args:
            book_id: Book ID
            path_manager: BookPathManager instance
            chapter_num: Chapter number
            full_chapter_text: Complete chapter text

        Returns:
            True if successful
        """
        logger.info(f"Updating recent chapter {chapter_num}...")

        chapter_path = path_manager.get_recent_chapter_path(book_id, chapter_num)

        try:
            # Create parent directory if needed
            chapter_path.parent.mkdir(parents=True, exist_ok=True)

            # Write chapter text
            with open(chapter_path, 'w', encoding='utf-8') as f:
                f.write(full_chapter_text)

            logger.info(f"Recent chapter updated: {chapter_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to update recent chapter: {e}")
            return False

    def _load_prompt_template(self, template_type: str) -> Dict[str, str]:
        """
        加载提示模板。

        Args:
            template_type: "scene_summary" or "chapter_summary"

        Returns:
            Dict with "system" and "user" prompts
        """
        base_dir = Path(__file__).parent.parent.parent / "prompts"

        if template_type == "scene_summary":
            template_file = base_dir / "summary_scene.j2"
        elif template_type == "chapter_summary":
            template_file = base_dir / "summary_chapter.j2"
        else:
            raise ValueError(f"Invalid template type: {template_type}")

        if template_file.exists():
            with open(template_file, 'r', encoding='utf-8') as f:
                content = f.read()

            if "=== SYSTEM ===" in content and "=== USER ===" in content:
                parts = content.split("=== USER ===")
                system = parts[0].replace("=== SYSTEM ===", "").strip()
                user = parts[1].strip()
                return {"system": system, "user": user}

        # Fallback to default prompts
        return self._get_default_prompt(template_type)

    def _get_default_prompt(self, template_type: str) -> Dict[str, str]:
        """获取默认提示。"""

        if template_type == "scene_summary":
            system_prompt = """你是一个专业的小说摘要助手。

任务：为单个场景生成简洁摘要。

要求：
1. summary: 一句话概括场景核心内容（什么人、做了什么、结果如何）
2. key_events: 提取2-3个关键事件（按时间顺序）
3. characters_present: 列出场景中的所有角色

输出格式（JSON）：
{
  "scene_number": 1,
  "summary": "林辰在密室冲击化神期时，被徒弟叶流云偷袭，问心剑贯穿胸膛后得知五十年师徒情谊皆是骗局。",
  "key_events": [
    "林辰闭关冲击化神",
    "叶流云端茶下毒并偷袭",
    "林辰得知真相后燃烧神魂"
  ],
  "characters_present": ["林辰", "叶流云"]
}"""

            user_prompt = """请为以下场景生成摘要：

【场景 {scene_number}】{scene_title}

{scene_text}

请生成简洁的一句话摘要，并列出关键事件和出场角色。"""

        else:  # chapter_summary
            system_prompt = """你是一个专业的小说摘要助手。

任务：为整章生成综合摘要。

要求：
1. summary: 一段话概括整章内容（包含起因、经过、转折、结果）
2. scene_summaries: 列出所有场景的摘要
3. word_count: 统计总字数

输出格式（JSON）：
{
  "chapter_number": 1,
  "summary": "本章讲述林辰在突破化神期关键时刻被徒弟叶流云背叛，问心剑贯穿胸膛，元婴炸裂。叶流云揭露五十年师徒情谊皆是夺取青云宗气运的骗局，并提及苏清雪。林辰在濒死之际燃烧神魂发动禁术，意识坠入黑暗，随后重生到五十年前。",
  "scene_summaries": [
    "场景1: 林辰闭关冲击化神",
    "场景2: 叶流云背叛并揭露真相",
    "场景3: 林辰濒死反击后重生"
  ],
  "word_count": 2800
}"""

            user_prompt = """请为以下章节生成综合摘要：

【第 {chapter_num} 章】{chapter_title}

章节概述：{chapter_outline}

场景摘要列表：
{scene_summaries_text}

总字数：{word_count}

请生成一段综合摘要，概括整章内容。"""

        return {"system": system_prompt, "user": user_prompt}
