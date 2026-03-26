"""
File system utilities for AutoNovel-Studio.
Implements version control, backup, and no-overwrite policies.
"""
import os
import json
import shutil
from pathlib import Path
from typing import Any, Optional, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class FileManager:
    """
    Manages file operations with version control and backup.
    Enforces the NO_OVERWRITE policy.
    """

    def __init__(self, project_root: str = "."):
        """
        Initialize file manager.

        Args:
            project_root: Root directory of the project
        """
        self.project_root = Path(project_root).resolve()
        self.backup_dir = self.project_root / ".backup"

        # Ensure backup directory exists
        self.backup_dir.mkdir(exist_ok=True)

    def _get_next_version(self, file_path: Path) -> int:
        """
        Get the next version number for a file.

        Args:
            file_path: Path to the file

        Returns:
            Next version number
        """
        if not file_path.exists():
            return 1

        # Extract base name and extension
        stem = file_path.stem
        suffix = file_path.suffix

        # Check for existing versions
        parent = file_path.parent
        existing_versions = []

        for f in parent.glob(f"{stem}_v*{suffix}"):
            try:
                # Extract version number
                version_str = f.stem.split("_v")[1]
                version = int(version_str)
                existing_versions.append(version)
            except (IndexError, ValueError):
                continue

        if not existing_versions:
            return 1

        return max(existing_versions) + 1

    def get_versioned_path(self, base_path: str, version: Optional[int] = None) -> Path:
        """
        Get a versioned file path.

        Args:
            base_path: Base file path
            version: Specific version number (auto-increment if None)

        Returns:
            Versioned file path
        """
        path = self.project_root / base_path

        if version is None:
            version = self._get_next_version(path)

        stem = path.stem
        suffix = path.suffix
        versioned_name = f"{stem}_v{version}{suffix}"

        return path.parent / versioned_name

    def backup_file(self, file_path: Path) -> Optional[Path]:
        """
        Create a backup of a file.

        Args:
            file_path: Path to the file to backup

        Returns:
            Backup file path, or None if file doesn't exist
        """
        if not file_path.exists():
            return None

        # Create timestamped backup
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{file_path.stem}_{timestamp}{file_path.suffix}"

        # Preserve relative path structure in backup
        rel_path = file_path.relative_to(self.project_root)
        backup_path = self.backup_dir / rel_path.parent / backup_name

        # Create parent directories
        backup_path.parent.mkdir(parents=True, exist_ok=True)

        # Copy file
        shutil.copy2(file_path, backup_path)
        logger.info(f"Backed up {file_path} to {backup_path}")

        return backup_path

    def write_json(
        self,
        file_path: str,
        data: Any,
        version: bool = True,
        backup: bool = True
    ) -> Path:
        """
        Write JSON data to a file with versioning.

        Args:
            file_path: Relative path to the file
            data: Data to write (must be JSON-serializable)
            version: Whether to use versioning
            backup: Whether to backup existing file

        Returns:
            Path to the written file
        """
        target_path = self.project_root / file_path

        # Backup existing file
        if backup and target_path.exists():
            self.backup_file(target_path)

        # Use versioned path if requested
        if version:
            target_path = self.get_versioned_path(file_path)

        # Create parent directories
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # Write data
        with open(target_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"Written JSON to {target_path}")
        return target_path

    def read_json(self, file_path: str, default: Any = None) -> Any:
        """
        Read JSON data from a file.

        Args:
            file_path: Relative path to the file
            default: Default value if file doesn't exist

        Returns:
            Parsed JSON data
        """
        target_path = self.project_root / file_path

        if not target_path.exists():
            return default

        try:
            with open(target_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from {target_path}: {e}")
            raise

    def write_text(
        self,
        file_path: str,
        content: str,
        version: bool = True,
        backup: bool = True,
        encoding: str = 'utf-8'
    ) -> Path:
        """
        Write text content to a file with versioning.

        Args:
            file_path: Relative path to the file
            content: Text content to write
            version: Whether to use versioning
            backup: Whether to backup existing file
            encoding: File encoding

        Returns:
            Path to the written file
        """
        target_path = self.project_root / file_path

        # Backup existing file
        if backup and target_path.exists():
            self.backup_file(target_path)

        # Use versioned path if requested
        if version:
            target_path = self.get_versioned_path(file_path)

        # Create parent directories
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        with open(target_path, 'w', encoding=encoding) as f:
            f.write(content)

        logger.info(f"Written text to {target_path}")
        return target_path

    def read_text(self, file_path: str, default: Optional[str] = None) -> Optional[str]:
        """
        Read text content from a file.

        Args:
            file_path: Relative path to the file
            default: Default value if file doesn't exist

        Returns:
            File content or default
        """
        target_path = self.project_root / file_path

        if not target_path.exists():
            return default

        with open(target_path, 'r', encoding='utf-8') as f:
            return f.read()

    def list_versions(self, base_path: str) -> List[Path]:
        """
        List all versions of a file.

        Args:
            base_path: Base file path (without version suffix)

        Returns:
            List of versioned file paths sorted by version
        """
        path = self.project_root / base_path
        stem = path.stem
        suffix = path.suffix

        versions = []
        for f in path.parent.glob(f"{stem}_v*{suffix}"):
            versions.append(f)

        # Sort by version number
        versions.sort(key=lambda p: int(p.stem.split("_v")[1]))

        return versions

    def get_latest_version(self, base_path: str) -> Optional[Path]:
        """
        Get the latest version of a file.

        Args:
            base_path: Base file path

        Returns:
            Path to latest version, or None if no versions exist
        """
        versions = self.list_versions(base_path)
        return versions[-1] if versions else None

    def file_exists(self, file_path: str) -> bool:
        """
        Check if a file exists.

        Args:
            file_path: Relative path to check

        Returns:
            True if file exists
        """
        return (self.project_root / file_path).exists()

    def delete_file(self, file_path: str, backup: bool = True) -> bool:
        """
        Delete a file (with optional backup).

        Args:
            file_path: Relative path to the file
            backup: Whether to backup before deletion

        Returns:
            True if file was deleted
        """
        target_path = self.project_root / file_path

        if not target_path.exists():
            return False

        # Backup before deletion
        if backup:
            self.backup_file(target_path)

        target_path.unlink()
        logger.info(f"Deleted {target_path}")
        return True

    def get_project_path(self, *parts: str) -> Path:
        """
        Get a path relative to project root.

        Args:
            *parts: Path components

        Returns:
            Full path
        """
        return self.project_root / Path(*parts)


# Global file manager instance
_file_manager: Optional[FileManager] = None


def get_file_manager() -> FileManager:
    """Get the global file manager instance."""
    global _file_manager
    if _file_manager is None:
        _file_manager = FileManager()
    return _file_manager
