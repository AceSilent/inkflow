"""Tests for BookPathManager path resolution and directory creation.

Note: BookManager.create_book() is currently broken due to model drift
(BookState is an Enum but book_manager.py treats it as a BaseModel).
This is tracked as legacy debt. Tests here focus on the working parts.
"""
import pytest
from pathlib import Path
from src.core.book_manager import BookPathManager


@pytest.fixture
def pm(tmp_path):
    """BookPathManager rooted at a temp directory."""
    return BookPathManager(library_root=str(tmp_path))


# ── Library Root ──

def test_library_root(pm, tmp_path):
    assert pm.get_library_root() == Path(tmp_path)


def test_book_dir(pm, tmp_path):
    assert pm.get_book_dir("book_001") == tmp_path / "book_001"


# ── Listing ──

def test_list_empty(pm):
    assert pm.list_all_books() == []


def test_list_books_sorted(pm, tmp_path):
    (tmp_path / "book_c").mkdir()
    (tmp_path / "book_a").mkdir()
    (tmp_path / "book_b").mkdir()
    (tmp_path / "readme.txt").write_text("ignore me")
    books = pm.list_all_books()
    assert books == ["book_a", "book_b", "book_c"]


def test_list_books_ignores_files(pm, tmp_path):
    (tmp_path / "not_a_book.json").write_text("{}")
    assert pm.list_all_books() == []


# ── Config Paths ──

def test_config_dir(pm, tmp_path):
    assert pm.get_config_dir("b") == tmp_path / "b" / "00_Config"


def test_book_meta_path(pm):
    p = pm.get_book_meta_path("b")
    assert p.name == "book_meta.json"
    assert "00_Config" in str(p)


def test_book_state_path(pm):
    p = pm.get_book_state_path("b")
    assert p.name == "book_state.json"
    assert "00_Config" in str(p)


# ── Global Settings Paths ──

def test_global_settings_dir(pm, tmp_path):
    assert pm.get_global_settings_dir("b") == tmp_path / "b" / "01_Global_Settings"


def test_world_lore_path(pm):
    p = pm.get_world_lore_path("b")
    assert p.name == "world_lore.json"


def test_characters_path(pm):
    p = pm.get_characters_path("b")
    assert p.name == "characters.json"


# ── Outline Paths ──

def test_volume_outline_path(pm):
    assert pm.get_volume_outline_path("b", 1).name == "volume_01.md"
    assert pm.get_volume_outline_path("b", 12).name == "volume_12.md"


def test_chapter_outline_path(pm):
    assert pm.get_chapter_outline_path("b", 3).name == "chapter_03_outline.json"


def test_scene_outline_path(pm):
    p = pm.get_scene_outline_path("b", 2, 4)
    assert p.name == "chapter_02_scene_4_outline.json"


# ── Draft Paths ──

def test_drafts_dir(pm, tmp_path):
    assert pm.get_drafts_dir("b") == tmp_path / "b" / "04_Drafts"


def test_chapter_drafts_dir(pm):
    d = pm.get_chapter_drafts_dir("b", 5)
    assert "ch05" in str(d)


def test_scene_draft_path(pm):
    p = pm.get_scene_draft_path("b", 1, 2, 3)
    assert p.name == "scene_02_v3.txt"
    assert "ch01" in str(p)


def test_latest_scene_draft_path(pm):
    p = pm.get_latest_scene_draft_path("b", 1, 2, 1)
    assert p.name == "scene_02.txt"


# ── Review Paths ──

def test_scene_review_path(pm):
    p = pm.get_scene_review_path("b", 1, 2, 3)
    assert p.name == "scene_02_v3_reviews.json"
    assert "ch01" in str(p)


def test_scene_editor_path(pm):
    p = pm.get_scene_editor_path("b", 1, 2, 3)
    assert p.name == "scene_02_v3_editor.json"


# ── Backup ──

def test_backup_dir(pm, tmp_path):
    assert pm.get_backup_dir("b") == tmp_path / "b" / ".backup"


def test_timestamped_backup_path(pm):
    p = pm.get_timestamped_backup_path("b", "test.json")
    assert "test.json_" in str(p)
    assert ".backup" in str(p)


# ── Directory Structure Creation ──

def test_create_book_directory_structure(pm, tmp_path):
    pm.create_book_directory_structure("novel_001")
    root = tmp_path / "novel_001"
    expected_dirs = [
        "00_Config",
        "01_Global_Settings",
        "02_Outlines",
        "03_Story_Memory",
        "03_Story_Memory/recent_chapters",
        "04_Drafts",
        "05_Reviews",
        ".backup",
    ]
    for d in expected_dirs:
        assert (root / d).is_dir(), f"Missing directory: {d}"


def test_create_book_directory_idempotent(pm, tmp_path):
    """Creating structure twice should not fail."""
    pm.create_book_directory_structure("b")
    pm.create_book_directory_structure("b")
    assert (tmp_path / "b" / "00_Config").is_dir()


def test_create_multiple_books(pm, tmp_path):
    pm.create_book_directory_structure("book_1")
    pm.create_book_directory_structure("book_2")
    books = pm.list_all_books()
    assert len(books) == 2
