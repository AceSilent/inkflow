"""
State Manager for AutoNovel-Studio v2.1.
Provides thread-safe, atomic state updates with file locking.
"""
import json
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from threading import Lock

from filelock import FileLock

from .models import BookState, SceneStatus, SceneInfo

logger = logging.getLogger(__name__)


class StateManager:
    """
    状态管理器 - 线程安全的原子更新

    Implements dual-layer locking:
    1. FileLock: Prevents concurrent processes from writing to the same file
    2. asyncio.Lock: Prevents concurrent async tasks from interfering

    This ensures data integrity when multiple scenes are generated concurrently.
    """

    def __init__(self, lock_timeout: float = 10.0):
        """
        Initialize StateManager.

        Args:
            lock_timeout: Maximum time to wait for file lock (seconds)
        """
        self.lock_timeout = lock_timeout
        self._async_locks: Dict[str, asyncio.Lock] = {}
        self._lock_cache_lock = Lock()  # Thread lock for managing lock cache

    def _get_async_lock(self, book_id: str) -> asyncio.Lock:
        """
        Get or create asyncio.Lock for a specific book.

        Args:
            book_id: Book identifier

        Returns:
            asyncio.Lock for this book
        """
        # Use thread lock to safely access/modify _async_locks dict
        with self._lock_cache_lock:
            if book_id not in self._async_locks:
                self._async_locks[book_id] = asyncio.Lock()
            return self._async_locks[book_id]

    async def load_state(self, state_path: Path) -> Optional[BookState]:
        """
        Load book state with file locking.

        Args:
            state_path: Path to book_state.json

        Returns:
            BookState object or None if not found
        """
        lock_path = Path(str(state_path) + ".lock")

        try:
            # Acquire file lock (with timeout)
            with FileLock(lock_path, timeout=self.lock_timeout):
                if not state_path.exists():
                    logger.warning(f"State file not found: {state_path}")
                    return None

                with open(state_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                state = BookState(**data)
                logger.debug(f"Loaded state for {state.book_id}")
                return state

        except Exception as e:
            logger.error(f"Failed to load state: {e}")
            return None

    async def save_state(
        self,
        state_path: Path,
        state: BookState,
        create_backup: bool = True
    ) -> bool:
        """
        Save book state with file locking (atomic write).

        Args:
            state_path: Path to book_state.json
            state: BookState object to save
            create_backup: Whether to create backup before overwriting

        Returns:
            True if successful, False otherwise
        """
        lock_path = Path(str(state_path) + ".lock")
        async_lock = self._get_async_lock(state.book_id)

        try:
            # Acquire both locks
            with FileLock(lock_path, timeout=self.lock_timeout):
                async with async_lock:
                    # Create backup if requested
                    if create_backup and state_path.exists():
                        backup_path = state_path.parent / ".backup" / f"book_state_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                        backup_path.parent.mkdir(parents=True, exist_ok=True)
                        import shutil
                        shutil.copy2(state_path, backup_path)
                        logger.debug(f"Backup created: {backup_path}")

                    # Write to temporary file first (atomic write)
                    temp_path = state_path.with_suffix('.tmp')
                    with open(temp_path, 'w', encoding='utf-8') as f:
                        json.dump(state.model_dump(), f, ensure_ascii=False, indent=2)

                    # Atomic rename
                    temp_path.replace(state_path)

                    logger.debug(f"State saved for {state.book_id}")
                    return True

        except Exception as e:
            logger.error(f"Failed to save state: {e}")
            # Clean up temp file if it exists
            if 'temp_path' in locals() and temp_path.exists():
                temp_path.unlink()
            return False

    async def update_chapter_status(
        self,
        state_path: Path,
        chapter_num: int,
        status: str
    ) -> bool:
        """
        Update chapter status atomically.

        Args:
            state_path: Path to book_state.json
            chapter_num: Chapter number
            status: New status ('pending', 'in_progress', 'completed')

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        state.chapter_status[chapter_num] = status
        return await self.save_state(state_path, state)

    async def update_scene_version(
        self,
        state_path: Path,
        chapter_num: int,
        scene_num: int,
        version: int
    ) -> bool:
        """
        Update scene version atomically.

        Args:
            state_path: Path to book_state.json
            chapter_num: Chapter number
            scene_num: Scene number
            version: New version number

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        scene_key = f"ch{chapter_num:02d}_scene{scene_num:02d}"
        state.scene_versions[scene_key] = version
        return await self.save_state(state_path, state)

    async def add_outdated_scene(
        self,
        state_path: Path,
        chapter_num: int,
        scene_num: int
    ) -> bool:
        """
        Add scene to outdated list (cascade invalidation).

        Args:
            state_path: Path to book_state.json
            chapter_num: Chapter number
            scene_num: Scene number

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        scene_tuple = (chapter_num, scene_num)
        if scene_tuple not in state.outdated_scenes:
            state.outdated_scenes.append(scene_tuple)
            logger.info(f"Added outdated scene: ch{chapter_num:02d}_scene{scene_num:02d}")

        return await self.save_state(state_path, state)

    async def remove_outdated_scene(
        self,
        state_path: Path,
        chapter_num: int,
        scene_num: int
    ) -> bool:
        """
        Remove scene from outdated list.

        Args:
            state_path: Path to book_state.json
            chapter_num: Chapter number
            scene_num: Scene number

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        scene_tuple = (chapter_num, scene_num)
        if scene_tuple in state.outdated_scenes:
            state.outdated_scenes.remove(scene_tuple)
            logger.info(f"Removed outdated scene: ch{chapter_num:02d}_scene{scene_num:02d}")

        return await self.save_state(state_path, state)

    async def get_outdated_scenes(
        self,
        state_path: Path
    ) -> List[Tuple[int, int]]:
        """
        Get list of outdated scenes.

        Args:
            state_path: Path to book_state.json

        Returns:
            List of (chapter_num, scene_num) tuples
        """
        state = await self.load_state(state_path)
        if state is None:
            return []

        return state.outdated_scenes.copy()

    async def clear_outdated_scenes(
        self,
        state_path: Path
    ) -> bool:
        """
        Clear all outdated scenes.

        Args:
            state_path: Path to book_state.json

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        state.outdated_scenes.clear()
        logger.info("Cleared all outdated scenes")
        return await self.save_state(state_path, state)

    async def increment_current_position(
        self,
        state_path: Path,
        increment_scene: bool = True
    ) -> bool:
        """
        Increment current chapter/scene position.

        Args:
            state_path: Path to book_state.json
            increment_scene: Whether to increment scene (False = chapter only)

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        if increment_scene:
            state.current_scene += 1
        else:
            state.current_chapter += 1
            state.current_scene = 1

        return await self.save_state(state_path, state)

    async def update_auto_save_timestamp(
        self,
        state_path: Path
    ) -> bool:
        """
        Update auto-save timestamp.

        Args:
            state_path: Path to book_state.json

        Returns:
            True if successful
        """
        state = await self.load_state(state_path)
        if state is None:
            return False

        state.last_auto_save = datetime.now().isoformat()
        return await self.save_state(state_path, state)


class SceneInfoTracker:
    """
    场景信息追踪器

    Tracks detailed information for each scene (separate from BookState).
    Stored in individual scene_info.json files for better performance.
    """

    def __init__(self, state_manager: StateManager):
        """
        Initialize SceneInfoTracker.

        Args:
            state_manager: StateManager instance for locking
        """
        self.state_manager = state_manager

    async def load_scene_info(
        self,
        info_path: Path
    ) -> Optional[SceneInfo]:
        """
        Load scene information.

        Args:
            info_path: Path to scene_info.json

        Returns:
            SceneInfo object or None if not found
        """
        lock_path = Path(str(info_path) + ".lock")

        try:
            with FileLock(lock_path, timeout=self.state_manager.lock_timeout):
                if not info_path.exists():
                    return None

                with open(info_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                return SceneInfo(**data)

        except Exception as e:
            logger.error(f"Failed to load scene info: {e}")
            return None

    async def save_scene_info(
        self,
        info_path: Path,
        scene_info: SceneInfo
    ) -> bool:
        """
        Save scene information.

        Args:
            info_path: Path to scene_info.json
            scene_info: SceneInfo object to save

        Returns:
            True if successful
        """
        lock_path = Path(str(info_path) + ".lock")

        try:
            with FileLock(lock_path, timeout=self.state_manager.lock_timeout):
                # Create parent directory if needed
                info_path.parent.mkdir(parents=True, exist_ok=True)

                # Atomic write
                temp_path = info_path.with_suffix('.tmp')
                with open(temp_path, 'w', encoding='utf-8') as f:
                    json.dump(scene_info.model_dump(), f, ensure_ascii=False, indent=2)

                temp_path.replace(info_path)
                return True

        except Exception as e:
            logger.error(f"Failed to save scene info: {e}")
            if 'temp_path' in locals() and temp_path.exists():
                temp_path.unlink()
            return False

    async def update_scene_status(
        self,
        info_path: Path,
        status: SceneStatus
    ) -> bool:
        """
        Update scene status.

        Args:
            info_path: Path to scene_info.json
            status: New scene status

        Returns:
            True if successful
        """
        scene_info = await self.load_scene_info(info_path)
        if scene_info is None:
            return False

        scene_info.status = status
        scene_info.last_modified = datetime.now().isoformat()
        return await self.save_scene_info(info_path, scene_info)
