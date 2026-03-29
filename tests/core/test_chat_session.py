"""Tests for brainstorm ChatSession persistence and message CRUD."""
import pytest
from src.core.chat_session import (
    load_session, save_session, append_messages,
    delete_messages, truncate_at, clear_session,
    update_lore, _estimate_tokens, _session_token_count,
)


@pytest.fixture(autouse=True)
def fake_books_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTONOVEL_DATA_DIR", str(tmp_path))
    return tmp_path


BOOK = "test_book"


# ── Load / Save basics ──

def test_load_empty_session():
    s = load_session(BOOK)
    assert s == {"messages": [], "summary": "", "lore": {}}


def test_save_and_load_roundtrip():
    session = {"messages": [{"id": "m1", "role": "user", "content": "hi"}], "summary": "x", "lore": {"title": "T"}}
    save_session(BOOK, session)
    loaded = load_session(BOOK)
    assert loaded["messages"][0]["content"] == "hi"
    assert loaded["summary"] == "x"
    assert loaded["lore"]["title"] == "T"


# ── Append messages ──

def test_append_messages_auto_id():
    s = append_messages(BOOK, [{"role": "user", "content": "hello"}])
    assert len(s["messages"]) == 1
    assert s["messages"][0]["id"].startswith("msg_")
    assert s["messages"][0]["ts"] > 0


def test_append_preserves_existing_id():
    s = append_messages(BOOK, [{"role": "user", "content": "x", "id": "custom_id"}])
    assert s["messages"][0]["id"] == "custom_id"


def test_append_multiple_rounds():
    append_messages(BOOK, [{"role": "user", "content": "q1"}])
    s = append_messages(BOOK, [{"role": "assistant", "content": "a1"}])
    assert len(s["messages"]) == 2
    assert s["messages"][0]["content"] == "q1"
    assert s["messages"][1]["content"] == "a1"


# ── Delete messages ──

def test_delete_messages():
    append_messages(BOOK, [
        {"role": "user", "content": "q1", "id": "id1"},
        {"role": "assistant", "content": "a1", "id": "id2"},
        {"role": "user", "content": "q2", "id": "id3"},
    ])
    s = delete_messages(BOOK, ["id1", "id2"])
    assert len(s["messages"]) == 1
    assert s["messages"][0]["id"] == "id3"


def test_delete_nonexistent_ids():
    append_messages(BOOK, [{"role": "user", "content": "x", "id": "id1"}])
    s = delete_messages(BOOK, ["nonexistent"])
    assert len(s["messages"]) == 1


# ── Truncate ──

def test_truncate_at_middle():
    append_messages(BOOK, [
        {"role": "user", "content": "msg1", "id": "id1"},
        {"role": "assistant", "content": "msg2", "id": "id2"},
        {"role": "user", "content": "msg3", "id": "id3"},
    ])
    s = truncate_at(BOOK, "id2")
    assert len(s["messages"]) == 1
    assert s["messages"][0]["id"] == "id1"
    assert s["truncated_content"] == "msg2"


def test_truncate_at_first():
    append_messages(BOOK, [
        {"role": "user", "content": "only", "id": "id1"},
    ])
    s = truncate_at(BOOK, "id1")
    assert len(s["messages"]) == 0
    assert s["truncated_content"] == "only"


def test_truncate_nonexistent_noop():
    append_messages(BOOK, [{"role": "user", "content": "x", "id": "id1"}])
    s = truncate_at(BOOK, "nonexistent")
    assert len(s["messages"]) == 1


# ── Clear ──

def test_clear_session():
    append_messages(BOOK, [{"role": "user", "content": "x"}])
    s = clear_session(BOOK)
    assert s == {"messages": [], "summary": "", "lore": {}}
    # Verify persisted
    assert load_session(BOOK)["messages"] == []


# ── Lore ──

def test_update_lore():
    s = update_lore(BOOK, {"title": "Test", "genre": "xianxia"})
    assert s["lore"]["title"] == "Test"
    assert s["lore"]["genre"] == "xianxia"


def test_update_lore_merge():
    update_lore(BOOK, {"title": "T"})
    s = update_lore(BOOK, {"genre": "wuxia"})
    assert s["lore"]["title"] == "T"
    assert s["lore"]["genre"] == "wuxia"


# ── Token estimation ──

def test_estimate_tokens_chinese():
    # 6 chars / 1.5 = 4 tokens
    assert _estimate_tokens("六个中文字符") == 4


def test_session_token_count():
    msgs = [
        {"content": "aaa"},  # 3 chars -> 2 tokens
        {"content": "bbb"},  # 3 chars -> 2 tokens
    ]
    assert _session_token_count(msgs) == 4
