"""
Migration utility for AutoNovel-Studio v2.1.
Migrates existing flat directory structure to new book-based structure.

OLD STRUCTURE:
AutoNovel-Studio/
├── 00_Config/
│   └── book_meta.json
├── 01_Global_Settings/
│   ├── world_lore.json
│   └── characters.json
├── 02_Outlines/
│   ├── volume_01.md
│   └── chapter outlines...
├── 03_Story_Memory/
│   ├── full_summaries.md
│   └── recent_chapters/
├── 04_Drafts/
│   └── chapter drafts...
└── 05_Reviews/
    └── reviews...

NEW STRUCTURE:
books/
└── book_001_title/
    ├── 00_Config/
    ├── 01_Global_Settings/
    ├── 02_Outlines/
    ├── 03_Story_Memory/
    ├── 04_Drafts/
    │   └── chXX/
    ├── 05_Reviews/
    │   └── chXX/
    └── .backup/
"""
import json
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class LegacyMigrator:
    """
    迁移工具 - 将现有数据迁移到新结构

    Usage:
        migrator = LegacyMigrator(source_dir=".", target_dir="books")
        migrator.migrate(
            book_id="book_001",
            title="My Novel",
            create_backup=True
        )
    """

    def __init__(self, source_dir: str = ".", target_dir: str = "books"):
        """
        Initialize migrator.

        Args:
            source_dir: Source directory (old structure)
            target_dir: Target directory (new books/ structure)
        """
        self.source_dir = Path(source_dir)
        self.target_dir = Path(target_dir)

    def detect_existing_project(self) -> bool:
        """
        Detect if existing project data is present.

        Returns:
            True if old structure detected
        """
        required_paths = [
            self.source_dir / "00_Config",
            self.source_dir / "01_Global_Settings",
            self.source_dir / "02_Outlines",
            self.source_dir / "04_Drafts",
        ]

        return all(p.exists() for p in required_paths)

    def load_existing_metadata(self) -> Optional[Dict[str, Any]]:
        """
        Load existing book_meta.json.

        Returns:
            Metadata dict or None if not found
        """
        meta_path = self.source_dir / "00_Config" / "book_meta.json"

        if not meta_path.exists():
            logger.warning("No existing book_meta.json found")
            return None

        with open(meta_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def migrate(
        self,
        book_id: str,
        title: Optional[str] = None,
        genre: Optional[str] = None,
        sub_genres: Optional[list] = None,
        tone: Optional[str] = None,
        forbidden_elements: Optional[list] = None,
        create_backup: bool = True
    ) -> Dict[str, Any]:
        """
        Migrate existing project to new structure.

        Args:
            book_id: New book ID (e.g., 'book_001')
            title: Book title (if not in existing metadata)
            genre: Main genre (if not in existing metadata)
            sub_genres: Sub-genres (if not in existing metadata)
            tone: Overall tone (if not in existing metadata)
            forbidden_elements: Forbidden elements (if not in existing metadata)
            create_backup: Whether to backup source before migration

        Returns:
            Migration report dict
        """
        logger.info(f"Starting migration to {book_id}...")

        report = {
            "book_id": book_id,
            "success": False,
            "migrated_files": [],
            "errors": [],
            "warnings": []
        }

        try:
            # Detect existing project
            if not self.detect_existing_project():
                raise ValueError("No existing project structure detected")

            # Create backup if requested
            if create_backup:
                backup_path = self.source_dir / f".backup_migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                logger.info(f"Creating backup at {backup_path}...")
                # TODO: Implement full backup logic

            # Load existing metadata
            existing_meta = self.load_existing_metadata()

            # Determine metadata
            if existing_meta:
                title = title or existing_meta.get("title", "Untitled")
                genre = genre or existing_meta.get("genre", "Unknown")
                sub_genres = sub_genres or existing_meta.get("sub_genres", [])
                tone = tone or existing_meta.get("tone", "")
                forbidden_elements = forbidden_elements or existing_meta.get("forbidden_elements", [])

            # Create target book directory
            from ..core.book_manager import BookPathManager, BookManager
            path_manager = BookPathManager(library_root=str(self.target_dir))
            book_manager = BookManager(path_manager)

            # Create book
            book_meta = book_manager.create_book(
                book_id=book_id,
                title=title,
                genre=genre or "Unknown",
                sub_genres=sub_genres or [],
                tone=tone or "",
                forbidden_elements=forbidden_elements or []
            )

            report["migrated_files"].append(f"Created book metadata: {book_id}")

            # Migrate configuration files
            self._migrate_config(path_manager, book_id, report)

            # Migrate outlines
            self._migrate_outlines(path_manager, book_id, report)

            # Migrate story memory
            self._migrate_story_memory(path_manager, book_id, report)

            # Migrate drafts
            self._migrate_drafts(path_manager, book_id, report)

            # Migrate reviews
            self._migrate_reviews(path_manager, book_id, report)

            report["success"] = True
            logger.info(f"Migration completed successfully for {book_id}")

        except Exception as e:
            report["errors"].append(str(e))
            logger.error(f"Migration failed: {e}")

        return report

    def _migrate_config(self, path_manager, book_id: str, report: dict) -> None:
        """Migrate configuration files."""
        logger.info("Migrating configuration files...")

        # Global settings
        source_settings = self.source_dir / "01_Global_Settings"
        target_settings = path_manager.get_global_settings_dir(book_id)

        if source_settings.exists():
            # world_lore.json
            world_lore_src = source_settings / "world_lore.json"
            if world_lore_src.exists():
                shutil.copy2(world_lore_src, target_settings / "world_lore.json")
                report["migrated_files"].append("world_lore.json")

            # characters.json
            characters_src = source_settings / "characters.json"
            if characters_src.exists():
                shutil.copy2(characters_src, target_settings / "characters.json")
                report["migrated_files"].append("characters.json")

    def _migrate_outlines(self, path_manager, book_id: str, report: dict) -> None:
        """Migrate outline files."""
        logger.info("Migrating outlines...")

        source_outlines = self.source_dir / "02_Outlines"
        target_outlines = path_manager.get_outlines_dir(book_id)

        if source_outlines.exists():
            # Copy all outline files
            for file in source_outlines.iterdir():
                if file.is_file():
                    shutil.copy2(file, target_outlines / file.name)
                    report["migrated_files"].append(f"02_Outlines/{file.name}")

    def _migrate_story_memory(self, path_manager, book_id: str, report: dict) -> None:
        """Migrate story memory files."""
        logger.info("Migrating story memory...")

        source_memory = self.source_dir / "03_Story_Memory"
        target_memory = path_manager.get_story_memory_dir(book_id)

        if source_memory.exists():
            # full_summaries.md
            full_summaries_src = source_memory / "full_summaries.md"
            if full_summaries_src.exists():
                shutil.copy2(full_summaries_src, target_memory / "full_summaries.md")
                report["migrated_files"].append("full_summaries.md")

            # recent_chapters/
            recent_src = source_memory / "recent_chapters"
            if recent_src.exists():
                recent_dst = path_manager.get_recent_chapters_dir(book_id)
                for file in recent_src.iterdir():
                    if file.is_file():
                        shutil.copy2(file, recent_dst / file.name)
                        report["migrated_files"].append(f"03_Story_Memory/recent_chapters/{file.name}")

    def _migrate_drafts(self, path_manager, book_id: str, report: dict) -> None:
        """
        Migrate draft files.

        NOTE: Old structure stores drafts as ch01_scene_1.txt
        New structure stores as 04_Drafts/ch01/scene_01_v1.txt
        """
        logger.info("Migrating drafts...")

        source_drafts = self.source_dir / "04_Drafts"

        if not source_drafts.exists():
            return

        # Parse existing draft files
        draft_files = list(source_drafts.glob("ch*_scene_*.txt"))

        for draft_file in draft_files:
            # Parse filename: ch01_scene_1.txt
            parts = draft_file.stem.split("_scene_")
            if len(parts) != 2:
                report["warnings"].append(f"Could not parse draft filename: {draft_file.name}")
                continue

            chapter_part = parts[0]  # "ch01"
            scene_part = parts[1]  # "1"

            # Extract chapter and scene numbers
            try:
                chapter_num = int(chapter_part.replace("ch", ""))
                scene_num = int(scene_part)
            except ValueError:
                report["warnings"].append(f"Could not parse numbers from: {draft_file.name}")
                continue

            # Create target directory
            target_dir = path_manager.get_chapter_drafts_dir(book_id, chapter_num)
            target_dir.mkdir(parents=True, exist_ok=True)

            # Copy as version 1
            target_file = target_dir / f"scene_{scene_num:02d}_v1.txt"

            shutil.copy2(draft_file, target_file)
            report["migrated_files"].append(f"04_Drafts/{chapter_part}/scene_{scene_num:02d}_v1.txt")

            # Update book state
            from ..core.book_manager import BookManager
            book_manager = BookManager(path_manager)
            state = book_manager.load_book_state(book_id)
            if state:
                scene_key = f"ch{chapter_num:02d}_scene{scene_num:02d}"
                state.scene_versions[scene_key] = 1

                # Update current position
                if chapter_num > state.current_chapter:
                    state.current_chapter = chapter_num
                    state.current_scene = 1
                elif chapter_num == state.current_chapter and scene_num > state.current_scene:
                    state.current_scene = scene_num

                # Save state
                state_path = path_manager.get_book_state_path(book_id)
                with open(state_path, 'w', encoding='utf-8') as f:
                    json.dump(state.model_dump(), f, ensure_ascii=False, indent=2)

    def _migrate_reviews(self, path_manager, book_id: str, report: dict) -> None:
        """Migrate review files."""
        logger.info("Migrating reviews...")

        source_reviews = self.source_dir / "05_Reviews"

        if not source_reviews.exists():
            return

        # Copy all review files
        for file in source_reviews.iterdir():
            if file.is_file() and file.suffix == ".json":
                # Parse filename to determine chapter
                # e.g., ch01_v1_readers.json
                parts = file.stem.split("_")
                if parts and parts[0].startswith("ch"):
                    try:
                        chapter_num = int(parts[0].replace("ch", ""))
                        target_dir = path_manager.get_chapter_reviews_dir(book_id, chapter_num)
                        target_dir.mkdir(parents=True, exist_ok=True)

                        # Copy file
                        shutil.copy2(file, target_dir / file.name)
                        report["migrated_files"].append(f"05_Reviews/ch{chapter_num:02d}/{file.name}")
                    except ValueError:
                        report["warnings"].append(f"Could not parse chapter from: {file.name}")


def print_migration_report(report: Dict[str, Any]) -> None:
    """Print migration report in human-readable format."""
    print("\n" + "="*60)
    print("MIGRATION REPORT")
    print("="*60)

    print(f"\nBook ID: {report['book_id']}")
    print(f"Status: {'SUCCESS' if report['success'] else 'FAILED'}")

    if report['migrated_files']:
        print(f"\nMigrated Files ({len(report['migrated_files'])}):")
        for file in report['migrated_files'][:20]:  # Show first 20
            print(f"  - {file}")
        if len(report['migrated_files']) > 20:
            print(f"  ... and {len(report['migrated_files']) - 20} more")

    if report['warnings']:
        print(f"\nWarnings ({len(report['warnings'])}):")
        for warning in report['warnings']:
            print(f"  - {warning}")

    if report['errors']:
        print(f"\nErrors ({len(report['errors'])}):")
        for error in report['errors']:
            print(f"  - {error}")

    print("\n" + "="*60 + "\n")


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    migrator = LegacyMigrator(source_dir=".", target_dir="books")

    if migrator.detect_existing_project():
        print("Existing project detected. Starting migration...")

        report = migrator.migrate(
            book_id="book_001",
            title="My Novel",
            create_backup=True
        )

        print_migration_report(report)
    else:
        print("No existing project found. Nothing to migrate.")
