"""
Test AI Tone Scanner Agent.
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

from src.agents import AIToneScannerAgent
from src.core import OpenAILLMClient
from src.utils import FileManager


async def test_ai_tone_scanner():
    """Test AI Tone Scanner agent."""
    print("=" * 60)
    print("AI Tone Scanner Test")
    print("=" * 60)

    # Read the test draft
    fm = FileManager()
    draft = fm.read_text("04_Drafts/test_scene.txt")

    if not draft:
        print("✗ Test draft not found. Run test_author.py first.")
        return False

    print(f"\n📝 Test draft loaded ({len(draft)} characters)\n")

    # Load test data
    book_meta = fm.read_json("00_Config/book_meta.json")

    client = OpenAILLMClient(
        model_name="kimi-k2.5",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )

    print("🤖 Testing AI Tone Scanner Agent...")
    try:
        ai_tone_scanner = AIToneScannerAgent(client)
        feedback = await ai_tone_scanner.review(
            draft_content=draft,
            book_meta=book_meta
        )

        print(f"\n✓ AI Tone Scanner: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
        print(f"  情绪水位: {feedback.emotional_watermark}")
        if feedback.overall_comment:
            print(f"  总体评价: {feedback.overall_comment}")

        if feedback.issues:
            print(f"\n  发现的AI味问题:")
            for i, issue in enumerate(feedback.issues[:10], 1):  # 显示前10个
                print(f"\n    {i}. [{issue.error_type}] 严重度{issue.severity}")
                print(f"       描述: {issue.description}")
                if issue.quote:
                    quote_preview = issue.quote[:80] + "..." if len(issue.quote) > 80 else issue.quote
                    print(f"       引用: {quote_preview}")
        else:
            print(f"\n  ✓ 未发现明显的AI味问题！文笔自然。")

        # Summary
        print("\n" + "=" * 60)
        print("Test Summary")
        print("=" * 60)

        if feedback.immersion_score >= 7:
            print(f"\n✅ 文笔质量良好（{feedback.immersion_score}/10）")
            return True
        elif feedback.immersion_score >= 5:
            print(f"\n⚠️  文笔中等，有轻微AI味（{feedback.immersion_score}/10）")
            print(f"   建议：重点修正高严重度问题")
            return True
        else:
            print(f"\n❌ AI味过重（{feedback.immersion_score}/10）")
            print(f"   建议：必须重写，去除AI腔调")
            return True

    except Exception as e:
        print(f"\n✗ AI Tone Scanner failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_ai_tone_scanner())
    sys.exit(0 if success else 1)
