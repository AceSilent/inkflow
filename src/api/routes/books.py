"""
AutoNovel-Studio v4.0 — Books API Routes
"""
import os
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter(prefix="/books", tags=["books"])

# ── Data directory ──
DATA_DIR = Path(os.environ.get("AUTONOVEL_DATA_DIR", "books"))


class BookCreate(BaseModel):
    book_id: str
    title: str
    genre: str = "未分类"
    sub_genres: list = []
    tone: str = "默认"
    world_setting: str = ""
    protagonist: str = ""
    synopsis: str = ""
    target_words: int = 500000


class BookResponse(BaseModel):
    book_id: str
    title: str
    genre: str = "未分类"
    sub_genres: list = []
    tone: str = "默认"
    world_setting: str = ""
    chapters: int = 0


class BookUpdate(BaseModel):
    title: Optional[str] = None
    genre: Optional[str] = None
    sub_genres: Optional[list] = None
    tone: Optional[str] = None
    world_setting: Optional[str] = None
    protagonist: Optional[str] = None
    synopsis: Optional[str] = None
    target_words: Optional[int] = None


def _get_books_dir() -> Path:
    d = DATA_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def _load_book_meta(book_dir: Path) -> dict:
    meta_file = book_dir / "book_meta.json"
    if meta_file.exists():
        with open(meta_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


@router.get("/")
async def list_books():
    """List all books."""
    books_dir = _get_books_dir()
    books = []
    if books_dir.exists():
        for item in books_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                meta = _load_book_meta(item)
                books.append({
                    "book_id": item.name,
                    "title": meta.get("title", item.name),
                    "genre": meta.get("genre", "未分类"),
                    "tone": meta.get("tone", "默认"),
                    "chapters": len([d for d in item.iterdir() if d.is_dir() and d.name.startswith("ch")]),
                })
    return books

@router.get("/explorer")
async def get_explorer_tree():
    """Get the full tree structure for all books for the Sidebar Explorer."""
    books_dir = _get_books_dir()
    tree = []
    if not books_dir.exists():
        return tree
        
    for item in books_dir.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            meta = _load_book_meta(item)
            book_id = item.name
            book_node = {
                "id": book_id,
                "label": meta.get("title", book_id),
                "type": "book",
                "children": []
            }
            
            outline_file = item / "outlines" / "outline.json"
            if outline_file.exists():
                try:
                    with open(outline_file, "r", encoding="utf-8") as f:
                        outline_data = json.load(f)
                    book_node["children"] = _inject_status(item, outline_data.get("children", []))
                except Exception:
                    pass
            tree.append(book_node)
    return tree

@router.get("/{book_id}/outline")
async def get_book_outline(book_id: str):
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")
    
    outline_file = book_dir / "outlines" / "outline.json"
    if outline_file.exists():
        with open(outline_file, "r", encoding="utf-8") as f:
            return json.load(f)
            
    # Default initial structure
    meta = _load_book_meta(book_dir)
    return {
        "id": book_id,
        "label": meta.get("title", book_id),
        "type": "book",
        "children": []
    }

@router.post("/{book_id}/outline", summary="Update outline data")
async def update_book_outline(book_id: str, new_data: dict):
    # This remains unchanged
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail="Book not found")
        
    outline_dir = book_dir / "outlines"
    outline_dir.mkdir(exist_ok=True)
    
    file_path = outline_dir / "outline.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)
        return {"status": "success", "message": "Outline updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update outline: {e}")


# ── Tasks API ──

from src.core.task_manager import list_tasks, get_task

@router.get("/{book_id}/tasks", summary="List all tasks for a book")
async def list_book_tasks(book_id: str):
    """Returns all active and completed tasks for the given book."""
    tasks = list_tasks(book_id)
    return tasks

