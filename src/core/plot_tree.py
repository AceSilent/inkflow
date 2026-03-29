"""Plot Tree — tree-based plot development and exploration system.

The plot tree is the creative upstream of outlines. It supports:
- Possibility branches (exploring multiple storylines)
- Confirmation and pruning (selecting official paths)
- Causality tracking (depends_on / enables)
- Saving, loading, and snapshotting
- Summary generation for agent consumption
"""
import json
import time
from pathlib import Path
from typing import List, Optional, Dict

from src.core.models import PlotTreeNode, NodeType, NodeState, Causality


class PlotTree:
    """Manages a flat-map tree of plot nodes with state transitions."""

    def __init__(self, tree_id: str, book_id: str, root_id: str,
                 nodes: Dict[str, PlotTreeNode]):
        self.tree_id = tree_id
        self.book_id = book_id
        self.root_id = root_id
        self.nodes = nodes

    @classmethod
    def create(cls, book_id: str) -> "PlotTree":
        """Create a new empty plot tree with a root node."""
        tree_id = f"{book_id}_plot_tree"
        root_id = f"node_{int(time.time() * 1000)}"
        root = PlotTreeNode(
            id=root_id,
            type=NodeType.ROOT,
            state=NodeState.CONFIRMED,
            title="Plot Tree Root",
            created_at=time.time(),
        )
        return cls(tree_id=tree_id, book_id=book_id,
                   root_id=root_id, nodes={root_id: root})

    def get_node(self, node_id: str) -> PlotTreeNode:
        """Get a node by ID. Raises KeyError if not found."""
        if node_id not in self.nodes:
            raise KeyError(f"Node '{node_id}' not found in tree")
        return self.nodes[node_id]

    def add_node(
        self,
        parent: str,
        type: NodeType,
        title: str,
        description: str = "",
        characters: List[str] = None,
        emotional_tone: str = "",
    ) -> str:
        """Add a new node as a child of the given parent. Returns the new node's ID."""
        parent_node = self.get_node(parent)
        node_id = f"node_{int(time.time() * 1000)}_{len(self.nodes)}"
        node = PlotTreeNode(
            id=node_id,
            parent=parent,
            type=type,
            state=NodeState.EXPLORING,
            title=title,
            description=description,
            characters=characters or [],
            emotional_tone=emotional_tone,
            created_at=time.time(),
        )
        self.nodes[node_id] = node
        parent_node.children.append(node_id)
        return node_id

    def confirm_node(self, node_id: str):
        """Mark a node as confirmed (official plot line)."""
        node = self.get_node(node_id)
        node.state = NodeState.CONFIRMED
        node.confirmed_at = time.time()

    def prune_node(self, node_id: str, reason: str = ""):
        """Mark a node as pruned (abandoned possibility)."""
        node = self.get_node(node_id)
        node.state = NodeState.PRUNED
        node.pruned_reason = reason

    def set_causality(
        self,
        node_id: str,
        depends_on: List[str] = None,
        enables: List[str] = None,
    ):
        """Set causality links. Automatically maintains bidirectional references."""
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
        """Get all confirmed children of a node."""
        result = []
        node = self.get_node(from_node)
        for child_id in node.children:
            child = self.get_node(child_id)
            if child.state == NodeState.CONFIRMED:
                result.append(child)
        return result

    def get_summary(self) -> str:
        """Generate a human-readable tree summary (for agent consumption)."""
        lines = []

        def _walk(node_id: str, depth: int = 0):
            node = self.nodes.get(node_id)
            if not node:
                return
            prefix = "  " * depth
            state_icons = {
                "confirmed": "[OK]",
                "exploring": "[?]",
                "candidate": "[~]",
                "pruned": "[X]",
                "exported": "[->]",
            }
            icon = state_icons.get(node.state, "?")
            lines.append(f"{prefix}{icon} [{node.type}] {node.title}")
            if node.description:
                lines.append(f"{prefix}   {node.description[:80]}")
            for child_id in node.children:
                _walk(child_id, depth + 1)

        _walk(self.root_id)
        return "\n".join(lines)

    # ── Serialization ──

    def to_dict(self) -> dict:
        """Serialize tree to a plain dict."""
        return {
            "tree_id": self.tree_id,
            "book_id": self.book_id,
            "root_id": self.root_id,
            "nodes": {k: v.model_dump() for k, v in self.nodes.items()},
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PlotTree":
        """Deserialize tree from a plain dict."""
        nodes = {k: PlotTreeNode(**v) for k, v in data["nodes"].items()}
        return cls(
            tree_id=data["tree_id"],
            book_id=data["book_id"],
            root_id=data["root_id"],
            nodes=nodes,
        )

    # ── File I/O ──

    def save(self, book_dir: Path):
        """Save tree to book_dir/plot_tree/tree.json."""
        tree_dir = book_dir / "plot_tree"
        tree_dir.mkdir(parents=True, exist_ok=True)
        tree_file = tree_dir / "tree.json"
        tree_file.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, book_dir: Path) -> Optional["PlotTree"]:
        """Load tree from book_dir/plot_tree/tree.json. Returns None if not found."""
        tree_file = book_dir / "plot_tree" / "tree.json"
        if not tree_file.exists():
            return None
        data = json.loads(tree_file.read_text(encoding="utf-8"))
        return cls.from_dict(data)

    def snapshot(self, book_dir: Path):
        """Save a timestamped snapshot for rollback."""
        snap_dir = book_dir / "plot_tree" / "snapshots"
        snap_dir.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        snap_file = snap_dir / f"{ts}.json"
        snap_file.write_text(
            json.dumps(self.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
