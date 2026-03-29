"""Tests for the two-tier Agent Memory System (project + core)."""
import json
import pytest
from src.core.agent_memory import (
    load_project_memory, save_project_memory_field,
    update_decided_facts, update_plot_progress,
    update_character_states, update_world_state,
    load_core_memory, get_writing_principles, get_user_preferences,
    build_memory_context, ensure_core_memory_initialized,
    _save_core_memory_file,
)


@pytest.fixture(autouse=True)
def fake_dirs(tmp_path, monkeypatch):
    """Isolate both books/ and global/ directories."""
    books = tmp_path / "books"
    books.mkdir()
    monkeypatch.setenv("AUTONOVEL_DATA_DIR", str(books))
    return tmp_path


BOOK = "test_book"


# ═══════════════════════════════════
# Project Memory (Episodic)
# ═══════════════════════════════════

def test_load_empty_project_memory():
    assert load_project_memory(BOOK) == {}


def test_save_and_load_project_field():
    save_project_memory_field(BOOK, "decided_facts", {"hero_name": "Lin Chen"})
    mem = load_project_memory(BOOK)
    assert mem["decided_facts"]["hero_name"] == "Lin Chen"


def test_update_decided_facts_merge():
    update_decided_facts(BOOK, {"fact1": "Earth is flat"})
    update_decided_facts(BOOK, {"fact2": "Magic exists"})
    mem = load_project_memory(BOOK)
    assert len(mem["decided_facts"]) == 2


def test_update_decided_facts_overwrite():
    update_decided_facts(BOOK, {"fact1": "v1"})
    update_decided_facts(BOOK, {"fact1": "v2"})
    mem = load_project_memory(BOOK)
    assert mem["decided_facts"]["fact1"] == "v2"


def test_update_plot_progress():
    update_plot_progress(BOOK, "ch01", "Hero enters the sect")
    update_plot_progress(BOOK, "ch02", "First trial begins")
    mem = load_project_memory(BOOK)
    assert len(mem["plot_progress"]) == 2
    assert mem["plot_progress"][0]["chapter_id"] == "ch01"
    assert mem["plot_progress"][1]["summary"] == "First trial begins"
    assert mem["plot_progress"][0]["ts"] > 0


def test_update_character_states():
    chars = {"Lin Chen": {"level": 3, "alive": True}}
    update_character_states(BOOK, chars)
    mem = load_project_memory(BOOK)
    assert mem["character_states"]["Lin Chen"]["level"] == 3


def test_update_world_state():
    world = {"current_era": "Chaos", "active_factions": ["Azure", "Crimson"]}
    update_world_state(BOOK, world)
    mem = load_project_memory(BOOK)
    assert mem["world_state"]["current_era"] == "Chaos"


# ═══════════════════════════════════
# Core Memory (Semantic)
# ═══════════════════════════════════

def test_load_empty_core_memory():
    assert load_core_memory() == {}


def test_get_writing_principles_empty():
    assert get_writing_principles() == []


def test_get_user_preferences_empty():
    assert get_user_preferences() == {}


def test_save_and_get_writing_principles():
    principles = [
        {"principle": "Show dont tell", "confidence": 0.9},
        {"principle": "Avoid info dumps", "confidence": 0.7},
    ]
    _save_core_memory_file("writing_principles.json", principles)
    loaded = get_writing_principles()
    assert len(loaded) == 2
    # Should be sorted by confidence descending
    assert loaded[0]["confidence"] == 0.9
    assert loaded[1]["confidence"] == 0.7


def test_save_and_get_user_preferences():
    _save_core_memory_file("user_preferences.json", {"tone": "dark", "pov": "third"})
    prefs = get_user_preferences()
    assert prefs["tone"] == "dark"


def test_ensure_core_memory_initialized():
    ensure_core_memory_initialized()
    # Should create all files
    assert get_writing_principles() == []
    assert get_user_preferences() == {}
    core = load_core_memory()
    assert "craft_skills" not in core  # empty arrays are falsy so excluded
    # Calling again should be idempotent
    ensure_core_memory_initialized()


# ═══════════════════════════════════
# Memory Context Builder
# ═══════════════════════════════════

def test_build_memory_context_empty():
    assert build_memory_context(BOOK) == ""


def test_build_memory_context_with_project_memory():
    update_decided_facts(BOOK, {"hero": "Lin Chen", "sect": "Azure Cloud"})
    update_plot_progress(BOOK, "ch01", "Hero enters sect")
    ctx = build_memory_context(BOOK)
    assert "[Lin Chen]" in ctx or "Lin Chen" in ctx
    assert "ch01" in ctx


def test_build_memory_context_with_core_memory():
    _save_core_memory_file("writing_principles.json", [
        {"principle": "Show dont tell", "confidence": 0.9}
    ])
    _save_core_memory_file("user_preferences.json", {"tone": "dark"})
    ctx = build_memory_context(BOOK)
    assert "Show dont tell" in ctx
    assert "dark" in ctx


def test_build_memory_context_with_anti_patterns():
    _save_core_memory_file("anti_patterns.json", ["Purple prose", "Info dumps"])
    ctx = build_memory_context(BOOK)
    assert "Purple prose" in ctx
    assert "[X]" in ctx  # bracket tag format


def test_build_memory_context_combined():
    """Full integration: both project and core memory."""
    update_decided_facts(BOOK, {"hero": "Lin Chen"})
    _save_core_memory_file("writing_principles.json", [
        {"principle": "Economy of words", "confidence": 0.85}
    ])
    ctx = build_memory_context(BOOK)
    assert "Lin Chen" in ctx
    assert "Economy of words" in ctx
