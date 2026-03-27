import os
import json
from pathlib import Path

def _get_book_dir(book_id: str) -> Path:
    data_dir = os.environ.get("AUTONOVEL_DATA_DIR", "books")
    return Path(data_dir) / book_id

def read_file(book_id: str, relative_path: str) -> str:
    """Read a specific file from the book's directory."""
    book_dir = _get_book_dir(book_id)
    target_path = book_dir / relative_path
    
    # Security: prevent path traversal
    try:
        resolved_target = target_path.resolve()
        resolved_book = book_dir.resolve()
        if not str(resolved_target).startswith(str(resolved_book)):
            return f"Error: Access denied to path outside book directory."
    except Exception:
        return "Error: Invalid path."
        
    if not target_path.exists():
        return f"Error: File '{relative_path}' not found."
    if not target_path.is_file():
        return f"Error: '{relative_path}' is not a file."
        
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"

def search_lore(book_id: str, query: str) -> str:
    """Search for a character, location, or item in the lore JSONs."""
    book_dir = _get_book_dir(book_id)
    lore_dir = book_dir / "01_Global_Settings"
    
    results = []
    
    # Search characters
    char_file = lore_dir / "characters.json"
    if char_file.exists():
        try:
            with open(char_file, "r", encoding="utf-8") as f:
                chars = json.load(f)
                for name, data in chars.items():
                    if query.lower() in name.lower() or query.lower() in str(data).lower():
                        results.append(f"Character: {name}\n{json.dumps(data, ensure_ascii=False, indent=2)}")
        except Exception:
            pass
            
    # Search world lore
    world_file = lore_dir / "world_lore.json"
    if world_file.exists():
        try:
            with open(world_file, "r", encoding="utf-8") as f:
                world = json.load(f)
                for name, data in world.items():
                    if query.lower() in name.lower() or query.lower() in str(data).lower():
                        results.append(f"World Lore: {name}\n{json.dumps(data, ensure_ascii=False, indent=2)}")
        except Exception:
            pass
            
    if not results:
        return f"No matching lore entries found for '{query}'."
        
    return "\n\n".join(results)

def read_outline(book_id: str, volume: int = None) -> str:
    """Read the book's outline, optionally filtered by volume."""
    book_dir = _get_book_dir(book_id)
    outline_file = book_dir / "02_Outlines" / "outline.json"
    
    if not outline_file.exists():
        return "Error: Outline file not found."
        
    try:
        with open(outline_file, "r", encoding="utf-8") as f:
            outline_data = json.load(f)
            
        if volume is not None:
            # Try to find the specific volume
            volumes = outline_data.get("volumes", [])
            for vol in volumes:
                # Basic matching (could be improved)
                if str(volume) in str(vol.get("title", "")):
                    return json.dumps(vol, ensure_ascii=False, indent=2)
            return f"Error: Volume {volume} not found in outline."
            
        return json.dumps(outline_data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error reading outline: {e}"

def save_draft(book_id: str, file_path: str, content: str) -> str:
    """Save a draft to the book's drafts directory."""
    book_dir = _get_book_dir(book_id)
    target_path = book_dir / file_path

    # Security: prevent path traversal
    try:
        resolved_target = target_path.resolve()
        resolved_book = book_dir.resolve()
        if not str(resolved_target).startswith(str(resolved_book)):
            return "Error: Access denied to path outside book directory."
    except Exception:
        return "Error: Invalid path."

    # Create parent directories if needed
    target_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Draft saved to {file_path} ({len(content)} chars)"
    except Exception as e:
        return f"Error saving draft: {e}"

def submit_for_review(book_id: str, task_id: str, draft_text: str) -> str:
    """Submit a draft for editorial review by updating the task status."""
    from src.core.task_manager import update_task_status
    from src.core.models import TaskStatus

    try:
        updated = update_task_status(
            book_id, task_id,
            TaskStatus.EDITORIAL_REVIEW,
            payload_updates={"draft_text": draft_text}
        )
        return f"Task {task_id} submitted for editorial review."
    except Exception as e:
        return f"Error submitting for review: {e}"

# ── Skill Registry ──
# Each skill has a short description (shown to the agent) and a file path (loaded on demand)

_SKILL_DIR = Path(__file__).parent.parent.parent / "prompts"

SKILL_REGISTRY = {
    "iceberg_writing": {
        "file": "skill_iceberg_writing.md",
        "description": (
            "冰山写作法：五层创作方法论，包括信息差地图、潜台词推演、白描铁律、"
            "节奏呼吸控制、AI脏词黑名单。写正文之前必须先加载此skill。"
        )
    },
    "lore_compliance": {
        "file": "skill_lore_compliance.md",
        "description": (
            "设定忠实度约束：零添加原则、数据库即圣经、时间线一致性、人设锁定。"
            "引用角色/地点/物品设定时加载此skill。"
        )
    }
}

def load_skill(skill_name: str) -> str:
    """Load a writing skill's full content by name."""
    if skill_name not in SKILL_REGISTRY:
        available = ", ".join(SKILL_REGISTRY.keys())
        return f"Error: Unknown skill '{skill_name}'. Available skills: {available}"
    
    skill_info = SKILL_REGISTRY[skill_name]
    skill_path = _SKILL_DIR / skill_info["file"]
    
    if not skill_path.exists():
        return f"Error: Skill file not found at {skill_path}"
    
    try:
        return skill_path.read_text(encoding="utf-8")
    except Exception as e:
        return f"Error loading skill: {e}"

def list_skills() -> str:
    """List all available skills with their descriptions."""
    lines = []
    for name, info in SKILL_REGISTRY.items():
        lines.append(f"- {name}: {info['description']}")
    return "\n".join(lines)

# ── OpenAI Tool Schemas ──

AUTHOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a specific file from the book's directory. Use this to read specific chapters or documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "relative_path": {
                        "type": "string",
                        "description": "The relative path to the file, e.g., '04_Drafts/chapter_1.txt' or '02_Outlines/outline.json'."
                    }
                },
                "required": ["relative_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_lore",
            "description": "Search the book's lore (characters, world settings) for a specific keyword or name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The keyword to search for, e.g., 'Vera', 'Magic System', or 'Sword of Light'."
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_outline",
            "description": "Read the book's overall outline or a specific volume's outline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "volume": {
                        "type": "integer",
                        "description": "The volume number to read (optional). If not provided, reads the entire outline."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "load_skill",
            "description": (
                "Load a writing skill/methodology by name. Available skills: "
                "'iceberg_writing' (冰山写作法：写正文前必须先调用), "
                "'lore_compliance' (设定忠实度约束：引用设定时调用)"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The skill name to load, e.g., 'iceberg_writing'."
                    }
                },
                "required": ["skill_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_draft",
            "description": "Save draft text to a file in the book's directory. Call this after writing your prose.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative path within the book directory, e.g., '04_Drafts/ch1_s1.md'."
                    },
                    "content": {
                        "type": "string",
                        "description": "The full draft text content to save."
                    }
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_for_review",
            "description": "Submit the draft for editorial review. Call this after saving the draft to advance the task to the editor.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "The ID of the current task being worked on."
                    },
                    "draft_text": {
                        "type": "string",
                        "description": "The full draft text to submit for review."
                    }
                },
                "required": ["task_id", "draft_text"]
            }
        }
    }
]
