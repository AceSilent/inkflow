"""
AutoNovel-Studio v5.0 — Two-Tier Agent Memory System.

Project Memory (Episodic): Per-book, isolated. Stores world-building, characters, plot progress.
Core Memory (Semantic): Cross-book, persistent. Stores writing principles, user preferences, skills.

Read-write rules:
- Project memory: read+write during current book's creation
- Core memory: read-only during sessions; updated ONLY via Memory Reflection at volume completion
"""
import json
import time
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from src.core.models import WritingPrinciple

logger = logging.getLogger(__name__)


def _books_dir() -> Path:
    import os
    return Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


def _global_dir() -> Path:
    """Global directory for cross-book core memory."""
    d = _books_dir().parent / "global" / "core_memory"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ══════════════════════════════════════════════════════════════
#  PROJECT MEMORY (Episodic — per-book, isolated)
# ══════════════════════════════════════════════════════════════

def _project_memory_dir(book_id: str) -> Path:
    d = _books_dir() / book_id / "memory"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_project_memory(book_id: str) -> Dict[str, Any]:
    """Load all project memory for a book. Returns aggregated dict."""
    mem_dir = _project_memory_dir(book_id)
    result = {}
    for fname in ["decided_facts.json", "plot_progress.json",
                   "world_state.json", "character_states.json"]:
        fp = mem_dir / fname
        if fp.exists():
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data:
                        key = fname.replace(".json", "")
                        result[key] = data
            except Exception as e:
                logger.warning(f"Failed to load {fp}: {e}")
    return result


def save_project_memory_field(book_id: str, field: str, data: Any):
    """Save a specific project memory field."""
    mem_dir = _project_memory_dir(book_id)
    fp = mem_dir / f"{field}.json"
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Project memory saved: {book_id}/{field}")


def update_decided_facts(book_id: str, facts: Dict[str, str]):
    """Add or update decided facts for a book (append-only merge)."""
    mem_dir = _project_memory_dir(book_id)
    fp = mem_dir / "decided_facts.json"
    existing = {}
    if fp.exists():
        with open(fp, "r", encoding="utf-8") as f:
            existing = json.load(f)
    existing.update(facts)
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def update_plot_progress(book_id: str, chapter_id: str, summary: str):
    """Record plot progress after a chapter is completed."""
    mem_dir = _project_memory_dir(book_id)
    fp = mem_dir / "plot_progress.json"
    progress = []
    if fp.exists():
        with open(fp, "r", encoding="utf-8") as f:
            progress = json.load(f)
    progress.append({
        "chapter_id": chapter_id,
        "summary": summary,
        "ts": time.time(),
    })
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def update_character_states(book_id: str, characters: Dict[str, Any]):
    """Update character states after a chapter."""
    save_project_memory_field(book_id, "character_states", characters)


def update_world_state(book_id: str, world: Dict[str, Any]):
    """Update world state snapshot."""
    save_project_memory_field(book_id, "world_state", world)


# ══════════════════════════════════════════════════════════════
#  CORE MEMORY (Semantic — cross-book, persistent, read-only in-session)
# ══════════════════════════════════════════════════════════════

CORE_MEMORY_FILES = [
    "writing_principles.json",
    "user_preferences.json",
    "craft_skills.json",
    "anti_patterns.json",
]


def load_core_memory() -> Dict[str, Any]:
    """Load all core memory files (read-only during sessions)."""
    gdir = _global_dir()
    result = {}
    for fname in CORE_MEMORY_FILES:
        fp = gdir / fname
        if fp.exists():
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data:
                        key = fname.replace(".json", "")
                        result[key] = data
            except Exception as e:
                logger.warning(f"Failed to load core memory {fp}: {e}")
    return result


def _save_core_memory_file(fname: str, data: Any):
    """Internal: save a core memory file. Only called by Memory Reflection."""
    fp = _global_dir() / fname
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Core memory saved: {fname}")


def get_writing_principles() -> List[Dict]:
    """Get all writing principles, sorted by confidence."""
    fp = _global_dir() / "writing_principles.json"
    if not fp.exists():
        return []
    with open(fp, "r", encoding="utf-8") as f:
        principles = json.load(f)
    return sorted(principles, key=lambda p: p.get("confidence", 0), reverse=True)


def get_user_preferences() -> Dict[str, Any]:
    """Get user preferences."""
    fp = _global_dir() / "user_preferences.json"
    if not fp.exists():
        return {}
    with open(fp, "r", encoding="utf-8") as f:
        return json.load(f)


