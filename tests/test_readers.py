"""
Test Reader Agents individually.
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

from src.agents import LoreKeeperAgent, PacingJunkieAgent, AntiTropeScannerAgent, AIToneScannerAgent
from src.core import OpenAILLMClient
from src.utils import FileManager


async def test_reader_agents():
    """Test all reader agents."""
    print("=" * 60)
    print("Reader Agents Test")
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
    characters = fm.read_json("01_Global_Settings/characters.json")
    world_lore = fm.read_json("01_Global_Settings/world_lore.json")
    chapter_outline = fm.read_json("02_Outlines/chapter_01_outline.json")

    client = OpenAILLMClient(
        model_name="kimi-k2.5",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )

    results = {}

    # Test 1: Lore Keeper
    print("🔍 Testing Lore Keeper Agent...")
    try:
        lore_keeper = LoreKeeperAgent(client)
        feedback = await lore_keeper.review(
            draft_content=draft,
            characters=characters,
            world_lore=world_lore
        )
        print(f"✓ Lore Keeper: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
        print(f"  情绪水位: {feedback.emotional_watermark}")
        if feedback.overall_comment:
            print(f"  总体评价: {feedback.overall_comment}")
        if feedback.issues:
            print(f"  发现的问题:")
            for i, issue in enumerate(feedback.issues[:5], 1):  # 只显示前5个
                print(f"    {i}. [{issue.error_type}] 严重度{issue.severity}: {issue.description}")
                if issue.quote:
                    print(f"       引用: {issue.quote[:50]}...")
        results['lore_keeper'] = feedback
    except Exception as e:
        print(f"✗ Lore Keeper failed: {e}")
        results['lore_keeper'] = None

    # Test 2: Pacing Junkie
    print("\n🎭 Testing Pacing Junkie Agent...")
    try:
        pacing_junkie = PacingJunkieAgent(client)
        feedback = await pacing_junkie.review(
            draft_content=draft,
            book_meta=book_meta,
            chapter_outline=chapter_outline,
            previous_chapters=None  # No previous chapters for first scene
        )
        print(f"✓ Pacing Junkie: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
        print(f"  情绪水位: {feedback.emotional_watermark}")
        if feedback.overall_comment:
            print(f"  总体评价: {feedback.overall_comment}")
        if feedback.issues:
            print(f"  发现的问题:")
            for i, issue in enumerate(feedback.issues[:5], 1):  # 只显示前5个
                print(f"    {i}. [{issue.error_type}] 严重度{issue.severity}: {issue.description}")
                if issue.quote:
                    print(f"       引用: {issue.quote[:50]}...")
        results['pacing_junkie'] = feedback
    except Exception as e:
        print(f"✗ Pacing Junkie failed: {e}")
        results['pacing_junkie'] = None

    # Test 3: Anti-Trope Scanner
    print("\n🛡️ Testing Anti-Trope Scanner Agent...")
    try:
        anti_trope = AntiTropeScannerAgent(client)
        feedback = await anti_trope.review(
            draft_content=draft,
            book_meta=book_meta
        )
        print(f"✓ Anti-Trope Scanner: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
        print(f"  情绪水位: {feedback.emotional_watermark}")
        if feedback.overall_comment:
            print(f"  总体评价: {feedback.overall_comment}")
        if feedback.issues:
            print(f"  发现的问题:")
            for i, issue in enumerate(feedback.issues[:5], 1):  # 只显示前5个
                print(f"    {i}. [{issue.error_type}] 严重度{issue.severity}: {issue.description}")
                if issue.quote:
                    print(f"       引用: {issue.quote[:50]}...")
        results['anti_trope_scanner'] = feedback
    except Exception as e:
        print(f"✗ Anti-Trope Scanner failed: {e}")
        results['anti_trope_scanner'] = None

    # Test 4: AI Tone Scanner
    print("\n🤖 Testing AI Tone Scanner Agent...")
    try:
        ai_tone = AIToneScannerAgent(client)
        feedback = await ai_tone.review(
            draft_content=draft,
            book_meta=book_meta
        )
        print(f"✓ AI Tone Scanner: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
        print(f"  情绪水位: {feedback.emotional_watermark}")
        if feedback.overall_comment:
            print(f"  总体评价: {feedback.overall_comment}")
        if feedback.issues:
            print(f"  发现的AI味问题:")
            for i, issue in enumerate(feedback.issues[:5], 1):  # 只显示前5个
                print(f"    {i}. [{issue.error_type}] 严重度{issue.severity}")
                print(f"       {issue.description}")
                if issue.quote:
                    quote_preview = issue.quote[:60] + "..." if len(issue.quote) > 60 else issue.quote
                    print(f"       引用: {quote_preview}")
        results['ai_tone_scanner'] = feedback
    except Exception as e:
        print(f"✗ AI Tone Scanner failed: {e}")
        results['ai_tone_scanner'] = None

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    success_count = sum(1 for v in results.values() if v is not None)
    print(f"\n✓ Passed: {success_count}/4")

    if success_count == 4:
        print("\n✓ All reader agents working!")
        return True
    else:
        print(f"\n✗ Some agents failed")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_reader_agents())
    sys.exit(0 if success else 1)
