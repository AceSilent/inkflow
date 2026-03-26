"""
Simple test to debug JSON generation.
"""
import asyncio
import sys
import os
from pathlib import Path

if os.name == 'nt':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from src.core import OpenAILLMClient, ReaderFeedback


async def test_json_generation():
    """Test simple JSON generation."""
    print("=" * 60)
    print("JSON Generation Test")
    print("=" * 60)

    client = OpenAILLMClient(
        model_name="kimi-k2.5",
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL")
    )

    # Very simple prompt with correct enum value
    system_prompt = "You are a helpful assistant."
    user_prompt = """Respond with a JSON object in this exact format:
{
  "reader_role": "test",
  "immersion_score": 8,
  "emotional_watermark": "engaged",
  "issues": []
}

Respond ONLY with the JSON object, nothing else. No markdown, no code blocks."""

    print("\nSending request to API...")
    print(f"Model: {client.model_name}\n")

    try:
        result = await client.generate_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=ReaderFeedback,
            temperature=0.2
        )

        print(f"\n✓ Success!")
        print(f"\nReader Role: {result.reader_role}")
        print(f"Immersion Score: {result.immersion_score}")
        print(f"Emotional Watermark: {result.emotional_watermark}")
        print(f"Issues: {len(result.issues)}")
        return True

    except Exception as e:
        print(f"\n✗ Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = asyncio.run(test_json_generation())
    sys.exit(0 if success else 1)
