"""
Iceberg Engine for AutoNovel-Studio v3.0.

核心功能：潜台词渲染 - 强制 CoT（内心戏 → 实际台词）
"""
import logging
import re
from typing import Dict, Any, List, Optional
from pathlib import Path

from ..core.models import (
    InternalScript,
    InternalScriptLine,
    IcebergDraftOutput,
    SceneOutlineV3,
    CharacterMemory
)
from ..core.llm_client import BaseLLMClient
from ..utils.prompt_utils import get_prompt_manager
from ..utils.example_library import get_example_library

logger = logging.getLogger(__name__)


class FinalProseExtractor:
    """
    Final Prose 提取器

    从 Author Agent 的输出中提取 <Final_Prose> 标签内容。
    """

    FINAL_PROSE_PATTERN = re.compile(
        r'<Final_Prose>(.*?)</Final_Prose>',
        re.DOTALL | re.MULTILINE
    )

    INTERNAL_SCRIPT_PATTERN = re.compile(
        r'<Internal_Script>(.*?)</Internal_Script>',
        re.DOTALL | re.MULTILINE
    )

    @classmethod
    def extract(cls, raw_output: str) -> Optional[str]:
        """
        从原始输出中提取 Final Prose。

        Args:
            raw_output: Author Agent 的原始输出

        Returns:
            Final Prose 文本，如果未找到则返回 None
        """
        match = cls.FINAL_PROSE_PATTERN.search(raw_output)
        if match:
            prose = match.group(1).strip()
            logger.debug(f"Extracted Final Prose: {len(prose)} chars")
            return prose
        else:
            logger.warning("No <Final_Prose> tags found in output")
            return None

    @classmethod
    def extract_internal_script(cls, raw_output: str) -> Optional[str]:
        """
        提取 Internal Script（用于调试）。

        Args:
            raw_output: 原始输出

        Returns:
            Internal Script 文本
        """
        match = cls.INTERNAL_SCRIPT_PATTERN.search(raw_output)
        if match:
            return match.group(1).strip()
        return None


