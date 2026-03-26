"""
Test Editor Agent.
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

from src.agents import EditorAgent
from src.core import OpenAILLMClient, ReaderFeedback, Issue
from src.utils import FileManager


async def test_editor():
    """Test editor agent."""
    print("=" * 60)
    print("Editor Agent Test")
    print("=" * 60)

    # Load test data
    fm = FileManager()
    draft = fm.read_text("04_Drafts/test_scene.txt")
    book_meta = fm.read_json("00_Config/book_meta.json")
    chapter_outline = fm.read_json("02_Outlines/chapter_01_outline.json")

    if not draft:
        print("✗ Test draft not found. Run test_author.py first.")
        return False

    print(f"\n📝 Test draft loaded ({len(draft)} characters)\n")

    client = OpenAILLMClient(
        model_name="kimi-k2.5",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )

    editor = EditorAgent(client)

    # Create mock reader feedbacks
    feedbacks = {
        "lore_keeper": ReaderFeedback(
            reader_role="lore_keeper",
            immersion_score=8,
            emotional_watermark="engaged",
            issues=[
                Issue(
                    error_type="Lore_Conflict",
                    severity=3,
                    quote="林渊",
                    description="Character name doesn't match settings (should be 林辰)"
                )
            ],
            overall_comment="Minor naming inconsistency"
        ),
        "pacing_junkie": ReaderFeedback(
            reader_role="pacing_junkie",
            immersion_score=9,
            emotional_watermark="excited",
            issues=[],
            overall_comment="Excellent opening, very engaging"
        ),
        "anti_trope_scanner": ReaderFeedback(
            reader_role="anti_trope_scanner",
            immersion_score=7,
            emotional_watermark="engaged",
            issues=[
                Issue(
                    error_type="Cliche_Phrase",
                    severity=2,
                    quote="血从胸口涌出来",
                    description="Slightly cliched opening"
                )
            ],
            overall_comment="Good quality overall"
        )
    }

    print("📋 Mock reader feedbacks created:")
    for role, feedback in feedbacks.items():
        print(f"  - {role}: score={feedback.immersion_score}/10, issues={len(feedback.issues)}")
    print()

    # Convert feedbacks to dict format for editor
    feedbacks_list = []
    for role, feedback in feedbacks.items():
        feedback_dict = {
            "reader_role": feedback.reader_role,
            "immersion_score": feedback.immersion_score,
            "emotional_watermark": feedback.emotional_watermark,
            "issues": [
                {
                    "error_type": issue.error_type,
                    "severity": issue.severity,
                    "quote": issue.quote,
                    "description": issue.description,
                    "suggestion": issue.suggestion
                }
                for issue in feedback.issues
            ],
            "overall_comment": feedback.overall_comment
        }
        feedbacks_list.append(feedback_dict)

    try:
        print("⚖️ Testing Editor Agent...\n")
        decision = await editor.review(
            draft_content=draft,
            reader_feedbacks=feedbacks,
            chapter_outline=chapter_outline,
            book_meta=book_meta,
            scene_target="背叛与死亡"
        )

        print(f"✓ Editor decision received!")
        print(f"\n  Pass Status: {decision.pass_status}")
        print(f"  Rejected Feedbacks: {len(decision.rejected_feedbacks)}")
        print(f"  Revision Instructions: {len(decision.revision_instructions)}")
        print(f"  Priority Fixes: {len(decision.priority_fixes)}")
        print(f"\n  Scene Target: {decision.scene_target}")

        if decision.revision_instructions:
            print(f"\n  Instructions:")
            for i, instr in enumerate(decision.revision_instructions, 1):
                print(f"    {i}. {instr}")

        return True

    except Exception as e:
        print(f"\n✗ Editor failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_editor())
    sys.exit(0 if success else 1)
