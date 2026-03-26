import pytest
from src.agents.author import AuthorAgent
from tests.mocks.mock_llm import MockLLMClient

@pytest.mark.asyncio
async def test_author_iceberg_generation_legacy_fallback():
    """Test that AuthorAgent correctly routes via IcebergEngine even when given legacy str inputs."""
    client = MockLLMClient(mock_responses={
        "<Internal_Script>": "<Internal_Script>\n分析：测试。\n角色A（潜台词）：X\n角色A（实际台词）：Y\n</Internal_Script>\n<Final_Prose>\nThis is the final prose.\n</Final_Prose>"
    })
    
    author = AuthorAgent(client, use_examples=False)
    
    # Send legacy parameters expecting a text output or IcebergDraftOutput
    result = await author.generate_scene(
        book_meta={"genre": ["Fantasy"]},
        volume_outline="Vol 1",
        recent_summaries="Previous chapter...",
        chapter_outline={"title": "Ch 1"},
        scene_target="主角去冒险"
    )
    
    # result should be an IcebergDraftOutput object
    assert hasattr(result, "final_prose")
    assert "This is the final prose." in result.final_prose
    assert result.internal_script.analysis == "测试。"
