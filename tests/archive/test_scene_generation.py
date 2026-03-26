"""
Test script for scene-level generation architecture.
Demonstrates the new workflow: Scene Outline → Scene Draft → Scene Readers → Next Scene
"""
import asyncio
import json
import os
from pathlib import Path
from dotenv import load_dotenv

from src.agents import AuthorAgent, EditorAgent
from src.core.scene_generator import SceneGenerator
from src.core import OpenAILLMClient
from src.utils import get_file_manager

# Load environment variables from .env file
load_dotenv()


async def test_scene_generation():
    """Test the new scene-level generation architecture."""

    print("=" * 60)
    print("Testing New Architecture: Scene-Level Generation & Iteration")
    print("=" * 60)

    # Setup paths
    base_dir = Path("D:/AI/AutoNovel-Studio")
    file_manager = get_file_manager()

    # Load data
    book_meta = file_manager.read_json("00_Config/book_meta.json")
    world_lore = file_manager.read_json("01_Global_Settings/world_lore.json")
    characters = file_manager.read_json("01_Global_Settings/characters.json")
    chapter_outline = file_manager.read_json("02_Outlines/chapter_01_outline.json")
    volume_outline = file_manager.read_text("02_Outlines/volume_01.md") or ""

    # Format context data
    characters_info = json.dumps(characters, ensure_ascii=False, indent=2)
    world_lore_str = json.dumps(world_lore, ensure_ascii=False, indent=2)
    recent_summaries = "(Chapter 1, no previous summaries)"

    # Load API configuration from environment
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    author_model = os.getenv("AUTHOR_MODEL", "kimi-k2.5")

    if not api_key:
        print("[ERROR] OPENAI_API_KEY environment variable not set")
        print("Please set OPENAI_API_KEY in .env file")
        return

    print(f"[OK] API Configuration:")
    print(f"  - Base URL: {base_url}")
    print(f"  - Model: {author_model}")

    # Initialize LLM client
    llm_client = OpenAILLMClient(
        model_name=author_model,
        api_key=api_key,
        base_url=base_url
    )

    # Initialize agents
    author = AuthorAgent(llm_client=llm_client, use_examples=True)
    editor = EditorAgent(llm_client=llm_client)

    # Initialize scene generator
    scene_generator = SceneGenerator(
        author=author,
        editor=editor,
        llm_client=llm_client,
        output_dir=base_dir
    )

    # Test: Generate Scene 1
    print("\n" + "=" * 60)
    print("Starting Test: Generating Scene 1")
    print("=" * 60)

    scene_data = chapter_outline["scenes"][0]

    result = await scene_generator.generate_scene_with_review(
        book_meta=book_meta,
        volume_outline=volume_outline,
        recent_summaries=recent_summaries,
        chapter_outline=chapter_outline,
        scene_data=scene_data,
        scene_number=1,
        total_scenes=len(chapter_outline["scenes"]),
        characters_info=characters_info,
        world_lore=world_lore_str,
        max_retries=3
    )

    # Print results
    print("\n" + "=" * 60)
    print("Generation Results")
    print("=" * 60)

    print(f"\nScene Title: {result['scene_outline']['title']}")
    print(f"Retry Count: {result['retry_count']}")

    print("\nScene Outline:")
    print(f"- Plot Points: {', '.join(result['scene_outline']['plot_points'])}")
    print(f"- Logic Chain: {result['scene_outline']['logic_chain']}")
    print(f"- Emotional Arc: {result['scene_outline']['emotional_arc']}")

    print("\nFinal Feedback (last iteration):")
    final_feedback = result['all_feedbacks'][-1]
    for reader_name, feedback in final_feedback.items():
        if feedback:
            status = "[PASS]" if feedback.pass_status else "[FAIL]"
            print(f"- {reader_name}: {status} - {feedback.quick_comment}")

            # Show issues
            all_issues = (
                feedback.critical_issues +
                feedback.lore_violations +
                feedback.ai_tone_issues
            )
            if all_issues:
                print(f"  Issues ({len(all_issues)} total):")
                for issue in all_issues[:3]:  # Show first 3
                    print(f"    - [{issue.type}] Severity {issue.severity}: {issue.fix_instruction[:50]}...")

    print("\n" + "=" * 60)
    print("Scene Content Preview (first 500 chars):")
    print("=" * 60)
    print(result['scene_content'][:500] + "...")

    print("\n[OK] Test Complete!")
    print(f"\nFiles saved to:")
    print(f"- Scene Outline: 02_Outlines/chapter_01_scene_1_outline.json")
    print(f"- Scene Content: 04_Drafts/ch01_scene_1.txt")


if __name__ == "__main__":
    asyncio.run(test_scene_generation())
