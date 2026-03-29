# Plot Tree + Skill 渐进式披露系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a tree-based plot development system and refactor the skill architecture into a three-layer progressive disclosure model, with an unlimited autonomous agent loop and segment-based tool call rendering in the frontend.

**Architecture:** The plot tree is a JSON data structure (flat node map) stored per-book, managed via new tools. The skill system gains `category` and `when_to_use` metadata; `list_skills()` returns grouped output. The agent loop removes its `max_loops` cap and uses terminal tools (`present_options`, `request_guidance`) for human interaction. The frontend renders messages as ordered `segments[]` (content / tool_call / thinking).

**Tech Stack:** Python 3.11+, Pydantic v2, FastAPI, React (Vite), SSE streaming, pytest

**Spec:** `docs/superpowers/specs/2026-03-29-plot-tree-skill-evolution-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/core/plot_tree.py` | PlotTree CRUD, state transitions, snapshots, export |
| `tests/core/test_plot_tree.py` | Unit tests for plot tree operations |
| `tests/core/test_skill_registry.py` | Unit tests for enhanced skill registry |
| `tests/core/test_agent_loop.py` | Unit tests for terminal tool detection |
| `prompts/skill_scene_rhythm.md` | Scene rhythm skill (split from iceberg L4) |
| `prompts/skill_exemplar_study.md` | Exemplar study methodology |
| `prompts/skill_plot_tree_methodology.md` | Plot tree construction methodology |
| `prompts/skill_chapter_arc_design.md` | Chapter arc design methodology |
| `prompts/skill_relationship_dynamics.md` | Character relationship dynamics |
| `prompts/skill_outline_generation.md` | Outline generation methodology + format spec |
| `prompts/skill_volume_planning.md` | Volume-level planning methodology |

### Modified Files

| File | Changes |
|------|---------|
| `src/core/agent_tools.py` | Enhanced SKILL_REGISTRY with categories; new tree tools + browse_examples + terminal tools; updated AUTHOR_TOOLS schema |
| `src/core/models.py` | New PlotTreeNode, PlotTree pydantic models |
| `src/core/workflow_engine.py` | Remove max_tool_loops; add terminal tool detection |
| `src/api/routes/author_chat.py` | Remove max_loops; add terminal tool handling; segment-based SSE events |
| `src/core/groupchat_orchestrator.py` | Update author system prompt to L0 format |
| `frontend/src/components/AuthorChatPanel.jsx` | Segment-based message rendering with tool call cards |

---

### Task 1: Plot Tree Data Models

**Files:**
- Create: `src/core/plot_tree.py`
- Modify: `src/core/models.py`
- Test: `tests/core/test_plot_tree.py`

- [ ] **Step 1: Write the failing test for PlotTree model**

```python
# tests/core/test_plot_tree.py
import pytest
from src.core.plot_tree import PlotTree, PlotTreeNode, NodeType, NodeState

def test_create_empty_tree():
    tree = PlotTree.create("book_001")
    assert tree.tree_id == "book_001_plot_tree"
    assert tree.book_id == "book_001"
    assert tree.root_id is not None
    root = tree.get_node(tree.root_id)
    assert root.type == NodeType.ROOT
    assert root.state == NodeState.CONFIRMED

def test_add_node():
    tree = PlotTree.create("book_001")
    node_id = tree.add_node(
        parent=tree.root_id,
        type=NodeType.ARC,
        title="第一卷：潜龙在渊",
        description="林辰重生归来，潜伏宗门",
    )
    node = tree.get_node(node_id)
    assert node.title == "第一卷：潜龙在渊"
    assert node.type == NodeType.ARC
    assert node.state == NodeState.EXPLORING
    assert node.parent == tree.root_id
    root = tree.get_node(tree.root_id)
    assert node_id in root.children

def test_confirm_and_prune():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="A")
    b = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="B")
    tree.confirm_node(a)
    tree.prune_node(b, reason="Not chosen")
    assert tree.get_node(a).state == NodeState.CONFIRMED
    assert tree.get_node(b).state == NodeState.PRUNED
    assert tree.get_node(b).pruned_reason == "Not chosen"

def test_causality():
    tree = PlotTree.create("book_001")
    n1 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="入藏书阁")
    n2 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="获功法")
    tree.set_causality(n2, depends_on=[n1])
    node2 = tree.get_node(n2)
    assert n1 in node2.causality.depends_on
    node1 = tree.get_node(n1)
    assert n2 in node1.causality.enables

def test_get_confirmed_path():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="V1")
    tree.confirm_node(a)
    p1 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="P1")
    p2 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="P2")
    tree.confirm_node(p1)
    tree.confirm_node(p2)
    path = tree.get_confirmed_path(a)
    assert len(path) == 2
    assert path[0].title == "P1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/core/test_plot_tree.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'src.core.plot_tree'`

