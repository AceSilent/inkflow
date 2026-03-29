"""Tests for BookPathManager and BookManager (CRUD).

BookManager model drift was fixed in Round 6 — BookState is now a proper
BaseModel and BookMetadata has all required fields.
"""
import pytest
from pathlib import Path
from src.core.book_manager import BookPathManager, BookManager
from src.core.models import BookMetadata, BookState


@pytest.fixture
def pm(tmp_path):
    """BookPathManager rooted at a temp directory."""
    return BookPathManager(library_root=str(tmp_path))


@pytest.fixture
def bm(pm):
    """BookManager backed by a temp BookPathManager."""
    return BookManager(path_manager=pm)


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


# ═══════════════════════════════════════════════════════════════
# BookManager CRUD Tests
# ═══════════════════════════════════════════════════════════════

def test_create_book(bm, pm):
    meta = bm.create_book("bk_001", "Test Novel", "xianxia",
                          ["cultivation", "revenge"], "dark", ["harem"])
    assert isinstance(meta, BookMetadata)
    assert meta.book_id == "bk_001"
    assert meta.title == "Test Novel"
    assert meta.genre == "xianxia"
    assert meta.sub_genres == ["cultivation", "revenge"]
    assert meta.status == "planning"
    assert pm.get_book_meta_path("bk_001").exists()
    assert pm.get_book_state_path("bk_001").exists()


def test_create_book_default_word_count(bm):
    meta = bm.create_book("bk", "T", "g", [], "t", [])
    assert meta.target_word_count == {"chapter": 3000, "scene": 800}


def test_create_book_custom_word_count(bm):
    meta = bm.create_book("bk", "T", "g", [], "t", [],
                          target_word_count={"chapter": 5000, "scene": 1200})
    assert meta.target_word_count["chapter"] == 5000


def test_load_book_metadata(bm):
    bm.create_book("bk", "Title", "genre", [], "tone", [])
    loaded = bm.load_book_metadata("bk")
    assert loaded is not None
    assert loaded.title == "Title"


def test_load_book_metadata_not_found(bm):
    assert bm.load_book_metadata("nonexistent") is None


def test_load_book_state(bm):
    bm.create_book("bk", "T", "g", [], "t", [])
    state = bm.load_book_state("bk")
    assert isinstance(state, BookState)
    assert state.book_id == "bk"
    assert state.current_chapter == 1
    assert state.current_scene == 1


def test_load_book_state_not_found(bm):
    assert bm.load_book_state("nonexistent") is None


def test_update_book_metadata(bm):
    bm.create_book("bk", "Old Title", "genre", [], "tone", [])
    bm.update_book_metadata("bk", title="New Title", status="active")
    loaded = bm.load_book_metadata("bk")
    assert loaded.title == "New Title"
    assert loaded.status == "active"


def test_update_book_metadata_not_found(bm):
    with pytest.raises(ValueError, match="Book not found"):
        bm.update_book_metadata("nonexistent", title="X")


def test_list_books(bm):
    bm.create_book("bk1", "Book One", "xianxia", [], "dark", [])
    bm.create_book("bk2", "Book Two", "wuxia", [], "light", [])
    books = bm.list_books()
    assert len(books) == 2
    titles = [b["title"] for b in books]
    assert "Book One" in titles
    assert "Book Two" in titles


def test_list_books_empty(bm):
    assert bm.list_books() == []


def test_delete_book_requires_confirm(bm):
    bm.create_book("bk", "T", "g", [], "t", [])
    with pytest.raises(ValueError, match="confirm=True"):
        bm.delete_book("bk", confirm=False)
    assert bm.load_book_metadata("bk") is not None


def test_delete_book(bm, pm):
    bm.create_book("bk", "T", "g", [], "t", [])
    bm.delete_book("bk", confirm=True)
    assert not pm.get_book_dir("bk").exists()
    assert bm.load_book_metadata("bk") is None
