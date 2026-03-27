"""
AutoNovel-Studio v4.0 — FastAPI Application
Main entry point for the web server.
"""
import os
import sys
from pathlib import Path

# Load .env BEFORE any other imports that might read os.environ
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.api.routes import books, brainstorm, generate, review, characters, settings, inbox, writing, groupchat, author_chat

# ── Create App ──
app = FastAPI(
    title="AutoNovel-Studio",
    description="AI-powered novel generation engine with Showrunner architecture",
    version="5.0.0",
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routes ──
app.include_router(books.router, prefix="/api/v1")
app.include_router(brainstorm.router, prefix="/api/v1")
app.include_router(generate.router, prefix="/api/v1")
app.include_router(review.router, prefix="/api/v1")
app.include_router(characters.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")
app.include_router(inbox.router)
app.include_router(writing.router, prefix="/api/v1")
app.include_router(groupchat.router, prefix="/api/v1")
app.include_router(author_chat.router, prefix="/api/v1")

# ── Emotion endpoint (lightweight, no separate file needed) ──
@app.get("/api/v1/emotion/{book_id}/curve")
async def get_emotion_curve(book_id: str):
    """Get emotion tension curve data."""
    return {
        "book_id": book_id,
        "chapters": [
            {"chapter": 1, "tension": 45, "label": "开场铺垫"},
            {"chapter": 2, "tension": 62, "label": "悬念升级"},
            {"chapter": 3, "tension": 78, "label": "冲突爆发"},
            {"chapter": 4, "tension": 70, "label": "短暂喘息"},
            {"chapter": 5, "tension": 85, "label": "高潮来临"},
        ],
        "tension_index": 72,
        "alerts": [
            {"type": "warning", "title": "连续高张力", "desc": "建议下一章增加缓冲场景"},
        ]
    }

# ── Static Files (Frontend) ──
# In production: serve from frontend/dist (React build output)
# In development: use Vite dev server directly at :5173
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "dist"

# Mount all static assets from the build
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")


# ── Serve index.html for all non-API routes (SPA) ──
@app.get("/")
async def serve_index():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"error": "Frontend not found"}, status_code=404)


@app.get("/{path:path}")
async def catch_all(path: str, request: Request):
    """Catch-all route for SPA — serve index.html for non-API, non-static paths."""
    if path.startswith("api/"):
        return JSONResponse({"error": "Not found"}, status_code=404)

    # Try to serve as static file first
    file_path = FRONTEND_DIR / path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))

    # Fall back to index.html
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"error": "Not found"}, status_code=404)


# ── Error Handler ──
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )
