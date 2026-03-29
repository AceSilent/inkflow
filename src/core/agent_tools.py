"""
Agent Tools — tools and skill registry for the Author Agent.

Three-layer progressive disclosure:
  L0: Core principles (in system prompt, not here)
  L1: Methodology skills (loaded on demand via load_skill)
  L2: Task suggestions (in workflow engine, not here)
"""
import os
import json
from pathlib import Path

from src.core.plot_tree import PlotTree
from src.core.models import NodeType


def _get_book_dir(book_id: str) -> Path:
    data_dir = os.environ.get("AUTONOVEL_DATA_DIR", "books")
    return Path(data_dir) / book_id


# ── Existing tools (unchanged logic) ──

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


def save_outline(book_id: str, outline_json: str) -> str:
    """Save/update the book's outline."""
    book_dir = _get_book_dir(book_id)
    outline_dir = book_dir / "02_Outlines"
    outline_dir.mkdir(parents=True, exist_ok=True)
    outline_file = outline_dir / "outline.json"

    try:
        data = json.loads(outline_json)
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON — {e}"

    try:
        with open(outline_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return f"Outline saved ({len(outline_json)} chars)"
    except Exception as e:
        return f"Error saving outline: {e}"


def save_lore(book_id: str, category: str, content_json: str) -> str:
    """Save/update lore data by category (characters or world_setting)."""
    book_dir = _get_book_dir(book_id)
    lore_dir = book_dir / "lore"
    lore_dir.mkdir(parents=True, exist_ok=True)

    # Also update the legacy path used by search_lore
    legacy_dir = book_dir / "01_Global_Settings"
    legacy_dir.mkdir(parents=True, exist_ok=True)

    file_map = {
        "characters": ("characters.json", "characters.json"),
        "world_setting": ("world_setting.json", "world_lore.json"),
    }

    if category not in file_map:
        return f"Error: Unknown category '{category}'. Use 'characters' or 'world_setting'."

    try:
        data = json.loads(content_json)
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON — {e}"

    lore_name, legacy_name = file_map[category]
    try:
        # Write to both lore/ and 01_Global_Settings/ for compatibility
        with open(lore_dir / lore_name, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        with open(legacy_dir / legacy_name, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return f"Lore '{category}' saved successfully."
    except Exception as e:
        return f"Error saving lore: {e}"


# ── Plot Tree Tools ──

def read_tree(book_id: str, node_id: str = None) -> str:
    """Read the plot tree summary or a specific node."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "No plot tree exists yet. Use add_plot_node to start building one."
    if node_id:
        try:
            node = tree.get_node(node_id)
            return json.dumps(node.model_dump(), ensure_ascii=False, indent=2)
        except KeyError:
            return f"Error: Node '{node_id}' not found."
    return tree.get_summary()


def add_plot_node(book_id: str, parent: str, node_type: str, title: str,
                  description: str = "", characters: str = "") -> str:
    """Add a new node to the plot tree."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        tree = PlotTree.create(book_id)
    try:
        ntype = NodeType(node_type)
    except ValueError:
        valid = ", ".join(t.value for t in NodeType)
        return f"Error: Invalid node_type '{node_type}'. Use: {valid}"
    char_list = [c.strip() for c in characters.split(",") if c.strip()] if characters else []
    node_id = tree.add_node(
        parent=parent, type=ntype, title=title,
        description=description, characters=char_list,
    )
    tree.save(book_dir)
    return f"Node created: {node_id} (type={node_type}, title={title})"


def confirm_path(book_id: str, node_id: str) -> str:
    """Confirm a plot node as the official storyline."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    try:
        tree.snapshot(book_dir)
        tree.confirm_node(node_id)
        tree.save(book_dir)
        return f"Node '{node_id}' confirmed as official plot line."
    except KeyError:
        return f"Error: Node '{node_id}' not found."


def prune_branch(book_id: str, node_id: str, reason: str = "") -> str:
    """Prune a plot branch (mark as abandoned)."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    try:
        tree.snapshot(book_dir)
        tree.prune_node(node_id, reason=reason)
        tree.save(book_dir)
        return f"Branch '{node_id}' pruned. Reason: {reason}"
    except KeyError:
        return f"Error: Node '{node_id}' not found."


def merge_branches(book_id: str, branch_ids: str, convergence_title: str) -> str:
    """Create a convergence node that merges multiple branches."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    ids = [b.strip() for b in branch_ids.split(",")]
    if len(ids) < 2:
        return "Error: Need at least 2 branch IDs to merge (comma-separated)."
    try:
        first_node = tree.get_node(ids[0])
    except KeyError:
        return f"Error: Node '{ids[0]}' not found."
    parent = first_node.parent or tree.root_id
    conv_id = tree.add_node(
        parent=parent, type=NodeType.CONVERGENCE, title=convergence_title,
    )
    tree.set_causality(conv_id, depends_on=ids)
    tree.confirm_node(conv_id)
    tree.save(book_dir)
    return f"Convergence node created: {conv_id} merging {ids}"


# ── Terminal Tools (trigger human interaction) ──

def present_options(book_id: str, description: str, options: str) -> str:
    """Present options to the human for selection. TERMINAL: pauses agent loop."""
    return f"TERMINAL:PRESENT_OPTIONS\n{description}\n\n{options}"


def request_guidance(book_id: str, question: str, context: str = "") -> str:
    """Ask the human for guidance. TERMINAL: pauses agent loop."""
    ctx = f"\nContext: {context}" if context else ""
    return f"TERMINAL:REQUEST_GUIDANCE\n{question}{ctx}"


# ── Browse Examples Tool ──

def browse_examples(book_id: str, category: str = "", keyword: str = "") -> str:
    """Browse the exemplar library for reference writing samples."""
    from src.utils.example_library import get_example_library
    lib = get_example_library()
    if category:
        result = lib.get_by_category(category=category, random_choice=True, max_count=2)
        if result:
            return f"范文 ({category}):\n\n{result[:3000]}"
        cats = lib.list_categories()
        return f"No examples found for category '{category}'. Available: {', '.join(cats)}"
    if keyword:
        results = lib.search(tags=[keyword], max_count=2)
        if results:
            return "\n\n---\n\n".join(r["content"][:1500] for r in results)
        return f"No examples found for keyword '{keyword}'."
    cats = lib.list_categories()
    return f"Available categories: {', '.join(cats)}. Use category or keyword to search."


# ── Skill Registry (L1 layer) ──

_SKILL_DIR = Path(__file__).parent.parent.parent / "prompts"

SKILL_REGISTRY = {
    # ── writing ──
    "iceberg_writing": {
        "file": "skill_iceberg_writing.md",
        "category": "writing",
        "description": "冰山写作法：五层创作方法论，包括信息差地图、潜台词推演、白描铁律、节奏呼吸控制、AI脏词黑名单。",
        "when_to_use": "在撰写任何正文/草稿之前",
    },
    "scene_rhythm": {
        "file": "skill_scene_rhythm.md",
        "category": "writing",
        "description": "场景节奏控制：长短句交错、留白技巧、转场节奏、禁排比回忆。",
        "when_to_use": "关注场景内部节奏和转场时",
    },
    "exemplar_study": {
        "file": "skill_exemplar_study.md",
        "category": "writing",
        "description": "范文研读方法论：从优秀范文中学习节奏、信息差处理、感官描写手法。",
        "when_to_use": "在开始新风格或提升写作质量时，配合 browse_examples() 使用",
    },
    # ── plotting ──
    "plot_tree_methodology": {
        "file": "skill_plot_tree_methodology.md",
        "category": "plotting",
        "description": "剧情树构建方法论：分支探索、合流设计、修剪原则、因果链追踪。",
        "when_to_use": "在构建或修改剧情树时",
    },
    "chapter_arc_design": {
        "file": "skill_chapter_arc_design.md",
        "category": "plotting",
        "description": "章节弧线设计：起承转合结构、钩子设计、情绪曲线、高低潮分布。",
        "when_to_use": "在设计章节结构或调整章节节奏时",
    },
    # ── worldbuilding ──
    "lore_compliance": {
        "file": "skill_lore_compliance.md",
        "category": "worldbuilding",
        "description": "设定忠实度约束：零添加原则、数据库即圣经、时间线一致性、人设锁定。",
        "when_to_use": "在引用角色/地点/物品设定时",
    },
    "relationship_dynamics": {
        "file": "skill_relationship_dynamics.md",
        "category": "worldbuilding",
        "description": "角色关系网推演：信息差利用、权力关系演变、情感距离变化、隐藏动机。",
        "when_to_use": "在涉及角色互动、对话、关系变化时",
    },
    # ── planning ──
    "outline_generation": {
        "file": "skill_outline_generation.md",
        "category": "planning",
        "description": "大纲生成方法论：从剧情树路径生成完整Markdown大纲，包含格式规范。",
        "when_to_use": "在从剧情树导出大纲或创建新大纲时",
    },
    "volume_planning": {
        "file": "skill_volume_planning.md",
        "category": "planning",
        "description": "卷级节奏规划：三幕式结构、高潮分布、伏笔排布、卷间衔接。",
        "when_to_use": "在规划新卷或调整卷级结构时",
    },
}

TERMINAL_TOOLS = {"present_options", "request_guidance", "submit_for_review"}

CATEGORY_LABELS = {
    "writing": "[Writing] 写作技法",
    "plotting": "[Plotting] 剧情构建",
    "worldbuilding": "[World] 世界观与角色",
    "planning": "[Planning] 规划",
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
    """List all available skills, grouped by category."""
    groups = {}
    for name, info in SKILL_REGISTRY.items():
        cat = info["category"]
        groups.setdefault(cat, []).append((name, info))

    lines = []
    for cat in ("writing", "plotting", "worldbuilding", "planning"):
        if cat not in groups:
            continue
        lines.append(CATEGORY_LABELS.get(cat, cat))
        for name, info in groups[cat]:
            lines.append(f"  - {name}: {info['description']}")
        lines.append("")
    return "\n".join(lines)


# ── OpenAI Tool Schemas ──

AUTHOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a specific file from the book's directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "relative_path": {
                        "type": "string",
                        "description": "The relative path to the file, e.g., '04_Drafts/chapter_1.txt'."
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
            "description": "Search the book's lore (characters, world settings) for a keyword.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The keyword to search for."
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
            "description": "Read the book's outline or a specific volume.",
            "parameters": {
                "type": "object",
                "properties": {
                    "volume": {
                        "type": "integer",
                        "description": "Volume number (optional)."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "load_skill",
            "description": "Load a writing skill/methodology by name. Use list_skills() to see all available skills grouped by category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The skill name to load. Use list_skills() first to see options."
                    }
                },
                "required": ["skill_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_skills",
            "description": "List all available skills grouped by category (writing, plotting, worldbuilding, planning).",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_draft",
            "description": "Save draft text to a file in the book's directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Relative path, e.g., '04_Drafts/ch1_s1.md'."
                    },
                    "content": {
                        "type": "string",
                        "description": "The full draft text content."
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
            "description": "Submit the draft for editorial review. TERMINAL: this ends the agent loop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "The task ID."
                    },
                    "draft_text": {
                        "type": "string",
                        "description": "The full draft text."
                    }
                },
                "required": ["task_id", "draft_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_outline",
            "description": "Save or update the book's outline as JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "outline_json": {
                        "type": "string",
                        "description": "The complete outline data as JSON string."
                    }
                },
                "required": ["outline_json"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_lore",
            "description": "Save or update lore data. Category: 'characters' or 'world_setting'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["characters", "world_setting"],
                        "description": "The lore category."
                    },
                    "content_json": {
                        "type": "string",
                        "description": "The lore data as JSON string."
                    }
                },
                "required": ["category", "content_json"]
            }
        }
    },
    # ── Plot Tree Tools ──
    {
        "type": "function",
        "function": {
            "name": "read_tree",
            "description": "Read the plot tree summary. Pass node_id to see a specific node's details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "Optional: specific node ID to read."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_plot_node",
            "description": "Add a new node to the plot tree. Types: root, arc, plot_point, branch_point, convergence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "parent": {
                        "type": "string",
                        "description": "Parent node ID."
                    },
                    "node_type": {
                        "type": "string",
                        "enum": ["root", "arc", "plot_point", "branch_point", "convergence"],
                        "description": "Node type."
                    },
                    "title": {
                        "type": "string",
                        "description": "Node title."
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of this plot element."
                    },
                    "characters": {
                        "type": "string",
                        "description": "Comma-separated character names involved."
                    }
                },
                "required": ["parent", "node_type", "title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "confirm_path",
            "description": "Confirm a plot node as the official storyline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "Node ID to confirm."
                    }
                },
                "required": ["node_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "prune_branch",
            "description": "Prune a plot branch (mark as abandoned possibility).",
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {
                        "type": "string",
                        "description": "Node ID to prune."
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why this branch was pruned."
                    }
                },
                "required": ["node_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "merge_branches",
            "description": "Create a convergence node merging multiple branches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_ids": {
                        "type": "string",
                        "description": "Comma-separated node IDs to merge."
                    },
                    "convergence_title": {
                        "type": "string",
                        "description": "Title for the convergence point."
                    }
                },
                "required": ["branch_ids", "convergence_title"]
            }
        }
    },
    # ── Terminal Tools ──
    {
        "type": "function",
        "function": {
            "name": "present_options",
            "description": "Present multiple options to the human for selection. TERMINAL: pauses agent loop and waits for human choice.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Summary of what you're presenting."
                    },
                    "options": {
                        "type": "string",
                        "description": "The formatted options (numbered list, markdown, etc.)."
                    }
                },
                "required": ["description", "options"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "request_guidance",
            "description": "Ask the human for guidance on an uncertain decision. TERMINAL: pauses agent loop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to ask."
                    },
                    "context": {
                        "type": "string",
                        "description": "Background context for the question."
                    }
                },
                "required": ["question"]
            }
        }
    },
    # ── Browse Examples ──
    {
        "type": "function",
        "function": {
            "name": "browse_examples",
            "description": "Browse the exemplar library for reference writing samples by category or keyword.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Category like 'dark_revenge', 'comedy_funny', 'traditional_xianxia', etc."
                    },
                    "keyword": {
                        "type": "string",
                        "description": "Search keyword like '对话', '打斗', '心理描写'."
                    }
                }
            }
        }
    },
]