@router.get("/{book_id}/tasks/{task_id}", summary="Get a specific task")
async def get_book_task(book_id: str, task_id: str):
    """Retrieve details for a specific task."""
    task = get_task(book_id, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

from pydantic import BaseModel
class RejectPayload(BaseModel):
    feedback: str

from src.core.task_manager import update_task_status
from src.core.models import TaskStatus

from fastapi import BackgroundTasks
from src.core.lore_agent import extract_and_update_lore

@router.post("/{book_id}/tasks/{task_id}/approve", summary="Approve a pending task")
async def approve_task(book_id: str, task_id: str, background_tasks: BackgroundTasks):
    task = update_task_status(book_id, task_id, TaskStatus.COMPLETED)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Trigger LoreAgent passively
    draft_text = task.payload.get("draft_text", "")
    if draft_text:
        background_tasks.add_task(extract_and_update_lore, book_id, draft_text)
        
    return {"status": "success", "task": task}

@router.post("/{book_id}/tasks/{task_id}/reject", summary="Reject a pending task back to drafting")
async def reject_task(book_id: str, task_id: str, payload: RejectPayload):
    task = get_task(book_id, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    fb = task.payload.get("human_feedback", "")
    new_fb = f"{fb}\n[Human]: {payload.feedback}".strip()
    
    task = update_task_status(
        book_id, task_id, TaskStatus.DRAFTING, 
        payload_updates={"human_feedback": new_fb}
    )
    return {"status": "success", "task": task}

@router.post("/")
async def create_book(book: BookCreate):
    """Create a new book project."""
    book_dir = _get_books_dir() / book.book_id
    if book_dir.exists():
        raise HTTPException(status_code=409, detail=f"书籍 '{book.book_id}' 已存在")

    book_dir.mkdir(parents=True, exist_ok=True)

    # Create subdirectories
    (book_dir / "outlines").mkdir(exist_ok=True)
    (book_dir / "drafts").mkdir(exist_ok=True)
    (book_dir / "reviews").mkdir(exist_ok=True)
    (book_dir / "characters").mkdir(exist_ok=True)

    # Save metadata
    meta = {
        "book_id": book.book_id,
        "title": book.title,
        "genre": book.genre,
        "sub_genres": book.sub_genres,
        "tone": book.tone,
        "world_setting": book.world_setting,
        "protagonist": book.protagonist,
        "synopsis": book.synopsis,
        "target_words": book.target_words,
    }
    with open(book_dir / "book_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return meta


@router.get("/{book_id}")
async def get_book(book_id: str):
    """Get book details."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")
    meta = _load_book_meta(book_dir)
    meta["book_id"] = book_id
    return meta


@router.get("/{book_id}/lore")
async def get_book_lore(book_id: str):
    """Get all lore files for the Lore Book sidebar (world, characters, outline)."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    result = {"meta": _load_book_meta(book_dir)}

    # Load world setting
    ws_path = book_dir / "lore" / "world_setting.json"
    if ws_path.exists():
        try:
            with open(ws_path, "r", encoding="utf-8") as f:
                result["world_setting"] = json.load(f)
        except Exception:
            result["world_setting"] = None
    else:
        result["world_setting"] = None

    # Load characters
    ch_path = book_dir / "lore" / "characters.json"
    if ch_path.exists():
        try:
            with open(ch_path, "r", encoding="utf-8") as f:
                result["characters"] = json.load(f)
        except Exception:
            result["characters"] = None
    else:
        result["characters"] = None

    # Load outline
    ol_path = book_dir / "outlines" / "outline.json"
    if ol_path.exists():
        try:
            with open(ol_path, "r", encoding="utf-8") as f:
                result["outline"] = json.load(f)
        except Exception:
            result["outline"] = None
    else:
        result["outline"] = None

    return result


@router.delete("/{book_id}")
async def delete_book(book_id: str):
    """Delete a book."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")
    import shutil
    shutil.rmtree(book_dir)
    return {"detail": f"书籍 '{book_id}' 已删除"}


@router.patch("/{book_id}")
async def update_book(book_id: str, updates: BookUpdate):
    """Update book metadata (e.g. from Brainstorm co-creation phase)."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")
    
    meta = _load_book_meta(book_dir)
    update_data = updates.model_dump(exclude_unset=True)
    meta.update(update_data)
    
    with open(book_dir / "book_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        
    return meta


@router.post("/{book_id}/materials")
async def upload_materials(book_id: str, files: list[UploadFile] = File(...)):
    """Upload multiple reference documents for the Brainstorm phase."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")
        
    materials_dir = book_dir / "materials"
    materials_dir.mkdir(exist_ok=True)
    
    saved_files = []
    import shutil
    for file in files:
        file_path = materials_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_files.append({"filename": file.filename, "path": str(file_path)})
        
    return {"files": saved_files}


# ── Chapter Draft CRUD ──

def _get_chapter_status(book_dir: Path, chapter_id: str) -> str:
    """Check if a chapter has a draft file. Returns 'outline', 'draft', or 'reviewed'."""
    draft_file = book_dir / "drafts" / f"{chapter_id}.md"
    review_file = book_dir / "reviews" / f"{chapter_id}.json"
    if review_file.exists():
        return "reviewed"
    if draft_file.exists():
        return "draft"
    return "outline"


def _inject_status(book_dir: Path, children: list) -> list:
    """Recursively inject status into each chapter/volume node."""
    result = []
    for node in children:
        n = dict(node)
        if n.get("type") == "chapter":
            n["status"] = _get_chapter_status(book_dir, n["id"])
            # Also inject word count if draft exists
            draft_file = book_dir / "drafts" / f"{n['id']}.md"
            if draft_file.exists():
                n["word_count"] = len(draft_file.read_text(encoding="utf-8"))
            else:
                n["word_count"] = 0
        if n.get("children"):
            n["children"] = _inject_status(book_dir, n["children"])
        result.append(n)
    return result


@router.get("/{book_id}/chapters/{chapter_id}")
async def get_chapter(book_id: str, chapter_id: str):
    """Get chapter data: outline summary + draft content + status."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    # Find chapter in outline
    outline_file = book_dir / "outlines" / "outline.json"
    summary = ""
    label = chapter_id
    if outline_file.exists():
        with open(outline_file, "r", encoding="utf-8") as f:
            outline = json.load(f)
        # Search for chapter in tree
        def find_chapter(nodes, cid):
            for n in nodes:
                if n.get("id") == cid:
                    return n
                found = find_chapter(n.get("children", []), cid)
                if found:
                    return found
            return None
        ch = find_chapter(outline.get("children", []), chapter_id)
        if ch:
            summary = ch.get("summary", "")
            label = ch.get("label", chapter_id)

    # Load draft if exists
    draft_file = book_dir / "drafts" / f"{chapter_id}.md"
    content = ""
    if draft_file.exists():
        content = draft_file.read_text(encoding="utf-8")

    status = _get_chapter_status(book_dir, chapter_id)

    return {
        "chapter_id": chapter_id,
        "label": label,
        "summary": summary,
        "content": content,
        "status": status,
        "word_count": len(content),
    }


@router.put("/{book_id}/chapters/{chapter_id}")
async def save_chapter(book_id: str, chapter_id: str, body: dict):
    """Save chapter draft content."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    drafts_dir = book_dir / "drafts"
    drafts_dir.mkdir(exist_ok=True)

    content = body.get("content", "")
    draft_file = drafts_dir / f"{chapter_id}.md"
    with open(draft_file, "w", encoding="utf-8") as f:
        f.write(content)

    return {"status": "saved", "word_count": len(content)}


@router.get("/{book_id}/chapters")
async def list_chapters(book_id: str):
    """List all chapters with their status and word counts."""
    book_dir = _get_books_dir() / book_id
    if not book_dir.exists():
        raise HTTPException(status_code=404, detail=f"书籍 '{book_id}' 不存在")

    outline_file = book_dir / "outlines" / "outline.json"
    if not outline_file.exists():
        return {"chapters": []}

    with open(outline_file, "r", encoding="utf-8") as f:
        outline = json.load(f)

    chapters = []
    def collect_chapters(nodes):
        for n in nodes:
            if n.get("type") == "chapter":
                chapters.append({
                    "id": n["id"],
                    "label": n.get("label", n["id"]),
                    "summary": n.get("summary", ""),
                    "status": _get_chapter_status(book_dir, n["id"]),
                    "word_count": len((book_dir / "drafts" / f"{n['id']}.md").read_text(encoding="utf-8"))
                        if (book_dir / "drafts" / f"{n['id']}.md").exists() else 0,
                })
            collect_chapters(n.get("children", []))
    collect_chapters(outline.get("children", []))
    return {"chapters": chapters, "total_words": sum(c["word_count"] for c in chapters)}

