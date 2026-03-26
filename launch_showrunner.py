#!/usr/bin/env python3
"""
AutoNovel-Studio v3.0: Showrunner Update - 启动脚本

启动沙盘指挥中心 UI。
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core import OpenAILLMClient
from src.core.showrunner_workflow import ShowrunnerWorkflow
from src.ui import launch_showrunner_ui


def main():
    """Main entry point."""
    # Load environment variables
    load_dotenv()

    # Check API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment variables")
        print("Please set OPENAI_API_KEY in your .env file")
        sys.exit(1)

    # Initialize LLM client
    print("🚀 Initializing AutoNovel-Studio v3.0: Showrunner Command Center...")
    print("   Version: v3.0 - The Showrunner Update")
    print("   Architecture: Writer's Room + Iceberg Engine")

    llm_client = OpenAILLMClient(
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    )

    # Initialize workflow
    book_id = "test_book_v3"
    output_dir = "books_v3"

    workflow = ShowrunnerWorkflow(
        llm_client=llm_client,
        book_id=book_id,
        output_dir=output_dir
    )

    # Initialize workflow
    import asyncio
    asyncio.run(workflow.initialize())

    print(f"   Book ID: {book_id}")
    print(f"   Output: {output_dir}")
    print(f"   Server: http://127.0.0.1:7861")

    # Launch UI
    launch_showrunner_ui(
        workflow=workflow,
        server_name="127.0.0.1",
        server_port=7861,
        share=False
    )


if __name__ == "__main__":
    main()
