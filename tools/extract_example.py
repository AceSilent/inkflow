"""
范文提取工具
用于快速提取和格式化网文范文片段
"""
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))


def create_example_template(
    book_name: str,
    author: str,
    category: str,
    scene_description: str,
    content: str,
    source_chapter: str = "",
    word_count: int = 0,
    tags: list = None,
    techniques: list = None
) -> str:
    """
    创建范文模板

    Args:
        book_name: 书名
        author: 作者
        category: 分类（如 'dark_revenge'）
        scene_description: 场景描述
        content: 范文内容
        source_chapter: 来源章节
        word_count: 字数
        tags: 核心风格标签
        techniques: 写作技巧标签

    Returns:
        格式化的markdown内容
    """
    if tags is None:
        tags = []
    if techniques is None:
        techniques = []

    # 自动计算字数
    if word_count == 0:
        word_count = len(content)

    # 格式化标签
    tags_str = " ".join([f"#{tag}" for tag in tags])
    techniques_str = " ".join([f"#{tech}" for tech in techniques])

    template = f"""# 《{book_name}》- {scene_description}

## 📋 元数据

| 字段 | 内容 |
|------|------|
| **书名** | {book_name} |
| **作者** | {author} |
| **分类** | `{category}` (一级分类) |
| **字数** | 约 {word_count} 字 |
| **来源章节** | {source_chapter} |
| **核心风格** | {tags_str} |
| **写作技巧** | {techniques_str} |
| **使用场景** | {scene_description} |

---

## 📖 范文内容

{content}

---

## 💡 技巧分析

**为什么这段优秀**：
- ✅ （待补充）

**可学习的技巧**：
- （待补充）

---

## 📝 提取说明

**提取时间**: {Path(__file__).stat().st_mtime}
**提取人**: （待补充）
**备注**: （待补充）
"""

    return template


def save_example(
    book_name: str,
    author: str,
    category: str,
    scene_description: str,
    content: str,
    **kwargs
) -> str:
    """
    保存范文到文库

    Args:
        book_name: 书名
        author: 作者
        category: 分类
        scene_description: 场景描述
        content: 范文内容
        **kwargs: 其他元数据

    Returns:
        保存的文件路径
    """
    # 生成范文内容
    example_content = create_example_template(
        book_name=book_name,
        author=author,
        category=category,
        scene_description=scene_description,
        content=content,
        **kwargs
    )

    # 生成文件名
    filename = f"{book_name}_{author}_{scene_description.replace(' ', '_')}.md"
    filename = filename.replace('/', '_')  # 避免路径问题

    # 确定保存路径
    library_dir = Path("06_Examples_Library") / category
    library_dir.mkdir(parents=True, exist_ok=True)

    file_path = library_dir / filename

    # 保存文件
    file_path.write_text(example_content, encoding='utf-8')

    print(f"✓ 范文已保存: {file_path}")
    return str(file_path)


if __name__ == "__main__":
    """
    使用示例

    python tools/extract_example.py \\
        --book "遮天" \\
        --author "辰东" \\
        --category "dark_revenge" \\
        --scene "九龙拉棺" \\
        --content "..." \\
        --tags "黑暗 复仇 快节奏" \\
        --techniques "动作干脆 视觉冲击"
    """
    import argparse

    parser = argparse.ArgumentParser(description='提取网文范文')
    parser.add_argument('--book', required=True, help='书名')
    parser.add_argument('--author', required=True, help='作者')
    parser.add_argument('--category', required=True, help='分类（如 dark_revenge）')
    parser.add_argument('--scene', required=True, help='场景描述')
    parser.add_argument('--content', required=True, help='范文内容')
    parser.add_argument('--chapter', default='', help='来源章节')
    parser.add_argument('--tags', default='', help='核心风格标签（空格分隔）')
    parser.add_argument('--techniques', default='', help='写作技巧标签（空格分隔）')

    args = parser.parse_args()

    # 处理标签
    tags = args.tags.split() if args.tags else []
    techniques = args.techniques.split() if args.techniques else []

    # 保存范文
    save_example(
        book_name=args.book,
        author=args.author,
        category=args.category,
        scene_description=args.scene,
        content=args.content,
        source_chapter=args.chapter,
        tags=tags,
        techniques=techniques
    )
