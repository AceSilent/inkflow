"""
AutoNovel-Studio v4.0 — Application Launcher
Starts FastAPI server and opens browser.
"""
import sys
import os
import webbrowser
import threading
import time

# Ensure project root is in path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)


def open_browser(port: int, delay: float = 1.5):
    """Open browser after a short delay to let the server start."""
    def _open():
        time.sleep(delay)
        url = f"http://localhost:{port}"
        print(f"\n🌐 Opening browser at {url}")
        webbrowser.open(url)
    thread = threading.Thread(target=_open, daemon=True)
    thread.start()


def main():
    import uvicorn

    port = int(os.environ.get("PORT", 9864))
    host = os.environ.get("HOST", "0.0.0.0")

    print("=" * 60)
    print("  📚 AutoNovel-Studio v4.0")
    print("  AI-Powered Novel Generation Engine")
    print("=" * 60)
    print(f"  🚀 Starting server at http://localhost:{port}")
    print(f"  📁 Frontend: ./frontend/")
    print(f"  📡 API: http://localhost:{port}/api/v1/")
    print("=" * 60)

    # Open browser
    open_browser(port)

    # Start server
    uvicorn.run(
        "src.api.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
