import os
import json
from pathlib import Path

def _get_book_dir(book_id: str) -> Path:
    data_dir = os.environ.get("AUTONOVEL_DATA_DIR", "books")
    return Path(data_dir) / book_id

def read_file(book_id: str, relative_path: str) -> str:
    """Read a specific file from the book's directory."""
    book_dir = _get_book_dir(book_id)
    target_path = book_dir / relative_path
    
    # Security: prevent path traversal
    try:
        resolved_target = target_path.resolve()
        resolved_book = book_dir.resolve()
        if not str(resolved_target).startswith(str(resolved_book)):
            return f"Error: Access denied to path outside book directory."
    except Exception:
        return "Error: Invalid path."
        
    if not target_path.exists():
        return f"Error: File '{relative_path}' not found."
    if not target_path.is_file():
        return f"Error: '{relative_path}' is not a file."
        
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"

def search_lore(book_id: str, query: str) -> str:
    """Search for a character, location, or item in the lore JSONs."""
    book_dir = _get_book_dir(book_id)
    lore_dir = book_dir / "01_Global_Settings"
    
    results = []
    
    # Search characters
    char_file = lore_dir / "characters.json"
    if char_file.exists():
        try:
            with open(char_file, "r", encoding="utf-8") as f:
                chars = json.load(f)
                for name, data in chars.items():
                    if query.lower() in name.lower() or query.lower() in str(data).lower():
                        results.append(f"Character: {name}\n{json.dumps(data, ensure_ascii=False, indent=2)}")
        except Exception:
            pass
            
    # Search world lore
    world_file = lore_dir / "world_lore.json"
    if world_file.exists():
        try:
            with open(world_file, "r", encoding="utf-8") as f:
                world = json.load(f)
                for name, data in world.items():
                    if query.lower() in name.lower() or query.lower() in str(data).lower():
                        results.append(f"World Lore: {name}\n{json.dumps(data, ensure_ascii=False, indent=2)}")
        except Exception:
            pass
            
    if not results:
        return f"No matching lore entries found for '{query}'."
        
    return "\n\n".join(results)

def read_outline(book_id: str, volume: int = None) -> str:
    """Read the book's outline, optionally filtered by volume."""
    book_dir = _get_book_dir(book_id)
    outline_file = book_dir / "02_Outlines" / "outline.json"
    
    if not outline_file.exists():
        return "Error: Outline file not found."
        
    try:
        with open(outline_file, "r", encoding="utf-8") as f:
            outline_data = json.load(f)
            
        if volume is not None:
            # Try to find the specific volume
            volumes = outline_data.get("volumes", [])
            for vol in volumes:
                # Basic matching (could be improved)
                if str(volume) in str(vol.get("title", "")):
                    return json.dumps(vol, ensure_ascii=False, indent=2)
            return f"Error: Volume {volume} not found in outline."
            
        return json.dumps(outline_data, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Error reading outline: {e}"

# ── OpenAI Tool Schemas ──

AUTHOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a specific file from the book's directory. Use this to read specific chapters or documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "relative_path": {
                        "type": "string",
                        "description": "The relative path to the file, e.g., '04_Drafts/chapter_1.txt' or '02_Outlines/outline.json'."
                    }
                },
                "required": ["relative_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_lore",
            "description": "Search the book's lore (characters, world settings) for a specific keyword or name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The keyword to search for, e.g., 'Vera', 'Magic System', or 'Sword of Light'."
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_outline",
            "description": "Read the book's overall outline or a specific volume's outline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "volume": {
                        "type": "integer",
                        "description": "The volume number to read (optional). If not provided, reads the entire outline."
                    }
                }
            }
        }
    }
]
