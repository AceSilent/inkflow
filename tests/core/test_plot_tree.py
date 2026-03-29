"""Tests for PlotTree data model and CRUD operations."""
import pytest
import time
from src.core.plot_tree import PlotTree
from src.core.models import NodeType, NodeState


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


def test_add_multiple_children():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="A")
    b = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="B")
    c = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="C")
    root = tree.get_node(tree.root_id)
    assert len(root.children) == 3
    assert set(root.children) == {a, b, c}


def test_confirm_and_prune():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="A")
    b = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="B")
    tree.confirm_node(a)
    tree.prune_node(b, reason="Not chosen")
    assert tree.get_node(a).state == NodeState.CONFIRMED
    assert tree.get_node(b).state == NodeState.PRUNED
    assert tree.get_node(b).pruned_reason == "Not chosen"


def test_confirm_sets_timestamp():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="A")
    before = time.time()
    tree.confirm_node(a)
    after = time.time()
    node = tree.get_node(a)
    assert node.confirmed_at is not None
    assert before <= node.confirmed_at <= after


def test_causality():
    tree = PlotTree.create("book_001")
    n1 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="入藏书阁")
    n2 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="获功法")
    tree.set_causality(n2, depends_on=[n1])
    node2 = tree.get_node(n2)
    assert n1 in node2.causality.depends_on
    node1 = tree.get_node(n1)
    assert n2 in node1.causality.enables


def test_bidirectional_causality():
    """Setting causality on one node should update the reverse direction too."""
    tree = PlotTree.create("book_001")
    n1 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="A")
    n2 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="B")
    n3 = tree.add_node(parent=tree.root_id, type=NodeType.PLOT_POINT, title="C")
    tree.set_causality(n3, depends_on=[n1, n2])
    assert n3 in tree.get_node(n1).causality.enables
    assert n3 in tree.get_node(n2).causality.enables
    assert n1 in tree.get_node(n3).causality.depends_on
    assert n2 in tree.get_node(n3).causality.depends_on


def test_get_confirmed_path():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="V1")
    tree.confirm_node(a)
    p1 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="P1")
    p2 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="P2")
    p3 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="P3-pruned")
    tree.confirm_node(p1)
    tree.confirm_node(p2)
    tree.prune_node(p3, reason="weak")
    path = tree.get_confirmed_path(a)
    assert len(path) == 2
    titles = [n.title for n in path]
    assert "P1" in titles
    assert "P2" in titles
    assert "P3-pruned" not in titles


def test_get_node_not_found():
    tree = PlotTree.create("book_001")
    with pytest.raises(KeyError):
        tree.get_node("nonexistent_node")


def test_to_dict_and_from_dict():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="V1", description="test")
    tree.confirm_node(a)

    data = tree.to_dict()
    restored = PlotTree.from_dict(data)

    assert restored.tree_id == tree.tree_id
    assert restored.book_id == tree.book_id
    assert restored.root_id == tree.root_id
    assert restored.get_node(a).title == "V1"
    assert restored.get_node(a).state == NodeState.CONFIRMED


def test_save_and_load(tmp_path):
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="V1")
    tree.confirm_node(a)
    tree.save(tmp_path)

    loaded = PlotTree.load(tmp_path)
    assert loaded is not None
    assert loaded.tree_id == tree.tree_id
    assert loaded.get_node(a).state == NodeState.CONFIRMED


def test_load_nonexistent(tmp_path):
    result = PlotTree.load(tmp_path)
    assert result is None


def test_snapshot(tmp_path):
    tree = PlotTree.create("book_001")
    tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="V1")
    tree.snapshot(tmp_path)

    snap_dir = tmp_path / "plot_tree" / "snapshots"
    assert snap_dir.exists()
    snaps = list(snap_dir.glob("*.json"))
    assert len(snaps) == 1


def test_get_summary():
    tree = PlotTree.create("book_001")
    a = tree.add_node(parent=tree.root_id, type=NodeType.ARC, title="第一卷")
    tree.confirm_node(a)
    p1 = tree.add_node(parent=a, type=NodeType.PLOT_POINT, title="重生")

    summary = tree.get_summary()
    assert "第一卷" in summary
    assert "重生" in summary
    assert "✅" in summary  # confirmed icon
    assert "🔍" in summary  # exploring icon
