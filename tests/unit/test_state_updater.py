import pytest
from src.core.state_updater import StateUpdater, EmotionalBeatTracker
from src.core.models import CharacterCognitionState, CharacterMemory
from tests.mocks.mock_llm import MockLLMClient

@pytest.mark.asyncio
async def test_state_updater_with_mock():
    # Setup state
    state = CharacterCognitionState()
    char = CharacterMemory(
        char_id="char_01",
        name="Alice",
        known_facts=[],
        false_beliefs=["Bob is dead"],
        hidden_motive="Find Bob",
        public_status="Mourner"
    )
    state.add_character(char)

    # Setup mock client
    client = MockLLMClient(mock_responses={
        "{" : '{"updates": {"char_01": {"char_id": "char_01", "facts_learned": ["Bob is alive"], "beliefs_corrected": [{"old": "Bob is dead", "truth": "Bob is alive"}], "new_false_beliefs": ["Bob doesn\'t want to see me"]}}}'
    })
    
    updater = StateUpdater(client)
    
    scene_text = "Alice saw Bob walking down the street. She thought: 'He's alive! But why didn't he call me? He must hate me now.'"
    
    deltas = await updater.update_from_scene(
        scene_text=scene_text,
        current_states=state,
        involved_char_ids=["char_01"]
    )
    
    assert "char_01" in deltas
    updated_char = state.get_character("char_01")
    
    # Check that beliefs were corrected and new facts learned
    assert "Bob is alive" in updated_char.known_facts
    assert "Bob is dead" not in updated_char.false_beliefs
    assert "Bob doesn't want to see me" in updated_char.false_beliefs
    assert len(updated_char.belief_history) == 3

@pytest.mark.asyncio
async def test_emotional_tracker_with_mock():
    client = MockLLMClient(mock_responses={
        "{" : '{"score": 80, "dominant_emotion": "Hope", "key_event": "Alice found Bob", "reasoning": "They reunited"}'
    })
    
    tracker = EmotionalBeatTracker(client)
    
    analysis = await tracker.analyze_scene_emotion(
        scene_text="Alice finally found Bob.",
        chapter_num=1,
        scene_num=2,
        current_curve=[50, 60]
    )
    
    assert analysis["score"] == 80
    assert analysis["dominant_emotion"] == "Hope"
    assert analysis["key_event"] == "Alice found Bob"
    assert "needs_setback" in analysis
