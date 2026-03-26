import pytest
import os
import shutil
import json
from unittest.mock import AsyncMock, patch
from src.core.lore_agent import extract_and_update_lore

TEST_DATA_DIR = "test_books_output_lore"

@pytest.fixture(autouse=True)
def setup_teardown():
    os.environ["AUTONOVEL_DATA_DIR"] = TEST_DATA_DIR
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)
    
    os.makedirs(f"{TEST_DATA_DIR}/test_book_lore/01_Global_Settings", exist_ok=True)
    with open(f"{TEST_DATA_DIR}/test_book_lore/01_Global_Settings/characters.json", "w", encoding="utf-8") as f:
        json.dump({"OldChar": {"desc": "old"}}, f)
        
    yield
    if os.path.exists(TEST_DATA_DIR):
        shutil.rmtree(TEST_DATA_DIR)

@pytest.mark.asyncio
@patch("src.core.lore_agent.get_llm_client")
async def test_extract_and_update_lore_characters(mock_get_client):
    mock_llm = AsyncMock()
    
    async def mock_generate(*args, **kwargs):
        return '{"characters": {"NewChar": {"desc": "new"}}, "world_lore": {}}'
        
    mock_llm.generate_with_fallback.side_effect = mock_generate
    mock_get_client.return_value = mock_llm

    book_id = "test_book_lore"
    long_text = "NewChar did something really important. " * 10
    await extract_and_update_lore(book_id, long_text)
    
    # Check if file was updated
    with open(f"{TEST_DATA_DIR}/{book_id}/01_Global_Settings/characters.json", "r", encoding="utf-8") as f:
        data = json.load(f)
        assert "OldChar" in data
        assert "NewChar" in data
        assert data["NewChar"]["desc"] == "new"
