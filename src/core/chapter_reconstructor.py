"""
Chapter Reconstructor for AutoNovel-Studio v2.1.
Handles selective scene/chapter reconstruction with cascade invalidation.

核心功能：
- 允许用户选择重构特定场景或章节
- 自动执行级联失效检测
- 自动重建摘要
- 更新书籍状态
- 提供差异对比
"""
import logging
import json
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from datetime import datetime
from difflib import unified_diff
from pydantic import BaseModel, Field

from .cascade_invalidation import SceneDependencyTracker
from ..agents.summary_rebuilder import SummaryRebuilder
from ..core.models import SceneStatus, SceneInfo
from ..core.state_manager import StateManager

logger = logging.getLogger(__name__)


class ReconstructionResult(BaseModel):
    """重构结果。"""
    success: bool = Field(..., description="是否成功")
    scene_chapter: Tuple[int, int] = Field(..., description="(chapter_num, scene_num)")
    old_version: int = Field(..., description="旧版本号")
    new_version: int = Field(..., description="新版本号")
    has_cascade_invalidation: bool = Field(..., description="是否有级联失效")
    outdated_scenes: List[Tuple[int, int]] = Field(
        default_factory=list,
        description="失效的场景列表"
    )
    diff_summary: List[str] = Field(
        default_factory=list,
        description="差异摘要"
    )


from pydantic import BaseModel, Field


