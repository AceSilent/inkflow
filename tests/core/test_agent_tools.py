import pytest
import os
import json
import shutil
from pathlib import Path
from src.core.agent_tools import read_file, search_lore, read_outline, load_skill

TEST_DATA_DIR = "test_books_output_agent_tools"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    data_path = Path(TEST_DATA_DIR)
    book_path = data_path / "test_book"
    
    # Setup lore
    lore_dir = book_path / "01_Global_Settings"
    lore_dir.mkdir(parents=True, exist_ok=True)
    with open(lore_dir / "characters.json", "w", encoding="utf-8") as f:
        json.dump({"Vera": {"desc": "Mysterious mage"}}, f, ensure_ascii=False)
        
    # Setup outline
    outline_dir = book_path / "02_Outlines"
    outline_dir.mkdir(parents=True, exist_ok=True)
    with open(outline_dir / "outline.json", "w", encoding="utf-8") as f:
        json.dump({"volumes": [{"title": "Vol 1"}]}, f, ensure_ascii=False)
        
    # Setup generic file
    draft_dir = book_path / "04_Drafts"
    draft_dir.mkdir(parents=True, exist_ok=True)
    with open(draft_dir / "ch1.txt", "w", encoding="utf-8") as f:
        f.write("Chapter 1 content")

    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

def test_read_file():
    book_id = "test_book"
    content = read_file(book_id, "04_Drafts/ch1.txt")
    assert content == "Chapter 1 content"
    
    # Must restrict path traversal
    content_bad = read_file(book_id, "../../../../etc/passwd")
    assert "Error" in content_bad or "Access denied" in content_bad

def test_search_lore():
    book_id = "test_book"
    result = search_lore(book_id, "Vera")
    assert "Mysterious mage" in result
    
    result_empty = search_lore(book_id, "Nonexistent")
    assert "No matching" in result_empty

def test_read_outline():
    book_id = "test_book"
    result = read_outline(book_id)
    assert "Vol 1" in result

def test_load_skill():
    # Known skill loads content 
    result = load_skill("iceberg_writing")
    assert "冰山写作法" in result or "信息差地图" in result
    assert len(result) > 100  # Should be substantial content
    
    # Unknown skill returns error with available skills listed
    result_bad = load_skill("nonexistent_skill")
    assert "Error" in result_bad
    assert "iceberg_writing" in result_bad  # Should list available skills
