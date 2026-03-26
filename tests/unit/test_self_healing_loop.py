import pytest
from unittest.mock import patch, MagicMock

def test_self_healing_retry_limit():
    from src.core.state_machine import WorkflowState
    from src.core.workflow import ShowrunnerWorkflow
    
    with patch("src.agents.readers.BaseReader.evaluate") as mock_eval, \
         patch("src.agents.author.AuthorAgent.generate_draft") as mock_generate:
        
        # Mock bad reader score (constant 2)
        mock_eval.return_value = {
            "score": 2,
            "feedback": "This is terrible writing."
        }
        
        # Mock generation just returns dummy text
        mock_generate.return_value = "Generated text."
        
        workflow = ShowrunnerWorkflow(book_id="test_book")
        
        # Start generation
        workflow.start_scene_generation(scene_id="s1")
        
        # Since score is always 2, the Editor should reject it and retry.
        # It should retry exactly 3 times, then fall to WAITING_HUMAN_INTERVENTION
        
        while workflow.state_machine.current_state not in [
            WorkflowState.STATE_WAITING_HUMAN_INTERVENTION, 
            WorkflowState.STATE_WAITING_DRAFT_APPROVAL
        ]:
            workflow.step()
            
        # Assertions
        assert workflow.state_machine.current_state == WorkflowState.STATE_WAITING_HUMAN_INTERVENTION
        assert workflow.state_machine.context.retry_count == 3
        
        # Author generation should have been called 1 (initial) + 3 (retries) = 4 times
        assert mock_generate.call_count == 4
