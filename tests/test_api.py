"""
Quick test script to verify API configuration.
"""
import asyncio
import sys
import os
from pathlib import Path

# Fix Windows console encoding
if os.name == 'nt':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env
from dotenv import load_dotenv
load_dotenv()

from src.core import OpenAILLMClient


async def test_api():
    """Test the API connection."""
    print("=" * 60)
    print("API Configuration Test")
    print("=" * 60)

    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("AUTHOR_MODEL", "kimi-k2.5")

    print(f"\nAPI Key: {api_key[:20]}..." if api_key else "API Key: Not set")
    print(f"Base URL: {base_url}")
    print(f"Model: {model}\n")

    if not api_key:
        print("❌ API key not configured!")
        return False

    print("✓ Configuration loaded")
    print("\nTesting API connection...")

    try:
        client = OpenAILLMClient(
            model_name=model,
            api_key=api_key,
            base_url=base_url
        )

        # Simple test
        result = await client.generate_text(
            system_prompt="You are a helpful assistant.",
            user_prompt="Say 'Hello, API test successful!' in English.",
            max_tokens=50
        )

        print(f"\n✓ API connection successful!")
        print(f"\nModel response:\n{result}")
        return True

    except Exception as e:
        print(f"\n❌ API test failed: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_api())
    sys.exit(0 if success else 1)
