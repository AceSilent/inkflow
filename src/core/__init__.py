"""
Core module for AutoNovel-Studio v4.0.
Graceful imports — new pipeline models always available, legacy models best-effort.
"""
# New pipeline models (always available)
from .models import (
    # Legacy compatibility
    ErrorType, EmotionalWatermark, Issue, ReaderFeedback,
    SceneIssue, SceneReaderFeedback, EditorRevisionPlan,
    DraftMetadata, CharacterState, WorldLore, SceneOutline,
    SceneOutlineDraft, ChapterOutline, BookMeta,
    BookMetadata, BookStatus, BookState, SceneStatus, SceneInfo,
    # v4.0 Pipeline Models
    SceneBeat, ChapterDetailOutline, SceneState, SceneResult, ChapterPipelineResult,
)
from .llm_client import BaseLLMClient, LLMError, JSONParseError, RateLimitError

# Graceful imports for modules that may have additional dependencies
try:
    from .openai_client import OpenAILLMClient, InstructorLLMClient
except ImportError:
    OpenAILLMClient = None
    InstructorLLMClient = None

try:
    from .state_machine import StateMachine, WorkflowState, ProjectContext
except ImportError:
    StateMachine = None
    WorkflowState = None
    ProjectContext = None

try:
    from .book_manager import BookPathManager, BookManager
except ImportError:
    BookPathManager = None
    BookManager = None

try:
    from .state_manager import StateManager, SceneInfoTracker
except ImportError:
    StateManager = None
    SceneInfoTracker = None

try:
    from .cascade_invalidation import (
        KeyEventExtractor, SceneDependencyGraph,
        CascadeInvalidator, SceneDependencyTracker
    )
except ImportError:
    KeyEventExtractor = None
    SceneDependencyGraph = None
    CascadeInvalidator = None
    SceneDependencyTracker = None

try:
    from .chapter_reconstructor import ChapterReconstructor, ReconstructionResult
except ImportError:
    ChapterReconstructor = None
    ReconstructionResult = None

__all__ = [
    # Models
    "ErrorType", "EmotionalWatermark", "Issue", "ReaderFeedback",
    "SceneIssue", "SceneReaderFeedback", "EditorRevisionPlan",
    "DraftMetadata", "CharacterState", "WorldLore", "SceneOutline",
    "SceneOutlineDraft", "ChapterOutline", "BookMeta",
    "BookMetadata", "BookStatus", "BookState", "SceneStatus", "SceneInfo",
    # v4.0
    "SceneBeat", "ChapterDetailOutline", "SceneState", "SceneResult", "ChapterPipelineResult",
    # LLM
    "BaseLLMClient", "LLMError", "JSONParseError", "RateLimitError",
]
