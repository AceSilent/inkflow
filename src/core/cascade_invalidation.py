"""
Cascade Invalidation System for AutoNovel-Studio v2.1.
Detects when scene reconstructions invalidate downstream scenes.

核心问题：
- 如果场景1中主角杀死了反派，但重构后变成了放走反派
- 那么所有依赖反派死亡的后续场景（场景2-N）全部失效

解决方案：
1. 提取旧场景的关键事件（key_events）
2. 提取新场景的关键事件（key_events）
3. 比较两者是否一致
4. 如果不一致，标记所有下游场景为 OUTDATED
"""
import logging
import json
import re
from typing import Dict, Any, List, Set, Tuple, Optional
from pathlib import Path
from datetime import datetime

from .models import SceneStatus, SceneInfo

logger = logging.getLogger(__name__)


class KeyEventExtractor:
    """
    关键事件提取器

    从场景文本中提取关键事件，用于比较场景重构前后的差异。
    """

    # 动作词正则（中文动作动词）
    ACTION_VERBS = [
        "杀", "死", "放走", "释放", "击败", "战胜", "摧毁", "破坏",
        "救", "救下", "俘获", "抓住", "逃跑", "逃脱", "失踪", "消失",
        "发现", "找到", "获得", "失去", "夺取", "抢夺", "交出", "给予",
        "背叛", "揭露", "透露", "坦白", "承认", "否认", "隐瞒",
        "突破", "晋级", "提升", "下降", "封印", "解开", "觉醒"
    ]

    # 实体类型（人物、物品、地点）
    ENTITY_PATTERNS = [
        r"[林叶苏][\u4e00-\u9fa5]{1,3}",  # 人物：林辰、叶流云、苏清雪
        r"[\u4e00-\u9fa5]{2,4}[剑诀丹药]",  # 物品：问心剑、绝灵散
        r"[\u4e00-\u9fa5]{2,6}[室殿洞山]",  # 地点：密室、青云殿
    ]

    def __init__(self):
        """Initialize KeyEventExtractor."""
        self.action_pattern = self._build_action_pattern()

    def _build_action_pattern(self) -> re.Pattern:
        """Build regex pattern for action verbs."""
        # 匹配：主语 + 动作词 + 宾语
        # 例如：林辰（主语）+ 击败（动词）+ 叶流云（宾语）
        pattern = r"([^\s，。]{1,10})(" + "|".join(self.ACTION_VERBS) + r")([^\s，。]{1,10})"
        return re.compile(pattern)

    def extract_key_events(self, scene_text: str) -> List[Dict[str, Any]]:
        """
        从场景文本中提取关键事件。

        Args:
            scene_text: 场景文本

        Returns:
            List of key events with: subject, action, object, quote
        """
        key_events = []

        # 按段落分割
        paragraphs = scene_text.split("\n\n")

        for para in paragraphs:
            if not para.strip():
                continue

            # 查找动作句
            matches = self.action_pattern.findall(para)
            for subject, action, obj in matches:
                key_events.append({
                    "subject": subject,
                    "action": action,
                    "object": obj,
                    "quote": para.strip()[:50] + "..." if len(para) > 50 else para.strip()
                })

        logger.debug(f"Extracted {len(key_events)} key events from scene")
        return key_events

    def extract_entities(self, scene_text: str) -> Set[str]:
        """
        从场景文本中提取实体（人物、物品、地点）。

        Args:
            scene_text: 场景文本

        Returns:
            Set of entity names
        """
        entities = set()

        for pattern in self.ENTITY_PATTERNS:
            matches = re.findall(pattern, scene_text)
            entities.update(matches)

        logger.debug(f"Extracted {len(entities)} entities from scene")
        return entities

    def events_to_dict(self, events: List[Dict[str, Any]]) -> Dict[str, str]:
        """
        将事件列表转换为字典，便于比较。

        Args:
            events: List of event dicts

        Returns:
            Dict with key "subject_action_object" → value "quote"
        """
        event_dict = {}
        for event in events:
            key = f"{event['subject']}_{event['action']}_{event['object']}"
            event_dict[key] = event.get("quote", "")
        return event_dict