- [ ] **Step 3: Implement PlotTree models in models.py**

Add to `src/core/models.py`:

```python
# ── Plot Tree Models ──

class NodeType(str, Enum):
    ROOT = "root"
    ARC = "arc"
    PLOT_POINT = "plot_point"
    BRANCH_POINT = "branch_point"
    CONVERGENCE = "convergence"

class NodeState(str, Enum):
    EXPLORING = "exploring"
    CANDIDATE = "candidate"
    CONFIRMED = "confirmed"
    PRUNED = "pruned"
    EXPORTED = "exported"

class Causality(BaseModel):
    depends_on: List[str] = Field(default_factory=list)
    enables: List[str] = Field(default_factory=list)

class PlotTreeNode(BaseModel):
    id: str
    parent: Optional[str] = None
    children: List[str] = Field(default_factory=list)
    type: NodeType
    state: NodeState = NodeState.EXPLORING
    title: str = ""
    description: str = ""
    causality: Causality = Field(default_factory=Causality)
    characters: List[str] = Field(default_factory=list)
    emotional_tone: str = ""
    tags: List[str] = Field(default_factory=list)
    export_ref: Optional[str] = None
    created_at: float = 0.0
    confirmed_at: Optional[float] = None
    pruned_reason: Optional[str] = None
```

- [ ] **Step 4: Implement PlotTree class**

Create `src/core/plot_tree.py`:

```python
"""Plot Tree — tree-based plot development and exploration system."""
import json
import time
import shutil
from pathlib import Path
from typing import List, Optional, Dict
from src.core.models import (
    PlotTreeNode, NodeType, NodeState, Causality
)

class PlotTree:
    """Manages a flat-map tree of plot nodes with state transitions."""

    def __init__(self, tree_id: str, book_id: str, root_id: str, nodes: Dict[str, PlotTreeNode]):
        self.tree_id = tree_id
        self.book_id = book_id
        self.root_id = root_id
        self.nodes = nodes

    @classmethod
    def create(cls, book_id: str) -> "PlotTree":
        tree_id = f"{book_id}_plot_tree"
        root_id = f"node_{int(time.time() * 1000)}"
        root = PlotTreeNode(
            id=root_id, type=NodeType.ROOT, state=NodeState.CONFIRMED,
            title=f"Plot Tree Root", created_at=time.time()
        )
        return cls(tree_id=tree_id, book_id=book_id, root_id=root_id, nodes={root_id: root})

    def get_node(self, node_id: str) -> PlotTreeNode:
        if node_id not in self.nodes:
            raise KeyError(f"Node {node_id} not found")
        return self.nodes[node_id]

    def add_node(self, parent: str, type: NodeType, title: str,
                 description: str = "", characters: List[str] = None,
                 emotional_tone: str = "") -> str:
        parent_node = self.get_node(parent)
        node_id = f"node_{int(time.time() * 1000)}_{len(self.nodes)}"
        node = PlotTreeNode(
            id=node_id, parent=parent, type=type, state=NodeState.EXPLORING,
            title=title, description=description,
            characters=characters or [], emotional_tone=emotional_tone,
            created_at=time.time()
        )
        self.nodes[node_id] = node
        parent_node.children.append(node_id)
        return node_id

    def confirm_node(self, node_id: str):
        node = self.get_node(node_id)
        node.state = NodeState.CONFIRMED
        node.confirmed_at = time.time()

    def prune_node(self, node_id: str, reason: str = ""):
        node = self.get_node(node_id)
        node.state = NodeState.PRUNED
        node.pruned_reason = reason

    def set_causality(self, node_id: str, depends_on: List[str] = None, enables: List[str] = None):
        node = self.get_node(node_id)
        if depends_on:
            node.causality.depends_on = depends_on
            for dep_id in depends_on:
                dep = self.get_node(dep_id)
                if node_id not in dep.causality.enables:
                    dep.causality.enables.append(node_id)
        if enables:
            node.causality.enables = enables
            for en_id in enables:
                en = self.get_node(en_id)
                if node_id not in en.causality.depends_on:
                    en.causality.depends_on.append(node_id)

    def get_confirmed_path(self, from_node: str) -> List[PlotTreeNode]:
        result = []
        node = self.get_node(from_node)
        for child_id in node.children:
            child = self.get_node(child_id)
            if child.state == NodeState.CONFIRMED:
                result.append(child)
        return result

    def to_dict(self) -> dict:
        return {
            "tree_id": self.tree_id,
            "book_id": self.book_id,
            "root_id": self.root_id,
            "nodes": {k: v.model_dump() for k, v in self.nodes.items()}
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PlotTree":
        nodes = {k: PlotTreeNode(**v) for k, v in data["nodes"].items()}
        return cls(
            tree_id=data["tree_id"], book_id=data["book_id"],
            root_id=data["root_id"], nodes=nodes
        )

    def save(self, book_dir: Path):
        tree_dir = book_dir / "plot_tree"
        tree_dir.mkdir(parents=True, exist_ok=True)
        tree_file = tree_dir / "tree.json"
        tree_file.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, book_dir: Path) -> Optional["PlotTree"]:
        tree_file = book_dir / "plot_tree" / "tree.json"
        if not tree_file.exists():
            return None
        data = json.loads(tree_file.read_text(encoding="utf-8"))
        return cls.from_dict(data)

    def snapshot(self, book_dir: Path):
        snap_dir = book_dir / "plot_tree" / "snapshots"
        snap_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        snap_file = snap_dir / f"{ts}.json"
        snap_file.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    def get_summary(self) -> str:
        lines = []
        def _walk(node_id, depth=0):
            node = self.nodes.get(node_id)
            if not node:
                return
            prefix = "  " * depth
            state_icon = {"confirmed": "✅", "exploring": "🔍", "candidate": "🤔", "pruned": "✂️", "exported": "📤"}.get(node.state, "?")
            lines.append(f"{prefix}{state_icon} [{node.type}] {node.title}")
            for child_id in node.children:
                _walk(child_id, depth + 1)
        _walk(self.root_id)
        return "\n".join(lines)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/core/test_plot_tree.py -v`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/plot_tree.py src/core/models.py tests/core/test_plot_tree.py
