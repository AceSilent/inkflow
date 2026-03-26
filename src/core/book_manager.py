"""
Book Management System for AutoNovel-Studio v2.1.
Provides complete project isolation with separate directories for each book.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

from .models import BookMetadata, BookState, SceneInfo, SceneStatus

logger = logging.getLogger(__name__)


class BookPathManager:
    """
    书籍路径管理器

    Provides path resolution for the new book directory structure:
    books/
    └── book_001_title/
        ├── 00_Config/
        │   ├── book_meta.json
        │   └── book_state.json
        ├── 01_Global_Settings/
        │   ├── world_lore.json
        │   └── characters.json
        ├── 02_Outlines/
        │   ├── volume_01.md
        │   └── chapter_01_outline.json
        ├── 03_Story_Memory/
        │   ├── full_summaries.md
        │   └── recent_chapters/
        ├── 04_Drafts/
        │   ├── ch01/
        │   │   ├── scene_01_v1.txt
        │   │   └── scene_01_v2.txt
        │   └── ch02/
        ├── 05_Reviews/
        │   ├── ch01/
        │   │   ├── scene_01_v1_readers.json
        │   │   └── scene_01_v1_editor.json
        │   └── ch02/
        └── .backup/
    """

    def __init__(self, library_root: str = "books"):
        """
        Initialize BookPathManager.

        Args:
            library_root: Root directory for all books (default: "books")
        """
        self.library_root = Path(library_root)

    def get_library_root(self) -> Path:
        """Get library root directory."""
        return self.library_root

    def get_book_dir(self, book_id: str) -> Path:
        """
        Get book directory path.

        Args:
            book_id: Book identifier (e.g., 'book_001')

        Returns:
            Path to book directory
        """
        return self.library_root / book_id

    def list_all_books(self) -> List[str]:
        """
        List all book IDs in the library.

        Returns:
            List of book IDs
        """
        if not self.library_root.exists():
            return []

        book_dirs = [d.name for d in self.library_root.iterdir() if d.is_dir()]
        return sorted(book_dirs)

    # ========================================================================
    # Configuration Directories
    # ========================================================================

    def get_config_dir(self, book_id: str) -> Path:
        """Get config directory: books/book_XXX/00_Config/"""
        return self.get_book_dir(book_id) / "00_Config"

    def get_book_meta_path(self, book_id: str) -> Path:
        """Get book metadata path: books/book_XXX/00_Config/book_meta.json"""
        return self.get_config_dir(book_id) / "book_meta.json"

    def get_book_state_path(self, book_id: str) -> Path:
        """Get book state path: books/book_XXX/00_Config/book_state.json"""
        return self.get_config_dir(book_id) / "book_state.json"

    def get_global_settings_dir(self, book_id: str) -> Path:
        """Get global settings directory: books/book_XXX/01_Global_Settings/"""
        return self.get_book_dir(book_id) / "01_Global_Settings"

    def get_world_lore_path(self, book_id: str) -> Path:
        """Get world lore path: books/book_XXX/01_Global_Settings/world_lore.json"""
        return self.get_global_settings_dir(book_id) / "world_lore.json"

    def get_characters_path(self, book_id: str) -> Path:
        """Get characters path: books/book_XXX/01_Global_Settings/characters.json"""
        return self.get_global_settings_dir(book_id) / "characters.json"

    # ========================================================================
    # Outline Directories
    # ========================================================================

    def get_outlines_dir(self, book_id: str) -> Path:
        """Get outlines directory: books/book_XXX/02_Outlines/"""
        return self.get_book_dir(book_id) / "02_Outlines"

    def get_volume_outline_path(self, book_id: str, volume_num: int = 1) -> Path:
        """Get volume outline path: books/book_XXX/02_Outlines/volume_XX.md"""
        return self.get_outlines_dir(book_id) / f"volume_{volume_num:02d}.md"

    def get_chapter_outline_path(self, book_id: str, chapter_num: int) -> Path:
        """Get chapter outline path: books/book_XXX/02_Outlines/chapter_XX_outline.json"""
        return self.get_outlines_dir(book_id) / f"chapter_{chapter_num:02d}_outline.json"

    def get_scene_outline_path(self, book_id: str, chapter_num: int, scene_num: int) -> Path:
        """Get scene outline path: books/book_XXX/02_Outlines/chapter_XX_scene_Y_outline.json"""
        return self.get_outlines_dir(book_id) / f"chapter_{chapter_num:02d}_scene_{scene_num}_outline.json"

    # ========================================================================
    # Story Memory Directories
    # ========================================================================

    def get_story_memory_dir(self, book_id: str) -> Path:
        """Get story memory directory: books/book_XXX/03_Story_Memory/"""
        return self.get_book_dir(book_id) / "03_Story_Memory"

    def get_full_summaries_path(self, book_id: str) -> Path:
        """Get full summaries path: books/book_XXX/03_Story_Memory/full_summaries.md"""
        return self.get_story_memory_dir(book_id) / "full_summaries.md"

    def get_recent_chapters_dir(self, book_id: str) -> Path:
        """Get recent chapters directory: books/book_XXX/03_Story_Memory/recent_chapters/"""
        return self.get_story_memory_dir(book_id) / "recent_chapters"

    def get_recent_chapter_path(self, book_id: str, chapter_num: int) -> Path:
        """Get recent chapter path: books/book_XXX/03_Story_Memory/recent_chapters/chXX.txt"""
        return self.get_recent_chapters_dir(book_id) / f"ch{chapter_num:02d}.txt"

    # ========================================================================
    # Draft Directories
    # ========================================================================

    def get_drafts_dir(self, book_id: str) -> Path:
        """Get drafts directory: books/book_XXX/04_Drafts/"""
        return self.get_book_dir(book_id) / "04_Drafts"

    def get_chapter_drafts_dir(self, book_id: str, chapter_num: int) -> Path:
        """Get chapter drafts directory: books/book_XXX/04_Drafts/chXX/"""
        return self.get_drafts_dir(book_id) / f"ch{chapter_num:02d}"

    def get_scene_draft_path(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> Path:
        """
        Get scene draft path: books/book_XXX/04_Drafts/chXX/scene_YY_vZ.txt

        Args:
            book_id: Book identifier
            chapter_num: Chapter number (1-indexed)
            scene_num: Scene number (1-indexed)
            version: Draft version number

        Returns:
            Path to scene draft file
        """
        return self.get_chapter_drafts_dir(book_id, chapter_num) / f"scene_{scene_num:02d}_v{version}.txt"

    def get_latest_scene_draft_path(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> Path:
        """
        Get latest scene draft path (alias without version suffix).
        This is the "current" version that gets overwritten during generation.
        """
        return self.get_chapter_drafts_dir(book_id, chapter_num) / f"scene_{scene_num:02d}.txt"

    # ========================================================================
    # Review Directories
    # ========================================================================

    def get_reviews_dir(self, book_id: str) -> Path:
        """Get reviews directory: books/book_XXX/05_Reviews/"""
        return self.get_book_dir(book_id) / "05_Reviews"

    def get_chapter_reviews_dir(self, book_id: str, chapter_num: int) -> Path:
        """Get chapter reviews directory: books/book_XXX/05_Reviews/chXX/"""
        return self.get_reviews_dir(book_id) / f"ch{chapter_num:02d}"

    def get_scene_review_path(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> Path:
        """
        Get scene review path: books/book_XXX/05_Reviews/chXX/scene_YY_vZ_reviews.json

        Args:
            book_id: Book identifier
            chapter_num: Chapter number (1-indexed)
            scene_num: Scene number (1-indexed)
            version: Draft version number

        Returns:
            Path to scene review file
        """
        return self.get_chapter_reviews_dir(book_id, chapter_num) / f"scene_{scene_num:02d}_v{version}_reviews.json"

    def get_scene_editor_path(
        self,
        book_id: str,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> Path:
        """
        Get scene editor path: books/book_XXX/05_Reviews/chXX/scene_YY_vZ_editor.json
        """
        return self.get_chapter_reviews_dir(book_id, chapter_num) / f"scene_{scene_num:02d}_v{version}_editor.json"

    # ========================================================================
    # Backup Directory
    # ========================================================================

    def get_backup_dir(self, book_id: str) -> Path:
        """Get backup directory: books/book_XXX/.backup/"""
        return self.get_book_dir(book_id) / ".backup"

    def get_timestamped_backup_path(self, book_id: str, filename: str) -> Path:
        """
        Get timestamped backup path: books/book_XXX/.backup/filename_YYYYMMDD_HHMMSS.json

        Args:
            book_id: Book identifier
            filename: Original filename

        Returns:
            Path to timestamped backup file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return self.get_backup_dir(book_id) / f"{filename}_{timestamp}"

    # ========================================================================
    # Directory Creation Utilities
    # ========================================================================

    def create_book_directory_structure(self, book_id: str) -> None:
        """
        Create complete directory structure for a new book.

        Args:
            book_id: Book identifier
        """
        book_dir = self.get_book_dir(book_id)

        # Create all directories
        directories = [
            self.get_config_dir(book_id),
            self.get_global_settings_dir(book_id),
            self.get_outlines_dir(book_id),
            self.get_story_memory_dir(book_id),
            self.get_recent_chapters_dir(book_id),
            self.get_drafts_dir(book_id),
            self.get_reviews_dir(book_id),
            self.get_backup_dir(book_id),
        ]

        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created directory: {directory}")

        logger.info(f"Book directory structure created for {book_id}")