class SceneDependencyGraph:
    """
    场景依赖关系图

    维护场景之间的依赖关系，用于级联失效检测。
    """

    def __init__(self):
        """Initialize SceneDependencyGraph."""
        # 图结构：{(chapter, scene): set of (dependent_chapter, dependent_scene)}
        self.dependency_graph: Dict[Tuple[int, int], Set[Tuple[int, int]]] = {}
        # 反向图：{(dependent_chapter, dependent_scene): set of (chapter, scene)}
        self.reverse_graph: Dict[Tuple[int, int], Set[Tuple[int, int]]] = {}

    def add_dependency(
        self,
        upstream: Tuple[int, int],
        downstream: Tuple[int, int]
    ) -> None:
        """
        添加依赖关系：downstream 依赖 upstream。

        Args:
            upstream: (chapter_num, scene_num) 上游场景
            downstream: (chapter_num, scene_num) 下游场景
        """
        # 添加正向依赖
        if upstream not in self.dependency_graph:
            self.dependency_graph[upstream] = set()
        self.dependency_graph[upstream].add(downstream)

        # 添加反向依赖
        if downstream not in self.reverse_graph:
            self.reverse_graph[downstream] = set()
        self.reverse_graph[downstream].add(upstream)

        logger.debug(f"Added dependency: {upstream} -> {downstream}")

    def get_downstream_scenes(
        self,
        scene: Tuple[int, int],
        max_depth: int = 100
    ) -> List[Tuple[int, int]]:
        """
        获取场景的所有下游场景（递归）。

        Args:
            scene: (chapter_num, scene_num) 起始场景
            max_depth: 最大递归深度

        Returns:
            List of downstream (chapter, scene) tuples
        """
        downstream_scenes = []
        visited = set()

        def _dfs(current: Tuple[int, int], depth: int) -> None:
            if depth > max_depth or current in visited:
                return

            visited.add(current)

            if current in self.dependency_graph:
                for downstream in self.dependency_graph[current]:
                    if downstream not in visited:
                        downstream_scenes.append(downstream)
                        _dfs(downstream, depth + 1)

        _dfs(scene, 0)
        return downstream_scenes

    def build_linear_dependency(
        self,
        chapter_num: int,
        scene_count: int
    ) -> None:
        """
        构建线性依赖关系（场景1 → 场景2 → 场景3...）。

        Args:
            chapter_num: 章节号
            scene_count: 场景总数
        """
        for i in range(1, scene_count):
            upstream = (chapter_num, i)
            downstream = (chapter_num, i + 1)
            self.add_dependency(upstream, downstream)

        logger.info(f"Built linear dependency for chapter {chapter_num}: {scene_count} scenes")

    def to_dict(self) -> Dict[str, Any]:
        """Convert graph to dict for serialization."""
        return {
            "dependency_graph": {
                f"{k[0]}_{k[1]}": [f"{v[0]}_{v[1]}" for v in vs]
                for k, vs in self.dependency_graph.items()
            },
            "reverse_graph": {
                f"{k[0]}_{k[1]}": [f"{v[0]}_{v[1]}" for v in vs]
                for k, vs in self.reverse_graph.items()
            }
        }


class CascadeInvalidator:
    """
    级联失效检测器

    当场景被重构时，检测是否需要标记下游场景为 OUTDATED。
    """

    def __init__(
        self,
        dependency_graph: SceneDependencyGraph,
        event_extractor: KeyEventExtractor
    ):
        """
        Initialize CascadeInvalidator.

        Args:
            dependency_graph: Scene dependency graph
            event_extractor: Key event extractor
        """
        self.dependency_graph = dependency_graph
        self.event_extractor = event_extractor

    async def check_invalidation(
        self,
        old_scene_text: str,
        new_scene_text: str,
        scene: Tuple[int, int],
        state_manager,
        path_manager,
        book_id: str
    ) -> Tuple[bool, List[Tuple[int, int]], List[str]]:
        """
        检查场景重构是否导致下游场景失效。

        Args:
            old_scene_text: 旧场景文本
            new_scene_text: 新场景文本
            scene: 当前场景 (chapter_num, scene_num)
            state_manager: StateManager instance
            path_manager: BookPathManager instance
            book_id: Book ID

        Returns:
            (is_invalid, outdated_scenes, diff_summary)
            - is_invalid: 是否有失效的下游场景
            - outdated_scenes: 失效的场景列表 [(chapter, scene), ...]
            - diff_summary: 差异摘要列表
        """
        logger.info(f"Checking invalidation for scene {scene}...")

        # 提取关键事件
        old_events = self.event_extractor.extract_key_events(old_scene_text)
        new_events = self.event_extractor.extract_key_events(new_scene_text)

        # 转换为字典便于比较
        old_events_dict = self.event_extractor.events_to_dict(old_events)
        new_events_dict = self.event_extractor.events_to_dict(new_events)

        # 比较差异
        diff_summary = self._compare_events(old_events_dict, new_events_dict)

        # 判断是否有重大变化
        has_major_change = self._has_major_change(diff_summary)

        if has_major_change:
            logger.warning(f"Major changes detected in scene {scene}, marking downstream as outdated")

            # 获取所有下游场景
            downstream_scenes = self.dependency_graph.get_downstream_scenes(scene)

            # 标记为 OUTDATED
            for downstream_scene in downstream_scenes:
                await state_manager.add_outdated_scene(
                    state_path=path_manager.get_book_state_path(book_id),
                    chapter_num=downstream_scene[0],
                    scene_num=downstream_scene[1]
                )

            return (True, downstream_scenes, diff_summary)
        else:
            logger.info(f"No major changes in scene {scene}, downstream remains valid")
            return (False, [], diff_summary)

    def _compare_events(
        self,
        old_events: Dict[str, str],
        new_events: Dict[str, str]
    ) -> List[str]:
        """
        比较旧事件和新事件的差异。

        Args:
            old_events: 旧事件字典
            new_events: 新事件字典

        Returns:
            差异摘要列表
        """
        diff_summary = []

        # 找出被删除的事件
        removed_events = set(old_events.keys()) - set(new_events.keys())
        if removed_events:
            for event_key in removed_events:
                diff_summary.append(f"[删除] {event_key}: {old_events[event_key]}")

        # 找出新增的事件
        added_events = set(new_events.keys()) - set(old_events.keys())
        if added_events:
            for event_key in added_events:
                diff_summary.append(f"[新增] {event_key}: {new_events[event_key]}")

        return diff_summary

    def _has_major_change(self, diff_summary: List[str]) -> bool:
        """
        判断是否有重大变化（需要级联失效）。

        重大变化标准：
        1. 人物状态变化（死亡/复活/背叛）
        2. 关键物品得失
        3. 地点变化

        Args:
            diff_summary: 差异摘要

        Returns:
            是否有重大变化
        """
        major_keywords = ["杀", "死", "放走", "释放", "背叛", "揭露", "获得", "失去", "夺取"]

        for diff in diff_summary:
            for keyword in major_keywords:
                if keyword in diff:
                    return True

        return False