git commit -m "feat: add PlotTree data model and CRUD operations"
```

---

### Task 2: Enhanced Skill Registry + New Tools

**Files:**
- Modify: `src/core/agent_tools.py`
- Test: `tests/core/test_skill_registry.py`

- [ ] **Step 1: Write failing tests for enhanced skill registry**

```python
# tests/core/test_skill_registry.py
import pytest
from src.core.agent_tools import SKILL_REGISTRY, list_skills, load_skill

def test_skill_registry_has_categories():
    for name, info in SKILL_REGISTRY.items():
        assert "category" in info, f"Skill '{name}' missing 'category'"
        assert "when_to_use" in info, f"Skill '{name}' missing 'when_to_use'"
        assert info["category"] in ("writing", "plotting", "worldbuilding", "planning")

def test_list_skills_grouped():
    output = list_skills()
    assert "写作技法 (writing)" in output
    assert "剧情构建 (plotting)" in output
    assert "世界观与角色 (worldbuilding)" in output
    assert "规划 (planning)" in output

def test_list_skills_contains_all():
    output = list_skills()
    for name in SKILL_REGISTRY:
        assert name in output

def test_load_existing_skill():
    result = load_skill("iceberg_writing")
    assert "信息差地图" in result or "冰山" in result

def test_load_nonexistent_skill():
    result = load_skill("does_not_exist")
    assert "Error" in result
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/core/test_skill_registry.py -v`
Expected: FAIL — `test_skill_registry_has_categories` fails because no `category` field

- [ ] **Step 3: Enhance SKILL_REGISTRY in agent_tools.py**

Update `SKILL_REGISTRY` to include all 10 skills with `category`, `description`, `when_to_use`:

```python
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
```

- [ ] **Step 4: Rewrite list_skills() for grouped output**

```python
CATEGORY_LABELS = {
    "writing": "📂 写作技法 (writing)",
    "plotting": "📂 剧情构建 (plotting)",
    "worldbuilding": "📂 世界观与角色 (worldbuilding)",
    "planning": "📂 规划 (planning)",
}

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
```

- [ ] **Step 5: Add tree tools and browse_examples to agent_tools.py**

Add new tool functions:

```python
from src.core.plot_tree import PlotTree
from src.core.models import NodeType

