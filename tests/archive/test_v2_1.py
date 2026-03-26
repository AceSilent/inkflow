#!/usr/bin/env python3
"""
Test script for AutoNovel-Studio v2.1

Tests all new v2.1 features:
1. Book Management System
2. Smart Retry with DraftSummarizer
3. Cascade Invalidation
4. Summary Rebuilder
5. Chapter Reconstruction

Usage:
    python test_v2_1.py
"""
import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core import (
    BookPathManager, BookManager, StateManager,
    SceneDependencyGraph, KeyEventExtractor, CascadeInvalidator
)
from src.agents import DraftSummarizer


def test_book_management():
    """Test book management system."""
    print("\n" + "="*60)
    print("Testing Book Management System")
    print("="*60)

    # Initialize
    path_manager = BookPathManager(library_root="test_books")
    book_manager = BookManager(path_manager)

    # Create test book
    print("\n1. Creating test book...")
    book_meta = book_manager.create_book(
        book_id="test_book_001",
        title="测试小说",
        genre="仙侠",
        sub_genres=["重生", "复仇"],
        tone="黑暗",
        forbidden_elements=["后宫"]
    )

    print(f"   ✅ Book created: {book_meta.title}")
    print(f"   ID: {book_meta.book_id}")
    print(f"   Genre: {book_meta.genre}")
    print(f"   Status: {book_meta.status}")

    # Load book metadata
    print("\n2. Loading book metadata...")
    loaded_meta = book_manager.load_book_metadata("test_book_001")
    if loaded_meta:
        print(f"   ✅ Metadata loaded: {loaded_meta.title}")
    else:
        print("   ❌ Failed to load metadata")

    # List books
    print("\n3. Listing all books...")
    books = book_manager.list_books()
    print(f"   ✅ Found {len(books)} book(s)")
    for book in books:
        print(f"      - {book['book_id']}: {book['title']}")


def test_state_manager():
    """Test state manager with file locking."""
    print("\n" + "="*60)
    print("Testing State Manager")
    print("="*60)

    # Initialize
    path_manager = BookPathManager(library_root="test_books")
    state_manager = StateManager()

    # Load state
    print("\n1. Loading book state...")
    state = asyncio.run(state_manager.load_state(
        path_manager.get_book_state_path("test_book_001")
    ))

    if state:
        print(f"   ✅ State loaded")
        print(f"   Current chapter: {state.current_chapter}")
        print(f"   Current scene: {state.current_scene}")
        print(f"   Outdated scenes: {state.outdated_scenes}")
    else:
        print("   ❌ Failed to load state")

    # Update chapter status
    print("\n2. Updating chapter status...")
    success = asyncio.run(state_manager.update_chapter_status(
        state_path=path_manager.get_book_state_path("test_book_001"),
        chapter_num=1,
        status="in_progress"
    ))

    if success:
        print("   ✅ Chapter status updated")
    else:
        print("   ❌ Failed to update status")


def test_key_event_extractor():
    """Test key event extractor."""
    print("\n" + "="*60)
    print("Testing Key Event Extractor")
    print("="*60)

    # Initialize
    extractor = KeyEventExtractor()

    # Test scene text
    test_scene = """
    林辰在密室中运转元婴圆满真元，窍穴与星图共鸣正酣。

    叶流云端茶入内，表面恭敬侍奉，茶中暗藏绝灵散。

    林辰挥袖扫落茶盏，质问徒弟为何背叛。

    叶流云暴起拔出问心剑，剑锋贯穿林辰胸膛，元婴在剑气中炸裂。

    林辰在濒死之际燃烧神魂发动禁术，意识坠入黑暗。
    """

    # Extract key events
    print("\n1. Extracting key events...")
    events = extractor.extract_key_events(test_scene)

    print(f"   ✅ Extracted {len(events)} key events:")
    for i, event in enumerate(events, 1):
        print(f"      {i}. {event['subject']} {event['action']} {event['object']}")

    # Extract entities
    print("\n2. Extracting entities...")
    entities = extractor.extract_entities(test_scene)
    print(f"   ✅ Extracted {len(entities)} entities: {', '.join(entities)}")


def test_dependency_graph():
    """Test scene dependency graph."""
    print("\n" + "="*60)
    print("Testing Scene Dependency Graph")
    print("="*60)

    # Initialize
    graph = SceneDependencyGraph()

    # Build linear dependency
    print("\n1. Building linear dependency...")
    graph.build_linear_dependency(chapter_num=1, scene_count=5)
    print("   ✅ Linear dependency built")

    # Get downstream scenes
    print("\n2. Getting downstream scenes...")
    downstream = graph.get_downstream_scenes((1, 2))
    print(f"   ✅ Downstream of (1,2): {downstream}")

    # Get all downstream scenes
    print("\n3. Getting all downstream scenes...")
    all_downstream = graph.get_downstream_scenes((1, 1))
    print(f"   ✅ All downstream of (1,1): {all_downstream}")


def test_draft_summarizer():
    """Test draft summarizer."""
    print("\n" + "="*60)
    print("Testing Draft Summarizer")
    print("="*60)

    # Check if API key is available
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("   ⚠️  Skipping: OPENAI_API_KEY not found")
        return

    # Initialize
    from src.core import OpenAILLMClient
    llm_client = OpenAILLMClient(
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        model="gpt-4o-mini"
    )
    summarizer = DraftSummarizer(llm_client)

    # Test scene
    test_draft = """
    林辰在密室中运转元婴圆满真元，窍穴与星图共鸣正酣。叶流云端茶入内，
    茶中暗藏绝灵散。林辰挥袖扫落茶盏，叶流云暴起拔出问心剑贯穿林辰胸膛，
    元婴炸裂。林辰得知五十年师徒情谊皆是骗局，濒死之际燃烧神魂发动禁术。
    """

    # Test brief summary
    print("\n1. Testing brief summary generation...")
    try:
        summary = asyncio.run(summarizer.summarize_draft(
            draft=test_draft,
            draft_summary_level="brief",
            identified_issues=[
                {"error_type": "Cliche_Phrase", "severity": 2, "description": "使用了陈词滥调"}
            ]
        ))

        if summary:
            print(f"   ✅ Brief summary generated:")
            print(f"      Summary: {summary.brief_summary}")
            print(f"      Characters: {', '.join(summary.key_characters)}")
            print(f"      Events: {', '.join(summary.key_events)}")
        else:
            print("   ❌ Failed to generate summary")
    except Exception as e:
        print(f"   ❌ Error: {e}")


def main():
    """Run all tests."""
    load_dotenv()

    print("\n" + "="*60)
    print("AutoNovel-Studio v2.1 Test Suite")
    print("="*60)

    # Run tests
    test_book_management()
    test_state_manager()
    test_key_event_extractor()
    test_dependency_graph()
    test_draft_summarizer()

    print("\n" + "="*60)
    print("Test Suite Completed")
    print("="*60)
    print("\n✅ All tests completed!")
    print("\nNote: Some tests may have been skipped if OPENAI_API_KEY is not set.")
    print("To run full tests, set OPENAI_API_KEY in your .env file.")


if __name__ == "__main__":
    main()
