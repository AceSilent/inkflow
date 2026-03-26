"""
Test script to verify AutoNovel-Studio system functionality.
"""
import sys
import os
from pathlib import Path

# Fix Windows console encoding
if os.name == 'nt':  # Windows
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_imports():
    """Test that all modules can be imported."""
    print("Testing imports...")

    try:
        from src.core import (
            BookMeta,
            ReaderFeedback,
            EditorRevisionPlan,
            NovelStateMachine,
            OpenAILLMClient
        )
        print("✓ Core modules imported")
    except ImportError as e:
        print(f"✗ Core import failed: {e}")
        return False

    try:
        from src.agents import (
            AuthorAgent,
            ReaderMatrix,
            EditorAgent
        )
        print("✓ Agent modules imported")
    except ImportError as e:
        print(f"✗ Agent import failed: {e}")
        return False

    try:
        from src.utils import FileManager, PromptManager
        print("✓ Utility modules imported")
    except ImportError as e:
        print(f"✗ Utility import failed: {e}")
        return False

    return True


def test_pydantic_models():
    """Test Pydantic model validation."""
    print("\nTesting Pydantic models...")

    from src.core import Issue, ReaderFeedback

    try:
        # Test Issue model
        issue = Issue(
            error_type="Lore_Conflict",
            severity=4,
            quote="Test quote",
            description="Test description"
        )
        print(f"✓ Issue model: {issue.error_type}")

        # Test ReaderFeedback model
        feedback = ReaderFeedback(
            reader_role="lore_keeper",
            immersion_score=8,
            emotional_watermark="engaged",
            issues=[issue]
        )
        print(f"✓ ReaderFeedback model: score={feedback.immersion_score}")

        return True
    except Exception as e:
        print(f"✗ Pydantic model test failed: {e}")
        return False


def test_file_manager():
    """Test file manager functionality."""
    print("\nTesting file manager...")

    from src.utils import FileManager

    try:
        fm = FileManager()
        print("✓ FileManager initialized")

        # Test write/read JSON
        test_data = {"test": "data", "number": 123}
        fm.write_json("test_config.json", test_data, version=False)
        print("✓ JSON write successful")

        read_data = fm.read_json("test_config.json")
        assert read_data == test_data
        print("✓ JSON read successful")

        # Test write/read text
        test_text = "This is a test draft content."
        fm.write_text("test_draft.txt", test_text, version=False)
        print("✓ Text write successful")

        read_text = fm.read_text("test_draft.txt")
        assert read_text == test_text
        print("✓ Text read successful")

        # Cleanup
        Path("test_config.json").unlink(missing_ok=True)
        Path("test_draft.txt").unlink(missing_ok=True)
        print("✓ Cleanup complete")

        return True
    except Exception as e:
        print(f"✗ File manager test failed: {e}")
        return False


def test_prompt_manager():
    """Test prompt manager functionality."""
    print("\nTesting prompt manager...")

    from src.utils import PromptManager

    try:
        pm = PromptManager()
        print("✓ PromptManager initialized")

        templates = pm.list_templates()
        print(f"✓ Found {len(templates)} templates")

        expected_templates = [
            "author_draft.j2",
            "reader_lore_keeper.j2",
            "reader_pacing_junkie.j2",
            "reader_anti_trope.j2",
            "editor_review.j2"
        ]

        for template in expected_templates:
            if template in templates:
                print(f"  ✓ {template}")
            else:
                print(f"  ✗ Missing: {template}")

        return True
    except Exception as e:
        print(f"✗ Prompt manager test failed: {e}")
        return False


def test_state_machine():
    """Test state machine functionality."""
    print("\nTesting state machine...")

    from src.core import NovelStateMachine

    try:
        sm = NovelStateMachine(max_retries=3)
        print(f"✓ State machine initialized: state={sm.state}")

        # Test state transitions
        sm.start()
        print(f"✓ start() -> state={sm.state}")

        sm.finish_draft()
        print(f"✓ finish_draft() -> state={sm.state}")

        sm.finish_review()
        print(f"✓ finish_review() -> state={sm.state}")

        # Test retry counter
        sm.increment_retry()
        sm.increment_retry()
        print(f"✓ Retry count: {sm.retry_count}/{sm.max_retries}")

        status = sm.get_status_summary()
        print(f"✓ Status: {status['state']}, retry={status['retry_count']}")

        return True
    except Exception as e:
        print(f"✗ State machine test failed: {e}")
        return False


def test_config_files():
    """Test that configuration files exist and are valid."""
    print("\nTesting configuration files...")

    config_files = [
        ("00_Config/book_meta.json", dict),
        ("01_Global_Settings/world_lore.json", dict),
        ("01_Global_Settings/characters.json", dict),
        ("02_Outlines/volume_01.md", str),
        ("02_Outlines/chapter_01_outline.json", dict),
    ]

    from src.utils import FileManager
    fm = FileManager()

    all_ok = True
    for file_path, expected_type in config_files:
        if fm.file_exists(file_path):
            content = fm.read_json(file_path) if file_path.endswith('.json') else fm.read_text(file_path)
            if content is not None:
                if expected_type == dict and isinstance(content, dict):
                    print(f"✓ {file_path}")
                elif expected_type == str and isinstance(content, str):
                    print(f"✓ {file_path}")
                else:
                    print(f"✗ {file_path} - wrong type")
                    all_ok = False
            else:
                print(f"✗ {file_path} - could not read")
                all_ok = False
        else:
            print(f"✗ {file_path} - not found")
            all_ok = False

    return all_ok


def main():
    """Run all tests."""
    print("=" * 60)
    print("AutoNovel-Studio System Test")
    print("=" * 60)

    tests = [
        test_imports,
        test_pydantic_models,
        test_file_manager,
        test_prompt_manager,
        test_state_machine,
        test_config_files
    ]

    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"\n✗ Test crashed: {e}")
            results.append(False)

    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")

    if passed == total:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
