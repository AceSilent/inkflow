#!/usr/bin/env python3
"""
AutoNovel-Studio v2.1 Launcher

Launches the Gradio UI for novel generation and management.

Usage:
    python launch_ui.py                    # Launch on localhost:7860
    python launch_ui.py --port 8080        # Launch on custom port
    python launch_ui.py --share            # Create public link
"""
import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.core import OpenAILLMClient
from src.ui import launch_ui


def main():
    """Main entry point."""
    # Load environment variables
    load_dotenv()

    # Parse command line arguments
    parser = argparse.ArgumentParser(description="AutoNovel-Studio v2.1 UI")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Server host (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=7860,
        help="Server port (default: 7860)"
    )
    parser.add_argument(
        "--share",
        action="store_true",
        help="Create public link"
    )
    parser.add_argument(
        "--output-dir",
        default="books",
        help="Output directory for books (default: books)"
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        help="LLM model to use (default: gpt-4o-mini)"
    )

    args = parser.parse_args()

    # Check API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ Error: OPENAI_API_KEY not found in environment variables")
        print("Please set OPENAI_API_KEY in your .env file")
        sys.exit(1)

    # Initialize LLM client
    print(f"🚀 Initializing AutoNovel-Studio v2.1...")
    print(f"   Model: {args.model}")
    print(f"   Output: {args.output_dir}")
    print(f"   Server: http://{args.host}:{args.port}")

    llm_client = OpenAILLMClient(
        api_key=api_key,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        model=args.model
    )

    # Launch UI
    launch_ui(
        llm_client=llm_client,
        output_dir=args.output_dir,
        server_name=args.host,
        server_port=args.port,
        share=args.share
    )


if __name__ == "__main__":
    main()