# ══════════════════════════════════════════════════════════════
#  MEMORY CONTEXT BUILDER (injected into Agent system prompts)
# ══════════════════════════════════════════════════════════════

MAX_CORE_MEMORY_TOKENS = 2000  # ~20% of typical system prompt budget


def build_memory_context(book_id: str) -> str:
    """Build the full memory context string for injection into Agent system prompts.
    Includes both core memory (cross-book) and project memory (current book)."""
    parts = []

    # Core memory (read-only, sorted by confidence)
    core = load_core_memory()

    # Writing principles — highest priority
    principles = get_writing_principles()
    if principles:
        top_principles = principles[:10]  # Top 10 by confidence
        rules = "\n".join(
            f"- [{p.get('confidence', 0):.1f}] {p['principle']}"
            for p in top_principles
        )
        parts.append(f"[核心记忆·写作原则]\n{rules}")

    # User preferences
    prefs = get_user_preferences()
    if prefs:
        pref_lines = "\n".join(f"- {k}: {v}" for k, v in prefs.items())
        parts.append(f"[核心记忆·用户偏好]\n{pref_lines}")

    # Craft skills
    if "craft_skills" in core:
        skills = core["craft_skills"]
        if isinstance(skills, list):
            skill_text = "\n".join(f"- {s}" for s in skills[:5])
        elif isinstance(skills, dict):
            skill_text = "\n".join(f"- {k}: {v}" for k, v in list(skills.items())[:5])
        else:
            skill_text = str(skills)[:300]
        parts.append(f"[核心记忆·技能积累]\n{skill_text}")

    # Anti-patterns
    if "anti_patterns" in core:
        antis = core["anti_patterns"]
        if isinstance(antis, list):
            anti_text = "\n".join(f"- ❌ {a}" for a in antis[:5])
        elif isinstance(antis, dict):
            anti_text = "\n".join(f"- ❌ {k}: {v}" for k, v in list(antis.items())[:5])
        else:
            anti_text = str(antis)[:300]
        parts.append(f"[核心记忆·反模式]\n{anti_text}")

    # Project memory (current book only)
    project = load_project_memory(book_id)

    if "decided_facts" in project:
        facts = project["decided_facts"]
        fact_text = "\n".join(f"- {k}: {v}" for k, v in list(facts.items())[:10])
        parts.append(f"[项目记忆·已确定设定]\n{fact_text}")

    if "plot_progress" in project:
        progress = project["plot_progress"]
        if isinstance(progress, list):
            recent = progress[-5:]  # Last 5 chapters
            prog_text = "\n".join(
                f"- {p.get('chapter_id', '?')}: {p.get('summary', '')[:100]}"
                for p in recent
            )
            parts.append(f"[项目记忆·剧情进展]\n{prog_text}")

    if "character_states" in project:
        chars = project["character_states"]
        if isinstance(chars, dict):
            char_text = json.dumps(chars, ensure_ascii=False)[:500]
            parts.append(f"[项目记忆·角色状态]\n{char_text}")

    return "\n\n".join(parts) if parts else ""


# ══════════════════════════════════════════════════════════════
#  MEMORY REFLECTION (triggered at volume completion)
# ══════════════════════════════════════════════════════════════

