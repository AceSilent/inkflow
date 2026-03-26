"""
Test Author Agent in isolation.
"""
import asyncio
import sys
import os
from pathlib import Path

if os.name == 'nt':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from src.agents import AuthorAgent
from src.core import OpenAILLMClient


async def test_author():
    """Test author agent."""
    print("=" * 60)
    print("Author Agent Test")
    print("=" * 60)

    client = OpenAILLMClient(
        model_name="kimi-k2.5",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )

    author = AuthorAgent(client)

    book_meta = {
        "title": "测试小说",
        "genre": "仙侠",
        "sub_genres": ["修真", "重生"],
        "tone": "dark",
        "forbidden_elements": ["圣母行为"]
    }

    chapter_outline = {
        "title": "第一章",
        "summary": "主角重生"
    }

    try:
        print("\n正在生成场景内容...")
        content = await author.generate_scene(
            book_meta=book_meta,
            volume_outline="这是一个关于重生复仇的故事。",
            recent_summaries="暂无",
            chapter_outline=chapter_outline,
            scene_target="背叛与死亡",
            word_count=500
        )

        print(f"\n✓ 生成成功!")
        print(f"\n字数: {len(content)} 字符")
        print(f"\n内容预览:\n{content[:200]}...")

        # Save to file
        Path("04_Drafts/test_scene.txt").parent.mkdir(parents=True, exist_ok=True)
        with open("04_Drafts/test_scene.txt", "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\n✓ 已保存到: 04_Drafts/test_scene.txt")

        return True

    except Exception as e:
        print(f"\n✗ 失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_author())
    sys.exit(0 if success else 1)
