"""
优秀文库管理工具
用于管理和检索Few-Shot Prompting的范文样本
"""
import json
import random
from pathlib import Path
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class ExampleLibrary:
    """
    优秀文库管理器
    """

    def __init__(self, library_root: str = "06_Examples_Library"):
        """
        初始化文库管理器

        Args:
            library_root: 文库根目录
        """
        self.library_root = Path(library_root)
        if not self.library_root.exists():
            logger.warning(f"Library directory not found: {library_root}")

        self._cache = {}  # 缓存已加载的范文

    def get_by_category(
        self,
        category: str,
        random_choice: bool = False,
        max_count: int = 1
    ) -> Optional[str]:
        """
        按分类获取范文

        Args:
            category: 分类名称（如 'dark_revenge'）
            random_choice: 是否随机选择
            max_count: 最多返回几个范文

        Returns:
            范文内容（markdown格式）
        """
        category_dir = self.library_root / category
        if not category_dir.exists():
            logger.warning(f"Category not found: {category}")
            return None

        examples = list(category_dir.glob("*.md"))
        if not examples:
            logger.warning(f"No examples found in category: {category}")
            return None

        if random_choice:
            selected = random.sample(examples, min(max_count, len(examples)))
        else:
            selected = examples[:max_count]

        results = []
        for example_file in selected:
            content = self._load_example(example_file)
            if content:
                results.append(content)

        return "\n\n---\n\n".join(results) if results else None

    def get_by_tags(
        self,
        tags: List[str],
        category: Optional[str] = None,
        max_count: int = 3
    ) -> Optional[str]:
        """
        按标签检索范文

        Args:
            tags: 标签列表（如 ['#动作干脆', '#无冗余修饰']）
            category: 限定分类
            max_count: 最多返回几个范文

        Returns:
            符合条件的范文内容
        """
        # TODO: 实现标签索引和检索
        logger.warning("Tag-based search not implemented yet")
        return None

    def get_example(
        self,
        book_name: str,
        author: Optional[str] = None
    ) -> Optional[str]:
        """
        按书名获取范文

        Args:
            book_name: 书名
            author: 作者（可选，用于区分同名书）

        Returns:
            范文内容
        """
        # 搜索所有分类
        for category_dir in self.library_root.iterdir():
            if not category_dir.is_dir():
                continue

            # 搜索匹配的文件
            pattern = f"*{book_name}*.md"
            examples = list(category_dir.glob(pattern))

            if not examples:
                continue

            # 如果有作者信息，进一步筛选
            if author:
                author_examples = [e for e in examples if author in e.stem]
                if author_examples:
                    return self._load_example(author_examples[0])

            # 返回第一个匹配的
            return self._load_example(examples[0])

        logger.warning(f"Example not found: {book_name}")
        return None

    def search(
        self,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        max_length: Optional[int] = None,
        random_choice: bool = False
    ) -> List[Dict[str, str]]:
        """
        综合搜索范文

        Args:
            category: 分类筛选
            tags: 标签筛选
            max_length: 最大字数
            random_choice: 是否随机选择

        Returns:
            范文列表，每个元素包含 {'title': str, 'content': str, 'tags': List[str]}
        """
        results = []

        # 确定搜索范围
        if category:
            search_dirs = [self.library_root / category]
        else:
            search_dirs = [d for d in self.library_root.iterdir() if d.is_dir()]

        # 遍历所有范文
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue

            for example_file in search_dir.glob("*.md"):
                metadata = self._parse_metadata(example_file)

                # 筛选条件
                if tags and not any(tag in metadata.get('tags', []) for tag in tags):
                    continue

                if max_length and metadata.get('word_count', 0) > max_length:
                    continue

                content = self._load_example(example_file)
                if content:
                    results.append({
                        'title': metadata.get('book_name', example_file.stem),
                        'content': content,
                        'tags': metadata.get('tags', []),
                        'category': metadata.get('category', ''),
                        'file_path': str(example_file)
                    })

        if random_choice and results:
            results = random.sample(results, min(len(results), 10))

        return results

    def _load_example(self, example_file: Path) -> Optional[str]:
        """
        加载范文内容

        Args:
            example_file: 范文文件路径

        Returns:
            范文内容
        """
        if example_file in self._cache:
            return self._cache[example_file]

        try:
            content = example_file.read_text(encoding='utf-8')
            self._cache[example_file] = content
            return content
        except Exception as e:
            logger.error(f"Failed to load example: {example_file}, error: {e}")
            return None

    def _parse_metadata(self, example_file: Path) -> Dict[str, any]:
        """
        解析范文的元数据

        Args:
            example_file: 范文文件路径

        Returns:
            元数据字典
        """
        content = self._load_example(example_file)
        if not content:
            return {}

        metadata = {}

        # 简单解析（实际应该使用专门的markdown解析器）
        lines = content.split('\n')
        for line in lines:
            if '|' in line and '字段' in line:
                # 解析表格格式的元数据
                parts = line.split('|')
                if len(parts) >= 3:
                    field = parts[1].strip()
                    value = parts[2].strip()
                    # 去掉markdown标记
                    field = field.replace('**', '').strip()
                    value = value.replace('`', '').strip()
                    metadata[field] = value

        return metadata

    def list_categories(self) -> List[str]:
        """
        列出所有分类

        Returns:
            分类列表
        """
        if not self.library_root.exists():
            return []

        categories = []
        for item in self.library_root.iterdir():
            if item.is_dir():
                categories.append(item.name)

        return sorted(categories)

    def get_stats(self) -> Dict[str, any]:
        """
        获取文库统计信息

        Returns:
            统计信息字典
        """
        stats = {
            'total_examples': 0,
            'categories': {}
        }

        if not self.library_root.exists():
            return stats

        for category_dir in self.library_root.iterdir():
            if not category_dir.is_dir():
                continue

            category_name = category_dir.name
            examples = list(category_dir.glob("*.md"))
            stats['categories'][category_name] = len(examples)
            stats['total_examples'] += len(examples)

        return stats


# 全局单例
_library_instance: Optional[ExampleLibrary] = None


def get_example_library() -> ExampleLibrary:
    """获取全局文库管理器实例"""
    global _library_instance
    if _library_instance is None:
        _library_instance = ExampleLibrary()
    return _library_instance
