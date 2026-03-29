"""
Agents module for AutoNovel-Studio v5.2.
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
    "DraftSummarizer",
]