class IcebergAuthor:
    """
    冰山作者（Iceberg Author）

    使用冰山理论生成高质量潜台词对白。
    """

    def __init__(self, llm_client: BaseLLMClient, use_examples: bool = False):
        """
        Initialize Iceberg Author.

        Args:
            llm_client: LLM client
            use_examples: Whether to use few-shot examples from library
        """
        self.llm_client = llm_client
        self.extractor = FinalProseExtractor
        self.use_examples = use_examples
        self.example_library = get_example_library() if use_examples else None
        logger.info(f"Initialized IcebergAuthor with examples: {use_examples}")

    async def generate_scene_with_subtext(
        self,
        scene_outline: SceneOutlineV3,
        character_memories: Dict[str, CharacterMemory],
        book_context: Dict[str, Any],
        world_lore: Dict[str, Any],
        recent_summaries: str,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> IcebergDraftOutput:
        """
        生成带有潜台词的场景（使用冰山引擎）。

        Args:
            scene_outline: 场景细纲（v3.0，含信息差配置）
            character_memories: 角色记忆库（含信息差）
            book_context: 书籍上下文
            world_lore: 世界观设定
            recent_summaries: 最近章节摘要

        Returns:
            IcebergDraftOutput with internal_script and final_prose
        """
        logger.info(f"Iceberg Author: Generating scene {scene_outline.scene_number}")

        # 构建冰山提示
        prompt = self._build_iceberg_prompt(
            scene_outline=scene_outline,
            character_memories=character_memories,
            book_context=book_context,
            world_lore=world_lore,
            recent_summaries=recent_summaries,
            book_meta=book_meta
        )

        # 调用 LLM 生成
        raw_output = await self._call_llm_for_iceberg_output(prompt)

        # 提取 Internal Script 和 Final Prose
        internal_script_text = self.extractor.extract_internal_script(raw_output)
        final_prose_text = self.extractor.extract(raw_output)

        if internal_script_text and final_prose_text:
            # 解析 Internal Script
            internal_script = self._parse_internal_script(internal_script_text)

            # 构建输出
            output = IcebergDraftOutput(
                internal_script=internal_script,
                final_prose=final_prose_text
            )

            logger.info(f"Generated scene with subtext: {len(final_prose_text)} chars")
            return output
        else:
            logger.error("Failed to extract proper iceberg output")
            raise ValueError("Invalid iceberg output format")

    def _build_iceberg_prompt(
        self,
        scene_outline: SceneOutlineV3,
        character_memories: Dict[str, CharacterMemory],
        book_context: Dict[str, Any],
        world_lore: Dict[str, Any],
        recent_summaries: str,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        构建冰山提示（使用 Jinja2 模板渲染）。

        Args:
            scene_outline: 场景细纲
            character_memories: 角色记忆库
            book_context: 书籍上下文
            world_lore: 世界观设定
            recent_summaries: 最近摘要
            book_meta: 书籍元数据（用于匹配范文）

        Returns:
            渲染后的完整 prompt
        """
        # 获取 Jinja2 环境
        prompt_manager = get_prompt_manager()
        template = prompt_manager.get_template("author_iceberg_v3.j2")

        # 提取场景角色信息
        scene_characters = []
        for char_id, motive in scene_outline.character_motives.items():
            char_memory = character_memories.get(char_id)
            if char_memory:
                scene_characters.append({
                    "name": char_memory.name,
                    "public_status": char_memory.public_status,
                    "hidden_motive": char_memory.hidden_motive
                })

        # 格式化场景大纲为文本
        scene_outline_text = self._format_scene_outline(scene_outline)

        # 获取范文样本（如果启用）
        example_samples = None
        if self.use_examples and self.example_library and book_meta:
            example_samples = self._get_example_samples(book_meta)

        # 渲染模板
        prompt = template.render(
            book_tone=book_context.get('tone', ''),
            current_scene_characters=scene_characters,
            scene_outline_text=scene_outline_text,
            subtext_guidance=scene_outline.subtext_guidance,
            word_count_target=scene_outline.word_count_target,
            example_samples=example_samples
        )

        return prompt

    def _format_scene_outline(self, scene_outline: SceneOutlineV3) -> str:
        """格式化场景大纲。"""
        parts = [
            f"## 场景 {scene_outline.scene_number}: {scene_outline.title}",
            "",
            "### 情节要点："
        ]

        for i, point in enumerate(scene_outline.plot_points, 1):
            parts.append(f"{i}. {point}")

        if scene_outline.logic_chain:
            parts.append(f"\n### 因果逻辑链：\n{scene_outline.logic_chain}")

        if scene_outline.emotional_arc:
            parts.append(f"\n### 情绪弧线：\n{scene_outline.emotional_arc}")

        if scene_outline.focus_point:
            parts.append(f"\n### 描写要点：\n{scene_outline.focus_point}")

        return "\n".join(parts)

    async def _call_llm_for_iceberg_output(self, prompt: str) -> str:
        """调用 LLM 生成冰山输出。"""
        try:
            response = await self.llm_client.generate_text(
                system_prompt="你是顶级小说大师，擅长使用冰山理论创作潜台词对白。",
                user_prompt=prompt,
                temperature=0.8,
                max_tokens=2000
            )
            return response

        except Exception as e:
            logger.error(f"Failed to call LLM for iceberg output: {e}")
            # 降级到占位符
            return """
<Internal_Script>
分析：双方试探。
角色A（潜台词）：我知道你在隐瞒什么。
角色A（实际台词）：今天天气不错。
</Internal_Script>

<Final_Prose>
（LLM调用失败，使用占位符内容）
"""

    def _parse_internal_script(self, script_text: str) -> InternalScript:
        """解析 Internal Script 文本。"""
        lines = script_text.split("\n")

        # 提取分析
        analysis = ""
        script_lines = []

        current_char = None
        current_subtext = None

        for line in lines:
            line = line.strip()
            if line.startswith("分析："):
                analysis = line.replace("分析：", "").strip()
            elif "（潜台词）" in line:
                parts = line.split("（潜台词）")
                current_char = parts[0].strip()
                current_subtext = parts[1].strip() if len(parts) > 1 else ""
            elif "（实际台词）" in line and current_char:
                parts = line.split("（实际台词）")
                spoken = parts[1].strip() if len(parts) > 1 else ""

                if current_subtext:
                    script_lines.append(InternalScriptLine(
                        character=current_char,
                        subtext=current_subtext,
                        spoken_line=spoken
                    ))

                current_char = None
                current_subtext = None

        return InternalScript(
            analysis=analysis,
            script_lines=script_lines
        )

    def _get_example_samples(self, book_meta: Dict[str, Any]) -> Optional[str]:
        """
        Get example writing samples from library based on book metadata.

        Args:
            book_meta: Novel metadata including genre/sub_genres

        Returns:
            Formatted example samples string, or None if no samples available
        """
        if not self.example_library:
            return None

        # Try to match by sub_genres first (more specific)
        sub_genres = book_meta.get("sub_genres", [])

        # Mapping from sub_genres to library categories (supports both English and Chinese)
        category_mapping = {
            # English mappings
            "dark_revenge": "dark_revenge",
            "revenge": "dark_revenge",
            "comedy": "comedy_funny",
            "funny": "comedy_funny",
            "tsukkomi": "tsukkomi_daily",
            "japanese_light": "japanese_light",
            "light_novel": "japanese_light",
            "hot_blood": "hot_blood",
            "action": "hot_blood",
            "suspense": "suspense",
            "mystery": "suspense",
            "lovecraft": "lovecraft_mystery",
            "political": "political",
            "harem": "harem",
            "heartwarming": "heartwarming",
            "tragedy": "tragedy",
            "urban_power": "urban_power",
            "urban": "urban_power",
            "traditional_xianxia": "traditional_xianxia",
            "xianxia": "traditional_xianxia",
            "fantasy_power": "fantasy_power",
            "fantasy": "fantasy_power",
            "infinite_flow": "infinite_flow",
            "fan_fiction": "fan_fiction",

            # Chinese mappings (中文映射)
            "复仇": "dark_revenge",
            "黑暗": "dark_revenge",
            "搞笑": "comedy_funny",
            "吐槽": "tsukkomi_daily",
            "日轻": "japanese_light",
            "热血": "hot_blood",
            "动作": "hot_blood",
            "悬疑": "suspense",
            "推理": "suspense",
            "诡秘": "lovecraft_mystery",
            "权谋": "political",
            "后宫": "harem",
            "温馨": "heartwarming",
            "悲剧": "tragedy",
            "都市": "urban_power",
            "修真": "traditional_xianxia",
            "仙侠": "traditional_xianxia",
            "玄幻": "fantasy_power",
            "无限": "infinite_flow",
            "同人": "fan_fiction",
            "重生": "dark_revenge"  # 重生通常伴随复仇
        }

        # Try to find matching category
        matched_category = None
        for genre in sub_genres:
            genre_lower = genre.lower().replace(" ", "_").replace("-", "_")
            if genre_lower in category_mapping:
                matched_category = category_mapping[genre_lower]
                break

        # Fallback to main genre if no match
        if not matched_category:
            main_genre = book_meta.get("genre", "").lower().replace(" ", "_").replace("-", "_")
            matched_category = category_mapping.get(main_genre)

        # Get samples from matched category
        if matched_category:
            samples = self.example_library.get_by_category(
                category=matched_category,
                random_choice=True,
                max_count=2  # Get 2 examples for variety
            )

            if samples:
                logger.info(f"Loaded {matched_category} examples for few-shot learning")
                return f"\n\n### 范文分类: {matched_category}\n\n{samples}"

        # If no specific match, try to get any example as fallback
        logger.warning(f"No matching category found for genres: {sub_genres}")
        return None

class IcebergEngine:
    """
    冰山引擎（Iceberg Engine）

    管理潜台词渲染的完整流程。
    """

    def __init__(self, llm_client: BaseLLMClient, use_examples: bool = False):
        """
        Initialize Iceberg Engine.

        Args:
            llm_client: LLM client
            use_examples: Whether to use few-shot examples from library
        """
        self.author = IcebergAuthor(llm_client, use_examples=use_examples)
        self.extractor = FinalProseExtractor
        logger.info(f"Initialized IcebergEngine with examples: {use_examples}")

    async def render_scene(
        self,
        scene_outline: SceneOutlineV3,
        character_memories: Dict[str, CharacterMemory],
        book_context: Dict[str, Any],
        world_lore: Dict[str, Any],
        recent_summaries: str,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        渲染场景（返回纯正文）。

        Args:
            scene_outline: 场景细纲
            character_memories: 角色记忆
            book_context: 书籍上下文
            world_lore: 世界观
            recent_summaries: 最近摘要
            book_meta: 书籍元数据（用于匹配范文）

        Returns:
            Final Prose（纯正文）
        """
        # 生成冰山输出
        output = await self.author.generate_scene_with_subtext(
            scene_outline=scene_outline,
            character_memories=character_memories,
            book_context=book_context,
            world_lore=world_lore,
            recent_summaries=recent_summaries,
            book_meta=book_meta
        )

        # 返回纯正文
        return output.get_final_prose_only()

    async def render_scene_with_debug(
        self,
        scene_outline: SceneOutlineV3,
        character_memories: Dict[str, CharacterMemory],
        book_context: Dict[str, Any],
        world_lore: Dict[str, Any],
        recent_summaries: str,
        book_meta: Optional[Dict[str, Any]] = None
    ) -> IcebergDraftOutput:
        """
        渲染场景（返回完整输出，含 Internal Script）。

        用于调试和展示。
        """
        return await self.author.generate_scene_with_subtext(
            scene_outline=scene_outline,
            character_memories=character_memories,
            book_context=book_context,
            world_lore=world_lore,
            recent_summaries=recent_summaries,
            book_meta=book_meta
        )


__all__ = [
    "FinalProseExtractor",
    "IcebergAuthor",
    "IcebergEngine",
]