class SceneDependencyTracker:
    """
    场景依赖追踪器

    结合 BookState 和 SceneDependencyGraph，提供完整的级联失效检测功能。
    """

    def __init__(
        self,
        path_manager,
        state_manager,
        dependency_graph: Optional[SceneDependencyGraph] = None
    ):
        """
        Initialize SceneDependencyTracker.

        Args:
            path_manager: BookPathManager instance
            state_manager: StateManager instance
            dependency_graph: Optional SceneDependencyGraph (will create if None)
        """
        self.path_manager = path_manager
        self.state_manager = state_manager
        self.dependency_graph = dependency_graph or SceneDependencyGraph()
        self.event_extractor = KeyEventExtractor()
        self.invalidator = CascadeInvalidator(
            self.dependency_graph,
            self.event_extractor
        )

    async def load_scene(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> Optional[str]:
        """
        加载场景文本。

        Args:
            book_id: Book ID
            chapter_num: Chapter number
            scene_num: Scene number
            version: Scene version

        Returns:
            Scene text or None if not found
        """
        scene_path = self.path_manager.get_scene_draft_path(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=version
        )

        if not scene_path.exists():
            logger.warning(f"Scene file not found: {scene_path}")
            return None

        with open(scene_path, 'r', encoding='utf-8') as f:
            return f.read()

    async def rebuild_scene(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        old_version: int,
        new_scene_text: str,
        book_meta: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        重建场景并执行级联失效检测。

        Args:
            book_id: Book ID
            chapter_num: Chapter number
            scene_num: Scene number
            old_version: Old scene version
            new_scene_text: New scene text
            book_meta: Book metadata

        Returns:
            Dict with:
                - invalid: bool (是否有级联失效)
                - outdated_scenes: List[Tuple[int, int]]
                - diff_summary: List[str]
        """
        logger.info(f"Rebuilding scene ch{chapter_num}_scene{scene_num}...")

        # 加载旧场景
        old_scene_text = await self.load_scene(
            book_id=book_id,
            chapter_num=chapter_num,
            scene_num=scene_num,
            version=old_version
        )

        if old_scene_text is None:
            logger.warning("Old scene not found, skipping invalidation check")
            return {
                "invalid": False,
                "outdated_scenes": [],
                "diff_summary": ["旧场景不存在，无法比较"]
            }

        # 执行级联失效检测
        is_invalid, outdated_scenes, diff_summary = await self.invalidator.check_invalidation(
            old_scene_text=old_scene_text,
            new_scene_text=new_scene_text,
            scene=(chapter_num, scene_num),
            state_manager=self.state_manager,
            path_manager=self.path_manager,
            book_id=book_id
        )

        return {
            "invalid": is_invalid,
            "outdated_scenes": outdated_scenes,
            "diff_summary": diff_summary
        }

    def save_dependency_graph(self, book_id: str) -> None:
        """
        保存依赖关系到文件。

        Args:
            book_id: Book ID
        """
        graph_path = self.path_manager.get_outlines_dir(book_id) / "dependency_graph.json"

        with open(graph_path, 'w', encoding='utf-8') as f:
            json.dump(self.dependency_graph.to_dict(), f, ensure_ascii=False, indent=2)

        logger.info(f"Dependency graph saved to {graph_path}")

    def load_dependency_graph(self, book_id: str) -> bool:
        """
        从文件加载依赖关系。

        Args:
            book_id: Book ID

        Returns:
            True if successful
        """
        graph_path = self.path_manager.get_outlines_dir(book_id) / "dependency_graph.json"

        if not graph_path.exists():
            logger.warning(f"Dependency graph not found: {graph_path}")
            return False

        try:
            with open(graph_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Rebuild graph
            self.dependency_graph = SceneDependencyGraph()

            # Parse dependency_graph
            for upstream_str, downstream_list in data.get("dependency_graph", {}).items():
                upstream = tuple(map(int, upstream_str.split("_")))
                for downstream_str in downstream_list:
                    downstream = tuple(map(int, downstream_str.split("_")))
                    self.dependency_graph.add_dependency(upstream, downstream)

            logger.info(f"Dependency graph loaded from {graph_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to load dependency graph: {e}")
            return False
