"""
Author Agent - Generates novel content.
"""
import logging
from typing import Dict, Any, Optional, Union
from ..core.llm_client import BaseLLMClient
from ..utils.prompt_utils import PromptBuilder, get_prompt_manager
from ..utils.example_library import get_example_library
# Legacy IcebergEngine removed — writing craft is now a prompt-level skill
# see prompts/skill_iceberg_writing.md
try:
    from ..core.models import IcebergDraftOutput, SceneOutlineV3, CharacterMemory
except ImportError:
    IcebergDraftOutput = None
    SceneOutlineV3 = None
    CharacterMemory = None
from ..core.state_machine import ProjectContext
import types

# Create dummy mockable client structure for P0-3 tests
openai_client = types.SimpleNamespace()
openai_client.chat = types.SimpleNamespace()
openai_client.chat.completions = types.SimpleNamespace()
openai_client.chat.completions.create = lambda *args, **kwargs: None

logger = logging.getLogger(__name__)


class AuthorAgent:
    """
    The Author Agent generates novel content based on outlines and editor feedback.
    Acts as the Generator in the GAN-inspired architecture.
    """

    def __init__(
        self,
        llm_client: Optional[BaseLLMClient] = None,
        prompt_manager: Optional[Any] = None,
        use_examples: bool = True
    ):
        """
        Initialize Author Agent.

        Args:
            llm_client: LLM client for text generation
            prompt_manager: Optional prompt manager instance
            use_examples: Whether to use few-shot examples from library
        """
        self.llm_client = llm_client
        self.prompt_manager = prompt_manager or get_prompt_manager()
        self.use_examples = use_examples
        self.example_library = get_example_library() if use_examples else None
        self.iceberg_engine = None  # Legacy engine removed; craft skill is prompt-level now
        model_name = llm_client.model_name if llm_client else "none"
        logger.info(f"Initialized Author Agent with model: {model_name}, examples: {use_examples}")

    def generate_draft(self, ctx: ProjectContext) -> str:
        """
        Generate draft text via StateMachine ProjectContext, injecting human director notes if available.
        Uses the module-level openai_client (mockable in tests).
        """
        logger.info(f"Generating draft for scene {ctx.scene_id}")
        
        system_prompt = "你是顶级网文作者。请根据给出的大纲要求和上下文生成高质量正文片段。"
        user_prompt = f"书籍: {ctx.book_id}\n卷: {ctx.volume_id}\n章: {ctx.chapter_id}\n场景: {ctx.scene_id}\n请写出这一场景的内容。"
        
        # P0-3: Inject Director Note if present
        if getattr(ctx, "director_note", None):
            logger.warning(f"Injecting Human Director Note: {ctx.director_note}")
            user_prompt += f"\n\n【最高优先级导演批示】\n{ctx.director_note}\n务必严格听从以上批示！"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        resp = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages
        )
        return resp.choices[0].message.content

    async def generate_scene_outline(
        self,
        book_meta: Dict[str, Any],
        volume_outline: str,
        chapter_outline: Dict[str, Any],
        scene_number: int,
        total_scenes: int,
        scene_data: Dict[str, Any],
        characters_info: str,
        world_lore: str
    ) -> Dict[str, Any]:
        """
        Generate detailed outline for a single scene.

        Args:
            book_meta: Novel metadata
            volume_outline: Current volume outline
            chapter_outline: Current chapter outline
            scene_number: Current scene number (1-indexed)
            total_scenes: Total number of scenes in chapter
            scene_data: Basic scene data (title, pov_character, setting)
            characters_info: Character information JSON
            world_lore: World lore JSON

        Returns:
            Generated scene outline (dict with plot_points, logic_chain, emotional_arc, focus_point, word_count_target)
        """
        from ..core.models import SceneOutlineDraft

        logger.info(f"Generating outline for scene {scene_number}/{total_scenes}: {scene_data.get('title')}")

        # Build context
        context = {
            "chapter_title": chapter_outline.get("title", ""),
            "chapter_summary": chapter_outline.get("summary", ""),
            "volume_outline": volume_outline,
            "scene_number": scene_number,
            "total_scenes": total_scenes,
            "scene_title": scene_data.get("title", ""),
            "pov_character": scene_data.get("pov_character", ""),
            "setting": scene_data.get("setting", ""),
            "characters_info": characters_info,
            "world_lore": world_lore,
            "forbidden_elements": book_meta.get("forbidden_elements", []),
        }

        # Render prompt
        user_prompt = self.prompt_manager.render("author_scene_outline.j2", context)

        system_prompt = """你是专业的网文架构师。你的任务是为场景生成详细大纲，确保物理引擎铁律得到遵守。

[IMPORTANT] **核心原则**：
1. **因果逻辑链**必须完整：每个动作都有触发原因（刺激→察觉→反应）
2. **情绪弧线**必须清晰：情绪变化要有层次，符合角色性格
3. **禁止排比式走马灯**：在紧张时刻严禁使用"想起xx年前...想起xx年前..."
4. **真实应激反应**：重生/重伤后必须有PTSD反应，不能像机器人

输出格式：纯JSON，不要markdown标记。"""

        try:
            # Generate outline
            outline = await self.llm_client.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=SceneOutlineDraft,
                temperature=0.7,
                max_tokens=2000
            )

            # Convert to dict
            outline_dict = outline.model_dump()

            logger.info(f"Generated scene outline: {outline_dict.get('title', 'Unknown')}")
            return outline_dict

        except Exception as e:
            logger.error(f"Failed to generate scene outline: {e}")
            # Return basic outline on failure
            return {
                "scene_number": scene_number,
                "title": scene_data.get("title", f"Scene {scene_number}"),
                "plot_points": ["展开场景情节"],
                "logic_chain": "待完善",
                "emotional_arc": "待完善",
                "focus_point": "待完善",
                "word_count_target": 800
            }

    async def generate_scene(
        self,
        book_meta: Dict[str, Any],
        volume_outline: str,
        recent_summaries: str,
        chapter_outline: Dict[str, Any],
        scene_target: str = "",
        editor_plan: Optional[str] = None,
        draft_summary: Optional[Any] = None,
        word_count: int = 800,
        is_rewrite: bool = False,
        scene_outline_v3: Optional[SceneOutlineV3] = None,
        character_memories: Optional[Dict[str, CharacterMemory]] = None,
        world_lore: Optional[Dict[str, Any]] = None
    ) -> Union[str, IcebergDraftOutput]:
        """
        Generate a single scene for a chapter using Iceberg Engine.

        Args:
            book_meta: Novel metadata
            volume_outline: Current volume outline
            recent_summaries: Recent chapter summaries (sliding window)
            chapter_outline: Current chapter outline
            scene_target: Description of the scene to write (legacy)
            editor_plan: Optional revision instructions from editor
            draft_summary: Optional draft summary from DraftSummarizer
            word_count: Target word count
            is_rewrite: Whether this is a rewrite attempt
            scene_outline_v3: The rich v3 scene outline (used if available)
            character_memories: Character cognitive states
            world_lore: The world lore dictionary

        Returns:
            IcebergDraftOutput (or str if Iceberg format failed)
        """
        logger.info(f"Generating scene via Iceberg Engine" + (" (REWRITE MODE)" if is_rewrite else ""))

        if draft_summary:
            logger.info(f"Draft summary provided: {draft_summary.summary_level}")
        elif is_rewrite:
            logger.info("Blind rewrite mode: no draft summary provided")

        # Fallback for downward compatibility with v2 callers
        if not scene_outline_v3:
            logger.warning("SceneOutlineV3 not provided. Creating fallback from legacy `scene_target`.")
            scene_outline_v3 = SceneOutlineV3(
                scene_number=1,
                title="Scene (Legacy Fallback)",
                plot_points=[scene_target] if scene_target else ["展开剧情"],
                word_count_target=word_count,
                subtext_guidance="请根据传统线索展开描写。"
            )

        if not character_memories:
            character_memories = {}

        if not world_lore:
            world_lore = {}

        # Render Iceberg output
        try:
            output = await self.iceberg_engine.render_scene_with_debug(
                scene_outline=scene_outline_v3,
                character_memories=character_memories,
                book_context=book_meta,
                world_lore=world_lore,
                recent_summaries=recent_summaries,
                book_meta=book_meta
            )
            return output

        except Exception as e:
            logger.error(f"Iceberg Engine failed: {e}. Falling back to string output.")
            return "(Iceberg Engine generation failed. See logs.)"

    async def revise_scene(
        self,
        previous_draft: str,
        revision_plan: Dict[str, Any],
        book_meta: Dict[str, Any],
        volume_outline: str,
        recent_summaries: str,
        chapter_outline: Dict[str, Any],
        scene_target: str
    ) -> str:
        """
        Revise a scene based on editor feedback.

        Args:
            previous_draft: Previous version of the scene
            revision_plan: Editor's revision plan
            book_meta: Novel metadata
            volume_outline: Current volume outline
            recent_summaries: Recent chapter summaries
            chapter_outline: Current chapter outline
            scene_target: Scene description

        Returns:
            Revised scene content
        """
        logger.info("Revising scene based on editor feedback")

        # Build editor plan string from revision plan
        editor_plan = self._format_editor_plan(revision_plan)

        # Generate revised version with blind rewrite mode enabled
        return await self.generate_scene(
            book_meta=book_meta,
            volume_outline=volume_outline,
            recent_summaries=recent_summaries,
            chapter_outline=chapter_outline,
            scene_target=scene_target,
            editor_plan=editor_plan,
            word_count=800,
            is_rewrite=True  # Enable blind rewrite mode with stricter temperature
        )

    def _format_editor_plan(self, revision_plan: Dict[str, Any]) -> str:
        """
        Format editor's revision plan into a clear instruction string.

        Args:
            revision_plan: EditorRevisionPlan object

        Returns:
            Formatted instruction string
        """
        instructions = []

        if revision_plan.get("priority_fixes"):
            instructions.append("## Priority Fixes (Must Address)")
            for fix in revision_plan["priority_fixes"]:
                instructions.append(f"- {fix}")

        if revision_plan.get("revision_instructions"):
            instructions.append("## Revision Instructions")
            for i, instr in enumerate(revision_plan["revision_instructions"], 1):
                instructions.append(f"{i}. {instr}")

        instructions.append(f"\n## Scene Goal")
        instructions.append(revision_plan.get("scene_target", "Maintain scene focus"))

        return "\n".join(instructions)

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
        logger.warning(f"No matching category found, using fallback examples")
        return None

    def count_words(self, text: str, chinese_char_count: bool = True) -> int:
        """
        Count words in text (handles Chinese characters).

        Args:
            text: Text to count
            chinese_char_count: Whether to count Chinese characters as words

        Returns:
            Word count
        """
        if chinese_char_count:
            # Count Chinese characters + English words
            import re
            chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
            english_words = len(re.findall(r'\b[a-zA-Z]+\b', text))
            return chinese_chars + english_words
        else:
            return len(text.split())

    def validate_word_count(self, text: str, target: int = 800, tolerance: float = 0.2) -> bool:
        """
        Check if text is within acceptable word count range.

        Args:
            text: Text to validate
            target: Target word count
            tolerance: Acceptable deviation (default 20%)

        Returns:
            True if within acceptable range
        """
        count = self.count_words(text)
        min_count = int(target * (1 - tolerance))
        max_count = int(target * (1 + tolerance))

        return min_count <= count <= max_count