def read_tree(book_id: str, node_id: str = None) -> str:
    """Read the plot tree summary or a subtree."""
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
        return f"Error: Invalid node_type '{node_type}'. Use: root, arc, plot_point, branch_point, convergence"
    char_list = [c.strip() for c in characters.split(",") if c.strip()] if characters else []
    node_id = tree.add_node(parent=parent, type=ntype, title=title,
                            description=description, characters=char_list)
    tree.save(book_dir)
    return f"Node created: {node_id} (type={node_type}, title={title})"

def confirm_path(book_id: str, node_id: str) -> str:
    """Confirm a plot node path as the official storyline."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    tree.snapshot(book_dir)
    tree.confirm_node(node_id)
    tree.save(book_dir)
    return f"Node '{node_id}' confirmed as official plot line."

def prune_branch(book_id: str, node_id: str, reason: str = "") -> str:
    """Prune a plot branch (mark as abandoned)."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    tree.snapshot(book_dir)
    tree.prune_node(node_id, reason=reason)
    tree.save(book_dir)
    return f"Branch '{node_id}' pruned. Reason: {reason}"

def merge_branches(book_id: str, branch_ids: str, convergence_title: str) -> str:
    """Create a convergence node that merges multiple branches."""
    book_dir = _get_book_dir(book_id)
    tree = PlotTree.load(book_dir)
    if not tree:
        return "Error: No plot tree exists."
    ids = [b.strip() for b in branch_ids.split(",")]
    if len(ids) < 2:
        return "Error: Need at least 2 branch IDs to merge."
    first_node = tree.get_node(ids[0])
    parent = first_node.parent or tree.root_id
    conv_id = tree.add_node(parent=parent, type=NodeType.CONVERGENCE, title=convergence_title)
    tree.set_causality(conv_id, depends_on=ids)
    tree.confirm_node(conv_id)
    tree.save(book_dir)
    return f"Convergence node created: {conv_id} merging {ids}"

def present_options(book_id: str, description: str, options: str) -> str:
    """Terminal tool: present options to the human for selection."""
    return f"TERMINAL:PRESENT_OPTIONS:{description}\nOptions:\n{options}"

def request_guidance(book_id: str, question: str, context: str = "") -> str:
    """Terminal tool: ask the human for guidance."""
    return f"TERMINAL:REQUEST_GUIDANCE:{question}\nContext: {context}"

def browse_examples(book_id: str, category: str = "", keyword: str = "") -> str:
    """Browse the exemplar library for reference writing samples."""
    from src.utils.example_library import get_example_library
    lib = get_example_library()
    if category:
        result = lib.get_by_category(category=category, random_choice=True, max_count=2)
        if result:
            return f"范文 ({category}):\n\n{result[:3000]}"
        return f"No examples found for category '{category}'. Available: {', '.join(lib.list_categories())}"
    if keyword:
        results = lib.search(tags=[keyword], max_count=2)
        if results:
            return "\n\n---\n\n".join(r["content"][:1500] for r in results)
    cats = lib.list_categories()
    return f"Available categories: {', '.join(cats)}. Use category or keyword to search."
```

- [ ] **Step 6: Add AUTHOR_TOOLS OpenAI schemas for new tools**

Append to `AUTHOR_TOOLS` list: `read_tree`, `add_plot_node`, `confirm_path`, `prune_branch`, `merge_branches`, `present_options`, `request_guidance`, `browse_examples`. Update `load_skill` description to say "Use list_skills() to see all available skills."

- [ ] **Step 7: Run tests**

Run: `python -m pytest tests/core/test_skill_registry.py -v`
Expected: All 5 tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/core/agent_tools.py tests/core/test_skill_registry.py
git commit -m "feat: enhanced skill registry with categories + plot tree tools"
```

---

### Task 3: Agent Loop — Remove Limits + Terminal Tool Detection

**Files:**
- Modify: `src/core/workflow_engine.py`
- Modify: `src/api/routes/author_chat.py`
- Test: `tests/core/test_agent_loop.py`

- [ ] **Step 1: Write failing test for terminal tool detection**

