"""Tests for GroupChat dual-layer storage (full history + context window)."""
import json
import os
import pytest
from unittest.mock import patch
from src.core.groupchat_storage import (
    load_full_history, append_full_history,
    load_context, save_context, append_context_messages,
    build_llm_context, list_channels, make_msg_id,
    DEFAULT_CHANNELS,
)


@pytest.fixture(autouse=True)
def fake_books_dir(tmp_path, monkeypatch):
    """Point AUTONOVEL_DATA_DIR to tmp for all tests."""
    monkeypatch.setenv("AUTONOVEL_DATA_DIR", str(tmp_path))
    return tmp_path


BOOK = "test_book"


# ── Message ID ──

def test_make_msg_id_format():
    msg_id = make_msg_id()
    assert msg_id.startswith("gc_")
    assert len(msg_id) == 11  # "gc_" + 8 hex chars


def test_make_msg_id_unique():
    ids = {make_msg_id() for _ in range(100)}
    assert len(ids) == 100


# ── Full History (append-only, never delete) ──

def test_load_full_history_empty():
    msgs = load_full_history(BOOK)
    assert msgs == []


def test_append_and_load_full_history():
    msgs = [{"role": "human", "content": "hello"}]
    append_full_history(BOOK, msgs)

    loaded = load_full_history(BOOK)
    assert len(loaded) == 1
    assert loaded[0]["content"] == "hello"
    assert loaded[0]["id"].startswith("gc_")
    assert loaded[0]["ts"] > 0


def test_append_full_history_preserves_existing():
    append_full_history(BOOK, [{"role": "human", "content": "msg1"}])
    append_full_history(BOOK, [{"role": "author", "content": "msg2"}])

    loaded = load_full_history(BOOK)
    assert len(loaded) == 2
    assert loaded[0]["content"] == "msg1"
    assert loaded[1]["content"] == "msg2"


def test_append_full_history_preserves_existing_id():
    msgs = [{"role": "human", "content": "hi", "id": "custom_id_123"}]
    append_full_history(BOOK, msgs)

    loaded = load_full_history(BOOK)
    assert loaded[0]["id"] == "custom_id_123"


# ── Context Window (compressed LLM layer) ──

def test_load_context_empty():
    ctx = load_context(BOOK)
    assert ctx == {"messages": [], "summary": ""}


def test_save_and_load_context():
    ctx = {"messages": [{"role": "author", "content": "draft"}], "summary": "prior talk"}
    save_context(BOOK, ctx)

    loaded = load_context(BOOK)
    assert loaded["summary"] == "prior talk"
    assert len(loaded["messages"]) == 1


def test_append_context_messages():
    append_context_messages(BOOK, [{"role": "human", "content": "q1"}])
    append_context_messages(BOOK, [{"role": "author", "content": "a1"}])

    ctx = load_context(BOOK)
    assert len(ctx["messages"]) == 2
    assert ctx["messages"][0]["content"] == "q1"
    assert ctx["messages"][1]["content"] == "a1"


def test_append_context_auto_fills_id_and_ts():
    append_context_messages(BOOK, [{"role": "human", "content": "test"}])
    ctx = load_context(BOOK)
    msg = ctx["messages"][0]
    assert msg["id"].startswith("gc_")
    assert msg["ts"] > 0


# ── LLM Context Builder ──

def test_build_llm_context_empty():
    result = build_llm_context(BOOK)
    assert result == ""


def test_build_llm_context_with_summary():
    ctx = {"messages": [], "summary": "They discussed the plot."}
    save_context(BOOK, ctx)

    result = build_llm_context(BOOK)
    assert "They discussed the plot." in result
    assert "[历史摘要]" in result


def test_build_llm_context_with_messages():
    ctx = {
        "messages": [
            {"role": "human", "content": "Let's plan chapter 1"},
            {"role": "author", "content": "I suggest starting with..."},
        ],
        "summary": "",
    }
    save_context(BOOK, ctx)

    result = build_llm_context(BOOK)
    assert "[近期对话]" in result
    assert "Let's plan chapter 1" in result
    assert "[Human]" in result
    assert "[Author]" in result


def test_build_llm_context_pass_message():
    ctx = {
        "messages": [{"role": "devil", "content": "", "is_pass": True}],
        "summary": "",
    }
    save_context(BOOK, ctx)

    result = build_llm_context(BOOK)
    assert "PASS" in result


# ── Channel Management ──

def test_default_channels_exist():
    assert len(DEFAULT_CHANNELS) >= 5
    ids = [c["channel_id"] for c in DEFAULT_CHANNELS]
    assert "group" in ids
    assert "human_author" in ids


def test_list_channels_with_counts(fake_books_dir):
    # Create a channel with messages
    append_full_history(BOOK, [
        {"role": "human", "content": "hi"},
        {"role": "author", "content": "hello"},
    ])

    channels = list_channels(BOOK)
    group = next(c for c in channels if c["channel_id"] == "group")
    assert group["message_count"] == 2


def test_list_channels_empty_book():
    channels = list_channels(BOOK)
    assert all(c["message_count"] == 0 for c in channels)
