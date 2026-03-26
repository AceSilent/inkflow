import pytest
from src.agents.brainstorming import BrainstormingRoom
from tests.mocks.mock_llm import MockLLMClient

@pytest.mark.asyncio
async def test_brainstorming_room_end_to_end():
    """Test that the Brainstorming Room uses JSON mode, renders Prompts, and processes data."""
    # Start with a mock LLM Client that provides the expected structure
    client = MockLLMClient(mock_responses={
        "请生成3个提案": {
            "proposals": [
                {
                    "id": "A",
                    "core_concept": "Mock Concept",
                    "surface_plot": "Mock Plot"
                },
                {
                    "id": "B", 
                    "core_concept": "Concept B",
                    "surface_plot": "Plot B"
                },
                {
                    "id": "C",
                    "core_concept": "Concept C",
                    "surface_plot": "Plot C"
                }
            ]
        },
        "带有反转的剧情设计": {
            "devil_twist": "A mock twist",
            "dramatic_irony": "A mock irony",
            "information_gaps": ["gap1"]
        }
    })
    
    room = BrainstormingRoom(client)
    
    result = await room.brainstorm(
        inspiration="Test inspiration",
        book_context={"tone": "Dark", "genre": ["Fantasy"]},
        character_states={"char_001": {"name": "Hero", "public_status": "Alive", "hidden_motive": "Revenge", "false_beliefs": ["Believes X is Y"]}},
        world_lore={"Magic Kingdom": "A place"}
    )
    
    assert len(result.options) == 3
    assert result.options[0].option_id == "A"
    assert result.options[0].core_concept == "Mock Concept"
    assert result.options[0].devil_twist == "A mock twist"
    assert "gap1" in result.options[0].required_information_gaps