class ChapterReconstructor:
    """
    章节重构器

    提供完整的场景/章节重构功能，包括级联失效检测和摘要重建。
    """

    def __init__(
        self,
        path_manager,
        state_manager: StateManager,
        author: AuthorAgent,
        summary_rebuilder: SummaryRebuilder,
        dependency_tracker: SceneDependencyTracker,
        llm_client
    ):
        """
        Initialize ChapterReconstructor.

        Args:
            path_manager: BookPathManager instance
            state_manager: StateManager instance
            author: AuthorAgent instance
            summary_rebuilder: SummaryRebuilder instance
            dependency_tracker: SceneDependencyTracker instance
            llm_client: LLM client for generation
        """
        self.path_manager = path_manager
        self.state_manager = state_manager
        self.author = author
        self.summary_rebuilder = summary_rebuilder
        self.dependency_tracker = dependency_tracker
        self.llm_client = llm_client

    async def reconstruct_scene(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        reconstruction_reason: str,
        book_meta: Dict[str, Any],
        volume_outline: str,
        chapter_outline: Dict[str, Any],
        scene_outline: Dict[str, Any],
        characters_info: str,
        world_lore: str,
        recent_summaries: str
    ) -> ReconstructionResult:
        """
        重构单个场景。

        Args:
            book_id: Book ID
            chapter_num: Chapter number
            scene_num: Scene number
            reconstruction_reason: 重构原因（用于提示Author）
            book_meta: Book metadata
            volume_outline: Volume outline
            chapter_outline: Chapter outline
            scene_outline: Scene outline
            characters_info: Character info JSON
            world_lore: World lore JSON
            recent_summaries: Recent chapter summaries

        Returns:
            ReconstructionResult object
        """
        logger.info(f"=== Reconstructing scene ch{chapter_num}_scene{scene_num} ===")

        # Load current scene version
        book_state = await self.state_manager.load_state(
            self.path_manager.get_book_state_path(book_id)
        )

        if book_state is None:
            raise ValueError(f"Book state not found: {book_id}")

        scene_key = f"ch{chapter_num:02d}_scene{scene_num:02d}"
        old_version = book_state.scene_versions.get(scene_key, 0)

        if old_version == 0:
            raise ValueError(f"Scene not found: ch{chapter_num}_scene{scene_num}")

        # Load old scene text
        old_scene_text = await self.dependency_tracker.load_scene(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=old_version
        )

        if old_scene_text is None:
            raise ValueError(f"Old scene not found: ch{chapter_num}_scene{scene_num}_v{old_version}")

        # Step 1: Generate new scene
        logger.info("Step 1: Generating new scene...")
        scene_target = self._format_scene_target(scene_outline)

        output = await self.author.generate_scene(
            book_meta=book_meta,
            volume_outline=volume_outline,
            recent_summaries=recent_summaries,
            chapter_outline=chapter_outline,
            scene_target=f"{scene_target}\n\n## 重构原因\n{reconstruction_reason}",
            word_count=scene_outline.get("word_count_target", 800),
            is_rewrite=True
        )
        
        # Backward compatibility for str vs v3 IcebergDraftOutput
        if hasattr(output, "get_final_prose_only"):
            new_scene_text = output.get_final_prose_only()
        else:
            new_scene_text = output

        # Step 2: Cascade invalidation check
        logger.info("Step 2: Checking cascade invalidation...")
        invalidation_result = await self.dependency_tracker.rebuild_scene(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            old_version=old_version,
            new_scene_text=new_scene_text,
            book_meta=book_meta
        )

        # Step 3: Save new scene
        logger.info("Step 3: Saving new scene...")
        new_version = old_version + 1
        scene_path = self.path_manager.get_scene_draft_path(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=new_version
        )

        scene_path.parent.mkdir(parents=True, exist_ok=True)
        with open(scene_path, 'w', encoding='utf-8') as f:
            f.write(new_scene_text)

        # Also update the "current" version (without version suffix)
        current_scene_path = self.path_manager.get_latest_scene_draft_path(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=new_version
        )
        with open(current_scene_path, 'w', encoding='utf-8') as f:
            f.write(new_scene_text)

        # Step 4: Update state
        logger.info("Step 4: Updating book state...")
        await self.state_manager.update_scene_version(
            state_path=self.path_manager.get_book_state_path(book_id),
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=new_version
        )

        # Step 5: Rebuild scene summary
        logger.info("Step 5: Rebuilding scene summary...")
        await self.summary_rebuilder.rebuild_scene_summary(
            scene_text=new_scene_text,
            scene_number=scene_num,
            scene_outline=scene_outline,
            book_meta=book_meta
        )

        # Step 6: Generate text diff
        diff_summary = self._generate_text_diff(
            old_scene_text,
            new_scene_text,
            f"ch{chapter_num}_scene{scene_num}"
        )

        # Combine invalidation diff with text diff
        all_diffs = invalidation_result.get("diff_summary", []) + diff_summary

        result = ReconstructionResult(
            success=True,
            scene_chapter=(chapter_num, scene_num),
            old_version=old_version,
            new_version=new_version,
            has_cascade_invalidation=invalidation_result.get("invalid", False),
            outdated_scenes=invalidation_result.get("outdated_scenes", []),
            diff_summary=all_diffs
        )

        logger.info(f"=== Scene reconstruction completed: v{old_version} -> v{new_version} ===")
        return result

    async def reconstruct_chapter(
        self,
        book_id: str,
        chapter_num: int,
        reconstruction_reason: str,
        book_meta: Dict[str, Any],
        volume_outline: str,
        chapter_outline: Dict[str, Any],
        scene_outlines: List[Dict[str, Any]],
        characters_info: str,
        world_lore: str,
        recent_summaries: str
    ) -> List[ReconstructionResult]:
        """
        重构整章（按场景顺序重构）。

        Args:
            book_id: Book ID
            chapter_num: Chapter number
            reconstruction_reason: 重构原因
            book_meta: Book metadata
            volume_outline: Volume outline
            chapter_outline: Chapter outline
            scene_outlines: List of scene outlines
            characters_info: Character info JSON
            world_lore: World lore JSON
            recent_summaries: Recent chapter summaries

        Returns:
            List of ReconstructionResult objects
        """
        logger.info(f"=== Reconstructing chapter {chapter_num} ===")

        results = []

        for i, scene_outline in enumerate(scene_outlines, start=1):
            logger.info(f"Reconstructing scene {i}/{len(scene_outlines)}...")

            result = await self.reconstruct_scene(
                book_id=book_id,
                chapter_num=chapter_num,
                scene_num=i,
                reconstruction_reason=reconstruction_reason,
                book_meta=book_meta,
                volume_outline=volume_outline,
                chapter_outline=chapter_outline,
                scene_outline=scene_outline,
                characters_info=characters_info,
                world_lore=world_lore,
                recent_summaries=recent_summaries
            )

            results.append(result)

        # Rebuild chapter summary
        logger.info("Rebuilding chapter summary...")
        await self._rebuild_chapter_summary_after_reconstruction(
            book_id=book_id,
            chapter_num=chapter_num,
            results=results,
            chapter_outline=chapter_outline,
            book_meta=book_meta
        )

        logger.info(f"=== Chapter reconstruction completed: {len(results)} scenes ===")
        return results

    async def _rebuild_chapter_summary_after_reconstruction(
        self,
        book_id: str,
        chapter_num: int,
        results: List[ReconstructionResult],
        chapter_outline: Dict[str, Any],
        book_meta: Dict[str, Any]
    ) -> None:
        """
        重构后重建章节摘要。

        Args:
            book_id: Book ID
            chapter_num: Chapter number
            results: Reconstruction results
            chapter_outline: Chapter outline
            book_meta: Book metadata
        """
        # Load all scene texts
        scene_texts = []
        for result in results:
            scene_path = self.path_manager.get_scene_draft_path(
                book_id=book_id,
                chapter_num=result.scene_chapter[0],
                scene_num=result.scene_chapter[1],
                version=result.new_version
            )

            with open(scene_path, 'r', encoding='utf-8') as f:
                scene_texts.append(f.read())

        # Generate scene summaries
        from ..agents.summary_rebuilder import SceneSummary
        scene_summaries = []
        for i, scene_text in enumerate(scene_texts, start=1):
            summary = await self.summary_rebuilder.rebuild_scene_summary(
                scene_text=scene_text,
                scene_number=i,
                book_meta=book_meta
            )
            if summary:
                scene_summaries.append(summary)

        # Generate chapter summary
        chapter_summary = await self.summary_rebuilder.rebuild_chapter_summary(
            chapter_num=chapter_num,
            scene_texts=scene_texts,
            scene_summaries=scene_summaries,
            chapter_outline=chapter_outline,
            book_meta=book_meta
        )

        if chapter_summary:
            # Update full_summaries.md
            await self.summary_rebuilder.update_full_summaries(
                book_id=book_id,
                path_manager=self.path_manager,
                chapter_num=chapter_num,
                chapter_summary=chapter_summary.summary
            )

            # Update recent_chapters
            full_chapter_text = "\n\n".join(scene_texts)
            await self.summary_rebuilder.update_recent_chapter(
                book_id=book_id,
                path_manager=self.path_manager,
                chapter_num=chapter_num,
                full_chapter_text=full_chapter_text
            )

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

    def _generate_text_diff(
        self,
        old_text: str,
        new_text: str,
        filename: str
    ) -> List[str]:
        """
        生成文本差异。

        Args:
            old_text: Old text
            new_text: New text
            filename: File name for diff header

        Returns:
            List of diff lines
        """
        diff_lines = list(unified_diff(
            old_text.splitlines(keepends=True),
            new_text.splitlines(keepends=True),
            fromfile=f"{filename}_old",
            tofile=f"{filename}_new",
            lineterm=""
        ))

        # Limit to first 50 lines
        if len(diff_lines) > 50:
            diff_lines = diff_lines[:50] + [f"... ({len(diff_lines) - 50} more lines)"]

        return diff_lines

    def save_reconstruction_report(
        self,
        book_id: str,
        results: List[ReconstructionResult],
        reconstruction_reason: str
    ) -> Path:
        """
        保存重构报告。

        Args:
            book_id: Book ID
            results: Reconstruction results
            reconstruction_reason: Reconstruction reason

        Returns:
            Path to report file
        """
        report_dir = self.path_manager.get_book_dir(book_id) / ".reconstruction_reports"
        report_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = report_dir / f"reconstruction_{timestamp}.json"

        report = {
            "timestamp": datetime.now().isoformat(),
            "reason": reconstruction_reason,
            "results": [r.model_dump() for r in results]
        }

        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        logger.info(f"Reconstruction report saved: {report_path}")
        return report_path