class BookManager:
    """
    书籍管理器 - 核心CRUD操作

    Manages book metadata, state, and provides high-level operations.
    """

    def __init__(self, path_manager: BookPathManager):
        """
        Initialize BookManager.

        Args:
            path_manager: BookPathManager instance
        """
        self.path_manager = path_manager

    def create_book(
        self,
        book_id: str,
        title: str,
        genre: str,
        sub_genres: List[str],
        tone: str,
        forbidden_elements: List[str],
        target_word_count: Optional[Dict[str, int]] = None
    ) -> BookMetadata:
        """
        Create a new book project.

        Args:
            book_id: Unique book identifier
            title: Book title
            genre: Main genre
            sub_genres: Sub-genres
            tone: Overall tone/mood
            forbidden_elements: List of forbidden tropes/elements
            target_word_count: Target word counts (default: {"chapter": 3000, "scene": 800})

        Returns:
            BookMetadata object
        """
        logger.info(f"Creating new book: {book_id} - {title}")

        # Create directory structure
        self.path_manager.create_book_directory_structure(book_id)

        # Create book metadata
        book_meta = BookMetadata(
            book_id=book_id,
            title=title,
            genre=genre,
            sub_genres=sub_genres,
            tone=tone,
            forbidden_elements=forbidden_elements,
            target_word_count=target_word_count or {"chapter": 3000, "scene": 800},
            creation_date=datetime.now().isoformat(),
            last_modified=datetime.now().isoformat(),
            status="planning",
            statistics={}
        )

        # Save book metadata
        meta_path = self.path_manager.get_book_meta_path(book_id)
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(book_meta.model_dump(), f, ensure_ascii=False, indent=2)

        # Create initial book state
        book_state = BookState(
            book_id=book_id,
            current_chapter=1,
            current_scene=1,
            chapter_status={1: "pending"},
            scene_versions={},
            auto_save_enabled=True,
            last_auto_save=None,
            outdated_scenes=[]
        )

        # Save book state
        state_path = self.path_manager.get_book_state_path(book_id)
        with open(state_path, 'w', encoding='utf-8') as f:
            json.dump(book_state.model_dump(), f, ensure_ascii=False, indent=2)

        logger.info(f"Book created successfully: {book_id}")
        return book_meta

    def load_book_metadata(self, book_id: str) -> Optional[BookMetadata]:
        """
        Load book metadata.

        Args:
            book_id: Book identifier

        Returns:
            BookMetadata object or None if not found
        """
        meta_path = self.path_manager.get_book_meta_path(book_id)

        if not meta_path.exists():
            logger.warning(f"Book metadata not found: {book_id}")
            return None

        with open(meta_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return BookMetadata(**data)

    def load_book_state(self, book_id: str) -> Optional[BookState]:
        """
        Load book state.

        Args:
            book_id: Book identifier

        Returns:
            BookState object or None if not found
        """
        state_path = self.path_manager.get_book_state_path(book_id)

        if not state_path.exists():
            logger.warning(f"Book state not found: {book_id}")
            return None

        with open(state_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return BookState(**data)

    def update_book_metadata(self, book_id: str, **kwargs) -> None:
        """
        Update book metadata fields.

        Args:
            book_id: Book identifier
            **kwargs: Fields to update (e.g., title="New Title", status="in_progress")
        """
        book_meta = self.load_book_metadata(book_id)
        if book_meta is None:
            raise ValueError(f"Book not found: {book_id}")

        # Update fields
        for key, value in kwargs.items():
            if hasattr(book_meta, key):
                setattr(book_meta, key, value)
            else:
                logger.warning(f"Invalid field for BookMetadata: {key}")

        # Update last_modified timestamp
        book_meta.last_modified = datetime.now().isoformat()

        # Save updated metadata
        meta_path = self.path_manager.get_book_meta_path(book_id)
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(book_meta.model_dump(), f, ensure_ascii=False, indent=2)

        logger.info(f"Book metadata updated: {book_id}")

    def list_books(self) -> List[Dict[str, Any]]:
        """
        List all books in the library.

        Returns:
            List of book summaries
        """
        book_ids = self.path_manager.list_all_books()
        books = []

        for book_id in book_ids:
            book_meta = self.load_book_metadata(book_id)
            if book_meta:
                books.append({
                    "book_id": book_meta.book_id,
                    "title": book_meta.title,
                    "genre": book_meta.genre,
                    "status": book_meta.status,
                    "creation_date": book_meta.creation_date,
                    "last_modified": book_meta.last_modified
                })

        return books

    def delete_book(self, book_id: str, confirm: bool = False) -> None:
        """
        Delete a book project.

        WARNING: This will permanently delete all book data!

        Args:
            book_id: Book identifier
            confirm: Must be True to confirm deletion
        """
        if not confirm:
            raise ValueError("Must confirm=True to delete book")

        logger.warning(f"Deleting book: {book_id}")

        book_dir = self.path_manager.get_book_dir(book_id)

        # Delete entire book directory
        import shutil
        shutil.rmtree(book_dir)

        logger.info(f"Book deleted: {book_id}")
