import pytest
from unittest.mock import patch

def test_human_intervention_prompt_injection():
    from src.agents.author import AuthorAgent
    from src.core.state_machine import ProjectContext
    
    with patch("src.agents.author.openai_client.chat.completions.create") as mock_create:
        
        mock_create.return_value.choices = [
            type('obj', (object,), {'message': type('obj', (object,), {'content': 'Generated text'})})
        ]
        
        agent = AuthorAgent()
        ctx = ProjectContext(
            book_id="book1",
            volume_id="v1",
            chapter_id="c1",
            scene_id="s1",
        )
        ctx.director_note = "Director Note: 男主角需更冷酷，不要有心理活动。"
        
        agent.generate_draft(ctx)
        
        # Verify the prompt sent to OpenAI includes the director note
        assert mock_create.called
        call_kwargs = mock_create.call_args.kwargs
        messages = call_kwargs.get("messages", [])
        
        # At least one message (system or user) must contain the exact director note
        found = False
        for msg in messages:
            if "男主角需更冷酷" in msg.get("content", ""):
                found = True
                break
                
        assert found, "Director Note was NOT injected into the LLM messages payload!"
