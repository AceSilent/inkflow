import pytest
from src.core.models import Issue, SceneOutlineDraft
from tests.mocks.mock_llm import MockLLMClient

@pytest.mark.asyncio
async def test_mock_llm_json_mode():
    """Test that the MockLLMClient returns dictionary format and handles response_format."""
    client = MockLLMClient()
    
    result = await client.generate_json(
        system_prompt="Test JSON",
        user_prompt="Return some JSON",
        response_model=None, # bypass standard formatting for this base test
        response_format={"type": "json_object"}
    )
    
    assert isinstance(result, dict)
    assert result.get("_mock_used_format") is True

@pytest.mark.asyncio
async def test_mock_llm_pydantic_model():
    """Test standard JSON parsing mapping to a Pydantic model successfully."""
    client = MockLLMClient(mock_responses={
        "SceneOutline": {
            "scene_number": 1,
            "title": "Mock Title",
            "plot_points": ["A", "B"],
            "logic_chain": "A -> B",
            "emotional_arc": "Flat",
            "focus_point": "Nothing",
            "word_count_target": 800
        }
    })
    
    result = await client.generate_json(
        system_prompt="Generate a SceneOutline",
        user_prompt="Go",
        response_model=SceneOutlineDraft
    )
    
    assert isinstance(result, SceneOutlineDraft)
    assert result.title == "Mock Title"
    assert result.scene_number == 1
