"""
Agents module for AutoNovel-Studio v2.1.
"""
from .author import AuthorAgent
from .readers import (
    BaseReaderAgent,
    LoreKeeperAgent,
    PacingJunkieAgent,
    AntiTropeScannerAgent,
    AIToneScannerAgent,
    ReaderMatrix
)
from .editor import EditorAgent
from .scene_readers import (
    BaseSceneReader,
    ScenePacingReviewer,
    SceneLoreChecker,
    SceneAIToneDetector
)
from .draft_summarizer import DraftSummarizer

__all__ = [
    "AuthorAgent",
    "BaseReaderAgent",
    "LoreKeeperAgent",
    "PacingJunkieAgent",
    "AntiTropeScannerAgent",
    "AIToneScannerAgent",
    "ReaderMatrix",
    "EditorAgent",
    # Scene-level readers
    "BaseSceneReader",
    "ScenePacingReviewer",
    "SceneLoreChecker",
    "SceneAIToneDetector",
    # v2.1 NEW: Draft Summarizer
    "DraftSummarizer",
]