```python
# tests/core/test_agent_loop.py
import pytest

TERMINAL_TOOLS = {"present_options", "request_guidance", "submit_for_review"}

def test_terminal_tools_defined():
    from src.core.agent_tools import TERMINAL_TOOLS as actual
    assert actual == TERMINAL_TOOLS

def test_dispatch_returns_terminal_flag():
    from src.core.workflow_engine import _dispatch_tool
    result, is_terminal = _dispatch_tool("present_options", "book_001", "task_001",
                                          {"description": "test", "options": "A\nB"})
    assert is_terminal is True

def test_dispatch_non_terminal():
    from src.core.workflow_engine import _dispatch_tool
    result, is_terminal = _dispatch_tool("search_lore", "book_001", "task_001",
                                          {"query": "test"})
    assert is_terminal is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/core/test_agent_loop.py -v`
Expected: FAIL — `TERMINAL_TOOLS` not defined

- [ ] **Step 3: Add TERMINAL_TOOLS to agent_tools.py**

```python
TERMINAL_TOOLS = {"present_options", "request_guidance", "submit_for_review"}
```

- [ ] **Step 4: Update _dispatch_tool in workflow_engine.py**

Add dispatch entries for new tools. Remove `max_tool_loops = 10` and replace with `while True:` loop. Terminal detection uses:

```python
if name in TERMINAL_TOOLS:
    return result, True
```

Import `TERMINAL_TOOLS` from `agent_tools`.

- [ ] **Step 5: Update author_chat.py — remove max_loops, add terminal handling**

Replace `for loop_i in range(max_loops):` with `while True:`. Add terminal tool detection: when a tool result starts with `TERMINAL:`, break the loop and stream the result as the final content. Add new tool dispatches for all new tools.

- [ ] **Step 6: Run tests**

Run: `python -m pytest tests/core/test_agent_loop.py -v`
Expected: All 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/agent_tools.py src/core/workflow_engine.py src/api/routes/author_chat.py tests/core/test_agent_loop.py
git commit -m "feat: unlimited agent loop with terminal tool detection"
```

---

### Task 4: Author System Prompt L0 Refactor

**Files:**
- Modify: `src/core/groupchat_orchestrator.py`

- [ ] **Step 1: Update author system prompt to L0 format**

Replace the current `AGENT_SYSTEM_PROMPTS["author"]` with the L0-only version:

```python
"author": (
    "你是「作者」✍️，系统中最核心的创作引擎。\n"
    "你不是聊天机器人，而是拥有[工具箱]（Tools）的自主智能体。\n\n"
    "【铁律】\n"
    "- 动作泄密，不用旁白告知\n"
    "- 一段只许一个特写\n"
    "- 长短句交错呼吸\n"
    "- 数据库即圣经，查不到就不写\n"
    "- 写正文前先 load_skill('iceberg_writing')\n"
    "- 构思剧情前先 read_tree() 了解当前全局\n\n"
    "用 list_skills() 查看所有可用 skill。\n"
    "你的工作模式：自治循环调用工具直到完成任务，然后调用终止工具（如 present_options / submit_for_review）交给人类。\n"
    "回复时使用中文。"
),
```

- [ ] **Step 2: Commit**

```bash
git add src/core/groupchat_orchestrator.py
git commit -m "refactor: author system prompt to L0 progressive disclosure format"
```

---

### Task 5: New Skill Files (Prompts)

**Files:**
- Create: 7 new prompt files in `prompts/`

- [ ] **Step 1: Create skill_scene_rhythm.md**

Extract rhythm/pacing content from the 4th layer of `skill_iceberg_writing.md` and expand into a standalone skill. Focus on: sentence length variation, paragraph breathing, transition techniques, anti-patterns (排比回忆). ~60 lines.

- [ ] **Step 2: Create skill_exemplar_study.md**

Write methodology for studying exemplar texts: how to analyze rhythm, information gap handling, sensory detail patterns, character voice. Emphasize learning not copying. Include guidance on using `browse_examples()` tool. ~50 lines.

- [ ] **Step 3: Create skill_plot_tree_methodology.md**

Write methodology for building plot trees: branching strategies, when to branch vs. linear, convergence design principles, pruning criteria, causality chain integrity. ~80 lines.

- [ ] **Step 4: Create skill_chapter_arc_design.md**

Write methodology for chapter arc design: 起承转合 structure, hook design, emotional curve, pacing within chapters, cliffhangers. ~60 lines.

- [ ] **Step 5: Create skill_relationship_dynamics.md**

Write methodology for character relationship dynamics: information asymmetry, power dynamics, emotional distance evolution, hidden motivations, relationship network reasoning. ~60 lines.

- [ ] **Step 6: Create skill_outline_generation.md**

Write methodology + format specification for generating outlines from plot tree paths. Include the Markdown format template (scenes, POV, setting, plot, causality chain, emotional arc, focus, word count target). ~70 lines.

- [ ] **Step 7: Create skill_volume_planning.md**

Write methodology for volume-level planning: three-act structure, climax distribution, foreshadowing placement, inter-volume hooks. ~50 lines.

- [ ] **Step 8: Verify all skills load**

Run: `python -c "from src.core.agent_tools import load_skill, SKILL_REGISTRY; [print(f'{k}: OK' if 'Error' not in load_skill(k) else f'{k}: FAIL') for k in SKILL_REGISTRY]"`
Expected: All 10 print "OK"

- [ ] **Step 9: Commit**

```bash
git add prompts/skill_*.md
git commit -m "feat: add 7 new skill files for progressive disclosure system"
```

---

### Task 6: Frontend — Segment-Based Message Rendering

**Files:**
- Modify: `frontend/src/components/AuthorChatPanel.jsx`

- [ ] **Step 1: Update SSE parsing to build segments**

Replace the current flat `finalContent` / `finalTools` accumulation with segment-based state:

```jsx
// In handleSend, replace the SSE parsing loop state:
let segments = []    // ordered [{type:'content',text}, {type:'tool_call',name,args,result,status}, ...]
let currentContent = ''