async def run_memory_reflection(book_id: str, volume_id: str = ""):
    """
    Extract 1-2 writing principles from a completed volume.
    Triggered when a volume's all chapters are finalized.
    
    Process:
    1. Collect all editing history for this volume
    2. Collect any rejected/rewritten chapters
    3. Feed to Reflection Agent
    4. Extract 1-2 new WritingPrinciple entries
    5. Append to global/core_memory/writing_principles.json
    """
    from src.core.llm_factory import get_llm_client

    logger.info(f"Starting Memory Reflection for {book_id} volume={volume_id}")

    # Gather context for reflection
    book_dir = _books_dir() / book_id
    reflection_context_parts = []

    # 1. Load book metadata
    meta_file = book_dir / "book_meta.json"
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as f:
            meta = json.load(f)
            reflection_context_parts.append(
                f"书名: {meta.get('title', '?')} | 类型: {meta.get('genre', '?')}"
            )

    # 2. Load chat history for editing patterns
    chat_dir = book_dir / "brainstorm" / "channels" / "group"
    full_file = chat_dir / "chat_full.json"
    if full_file.exists():
        with open(full_file, "r", encoding="utf-8") as f:
            messages = json.load(f).get("messages", [])
            # Focus on editor messages (corrections/feedback)
            editor_msgs = [m for m in messages if m.get("role") == "editor" and not m.get("is_pass")]
            if editor_msgs:
                editor_text = "\n".join(
                    f"编辑反馈: {m.get('content', '')[:200]}" for m in editor_msgs[-10:]
                )
                reflection_context_parts.append(f"[编辑修改记录]\n{editor_text}")

    # 3. Load plot progress
    project_mem = load_project_memory(book_id)
    if "plot_progress" in project_mem:
        progress = project_mem["plot_progress"]
        if isinstance(progress, list) and progress:
            prog_text = "\n".join(
                f"- {p.get('chapter_id', '?')}: {p.get('summary', '')[:80]}"
                for p in progress[-10:]
            )
            reflection_context_parts.append(f"[剧情进展]\n{prog_text}")

    if not reflection_context_parts:
        logger.warning(f"No context for reflection on {book_id}")
        return []

    reflection_context = "\n\n".join(reflection_context_parts)

    # 4. Call LLM to extract principles
    try:
        llm = get_llm_client("author")
        raw = await llm.generate_text(
            system_prompt=(
                "你是写作经验提炼专家。分析以下一卷小说的创作过程，"
                "提炼出1-2条通用的写作原则（不局限于这本书）。\n"
                "每条原则必须包含：\n"
                "- principle: 简洁的原则描述（20字以内）\n"
                "- source: 来源描述\n"
                "- confidence: 置信度 0-1\n"
                "- example_good: 正面示例\n"
                "- example_bad: 反面示例\n"
                "以JSON数组格式输出。"
            ),
            user_prompt=f"创作过程：\n{reflection_context}",
            temperature=0.4,
            max_tokens=800,
        )
    except Exception as e:
        logger.error(f"Memory Reflection LLM call failed: {e}")
        return []

    # 5. Parse and save
    import re
    new_principles = []
    try:
        # Try direct JSON parse
        parsed = json.loads(raw.strip())
        if isinstance(parsed, list):
            new_principles = parsed
        elif isinstance(parsed, dict) and "principles" in parsed:
            new_principles = parsed["principles"]
    except (json.JSONDecodeError, ValueError):
        # Try extracting from markdown code block
        m = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', raw, re.DOTALL)
        if m:
            try:
                new_principles = json.loads(m.group(1).strip())
            except (json.JSONDecodeError, ValueError):
                pass

    if not new_principles:
        logger.warning(f"No principles extracted from reflection for {book_id}")
        return []

    # Load existing principles
    existing = get_writing_principles()
    existing_texts = {p.get("principle", "") for p in existing}

    # Deduplicate and add IDs
    added = []
    for p in new_principles:
        if not isinstance(p, dict) or not p.get("principle"):
            continue
        if p["principle"] in existing_texts:
            continue  # Skip duplicate
        wp = {
            "id": f"wp_{len(existing) + len(added) + 1:03d}",
            "principle": p["principle"],
            "source": p.get("source", f"{book_id} · {volume_id}"),
            "confidence": min(max(float(p.get("confidence", 0.5)), 0.0), 1.0),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "example_good": p.get("example_good", ""),
            "example_bad": p.get("example_bad", ""),
        }
        added.append(wp)

    if added:
        all_principles = existing + added
        _save_core_memory_file("writing_principles.json", all_principles)
        logger.info(f"Memory Reflection: added {len(added)} principles for {book_id}")

        # Log to reflection_log.json
        log_file = _global_dir() / "reflection_log.json"
        log_entries = []
        if log_file.exists():
            with open(log_file, "r", encoding="utf-8") as f:
                log_entries = json.load(f)
        log_entries.append({
            "book_id": book_id,
            "volume_id": volume_id,
            "principles_added": len(added),
            "principles": [a["principle"] for a in added],
            "ts": time.time(),
        })
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_entries, f, ensure_ascii=False, indent=2)

    return added


# ══════════════════════════════════════════════════════════════
#  INITIALIZATION (bootstrap empty core memory files)
# ══════════════════════════════════════════════════════════════

def ensure_core_memory_initialized():
    """Create empty core memory files if they don't exist."""
    gdir = _global_dir()
    defaults = {
        "writing_principles.json": [],
        "user_preferences.json": {},
        "craft_skills.json": [],
        "anti_patterns.json": [],
        "reflection_log.json": [],
    }
    for fname, default in defaults.items():
        fp = gdir / fname
        if not fp.exists():
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(default, f, ensure_ascii=False, indent=2)
            logger.info(f"Initialized core memory: {fname}")