// On 'content' event: accumulate to currentContent
// On 'tool_start' event: flush currentContent as a content segment, push tool_call segment
// On 'tool_done' event: update the last matching tool_call segment with result
// On 'done': flush remaining currentContent
```

- [ ] **Step 2: Update streamingMsg state to use segments**

```jsx
const [streamingMsg, setStreamingMsg] = useState(null)
// Shape: { thinking, segments: [], thinkingDone }
```

- [ ] **Step 3: Create ToolCallCard component**

```jsx
function ToolCallCard({ segment }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      padding: '4px 10px', borderLeft: '3px solid #00BCD4',
      background: 'var(--bg-elevated)', borderRadius: '0 6px 6px 0',
      fontSize: 11, cursor: 'pointer', marginBottom: 2,
    }}
    onClick={() => setExpanded(!expanded)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {expanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
        <Wrench size={10} />
        <code style={{ fontFamily: 'monospace' }}>{segment.name}</code>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          ({truncateArgs(segment.args)})
        </span>
        {segment.status === 'running'
          ? <Loader size={10} style={{ animation: 'spin 1.5s linear infinite' }}/>
          : <span style={{ color: '#4CAF50' }}>✓</span>
        }
      </div>
      {expanded && segment.result && (
        <pre style={{
          margin: '4px 0 0 18px', fontSize: 10, color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto'
        }}>{segment.result}</pre>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update MessageBubble to render segments**

Replace the flat content rendering with:

```jsx
{msg.segments?.map((seg, i) => (
  seg.type === 'content' ? (
    <div key={i} style={contentBubbleStyle}>{seg.text}</div>
  ) : seg.type === 'tool_call' ? (
    <ToolCallCard key={i} segment={seg} />
  ) : null
))}
```

- [ ] **Step 5: Update committed message format**

When committing the final message, store as `{ role: 'assistant', thinking, segments }` instead of `{ content, tool_calls }`.

- [ ] **Step 6: Test in browser**

Run: `cd frontend && npm run dev`
Open browser, send a message to the Author Agent, verify:
- Tool calls appear as teal-bordered cards between content segments
- Cards are expandable to show arguments + results
- Content and tool calls are not merged or lost
- Thinking block is collapsible

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/components/AuthorChatPanel.jsx
git commit -m "feat: segment-based tool call rendering in AuthorChat"
```

---

## Verification Plan

### Automated Tests

```bash
# Run all new tests
python -m pytest tests/core/test_plot_tree.py tests/core/test_skill_registry.py tests/core/test_agent_loop.py -v

# Run full test suite to check for regressions
python -m pytest tests/ -v --ignore=tests/archive
```

### Manual Verification

1. **Skill system**: Open AuthorChat → send "list_skills()" → verify grouped output with 4 categories
2. **Plot tree**: Send "帮我构建第一卷的剧情树" → verify agent autonomously calls multiple tree tools
3. **Tool call rendering**: Verify content + tool_call segments render in interleaved order
4. **No limit**: Verify agent can chain 10+ tool calls without being interrupted
5. **Terminal tools**: Verify agent pauses when calling `present_options`
