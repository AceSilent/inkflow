"""
AutoNovel-Studio v4.0 — Core Data Contracts
Pydantic models for the scene-based generation pipeline.
Per docs/系统开发文档.md specs.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


# ── Legacy Models (backward compatibility with __init__.py imports) ──

class ErrorType(str, Enum):
    OOC = "OOC"
    LORE_CONFLICT = "Lore_Conflict"
    PACING_SLOW = "Pacing_Slow"
    AI_TONE = "AI_Tone"
    CLICHE = "Cliche"
    LOGIC_HOLE = "Logic_Hole"

class EmotionalWatermark(str, Enum):
    ENGAGED = "engaged"
    EXCITED = "excited"
    SATISFIED = "satisfied"
    CAUTIOUS = "cautious"
    BORED = "bored"

class SceneIssue(BaseModel):
    error_type: str = ""
    severity: int = 1
    quote: str = ""
    description: str = ""

class SceneReaderFeedback(BaseModel):
    reader_role: str = ""
    immersion_score: int = 5
    emotional_watermark: str = ""
    issues: List[SceneIssue] = Field(default_factory=list)

class DraftMetadata(BaseModel):
    chapter: int = 0
    scene: int = 0
    version: int = 1
    word_count: int = 0

class CharacterState(BaseModel):
    name: str = ""
    alive: bool = True
    location: str = ""
    status: str = ""

class WorldLore(BaseModel):
    entries: Dict[str, Any] = Field(default_factory=dict)

class SceneOutline(BaseModel):
    title: str = ""
    goal: str = ""
    characters: List[str] = Field(default_factory=list)

class SceneOutlineDraft(BaseModel):
    scenes: List[SceneOutline] = Field(default_factory=list)

class ChapterOutline(BaseModel):
    chapter_num: int = 0
    title: str = ""
    scenes: List[SceneOutline] = Field(default_factory=list)

class BookMeta(BaseModel):
    title: str = ""
    genre: str = ""
    tone: str = ""

class BookMetadata(BaseModel):
    book_id: str = ""
    title: str = ""
    genre: str = ""

class BookState(str, Enum):
    INIT = "init"
    ACTIVE = "active"
    COMPLETE = "complete"

class SceneStatus(str, Enum):
    PENDING = "pending"
    DRAFTED = "drafted"
    REVIEWED = "reviewed"

class SceneInfo(BaseModel):
    scene_id: str = ""
    chapter: int = 0
    status: str = "pending"


# ── Chapter Detail Outline (章节细纲) ──

class SceneBeat(BaseModel):
    """A single scene beat within a chapter's detailed outline."""
    model_config = {"extra": "ignore"}  # ignore extra fields from LLM
    scene_id: str = Field("", description="场景唯一ID，如 ch_1_1_s1")
    title: str = Field("", description="场景标题")
    pov: str = Field("", description="视角角色")
    location: str = Field("", description="场景地点")
    characters: List[str] = Field(default_factory=list, description="出场角色")
    goal: str = Field("", description="本场景叙事目标")
    conflict: str = Field("", description="核心冲突")
    outcome: str = Field("", description="场景结果/转折")
    emotion_arc: str = Field("", description="情绪弧线，如 '紧张→释然'")
    word_target: int = Field(800, description="目标字数 600-1000")
    is_final: bool = Field(False, description="如果是最终篇，表示流程结束")
    revised_text: str = Field("", description="修改后的正文草稿（不带任何其他内容）")


class ChapterDetailOutline(BaseModel):
    """Detailed outline for a chapter, broken into scenes."""
    model_config = {"extra": "ignore"}
    chapter_id: str = ""
    title: str = ""
    scenes: List[SceneBeat] = Field(default_factory=list)
    chapter_hook: str = Field("", description="章末悬念/钩子")


# ── Reader Feedback (读者反馈) — per spec 3.1 ──

class Issue(BaseModel):
    """A single issue found by a reader agent."""
    model_config = {"extra": "ignore"}
    error_type: str = Field("", description="错误类型: OOC, Lore_Conflict, Pacing_Slow, AI_Tone, Cliche, Logic_Hole")
    severity: int = Field(3, ge=1, le=5, description="严重程度 1-5")
    quote: str = Field("", description="原文引用")
    description: str = Field("", description="问题详细描述")


class ReaderFeedback(BaseModel):
    """Feedback from a single reader agent."""
    model_config = {"extra": "ignore"}
    reader_role: str = Field("", description="读者身份")
    immersion_score: int = Field(5, ge=1, le=10, description="沉浸感评分 1-10")
    emotional_watermark: str = Field("", description="当前情绪水位")
    issues: List[Issue] = Field(default_factory=list, description="发现的问题列表")


# ── Editor Arbitration (主编仲裁) — per spec 3.2 ──

class EditorRevisionPlan(BaseModel):
    """Editor's arbitration result after reviewing all reader feedback."""
    model_config = {"extra": "ignore"}
    pass_status: bool = Field(True, description="是否通过本次审核")
    rejected_feedbacks: List[str] = Field(default_factory=list, description="被驳回的读者意见理由")
    revision_instructions: List[str] = Field(default_factory=list, description="给作者的修改指令")
    scene_target: str = Field("", description="重写该场景的核心聚焦目标")
    priority_fixes: List[str] = Field(default_factory=list, description="必须修复的问题")


# ── Scene Pipeline State ──

class SceneState(str, Enum):
    PENDING = "pending"
    DRAFTING = "drafting"
    REVIEWING = "reviewing"
    EDITING = "editing"
    COMMITTED = "committed"
    NEEDS_HUMAN = "needs_human"


class SceneResult(BaseModel):
    """Complete result for a single scene after pipeline processing."""
    scene_id: str
    state: SceneState = SceneState.PENDING
    draft: str = ""
    iceberg_analysis: str = ""
    reader_feedbacks: List[ReaderFeedback] = Field(default_factory=list)
    editor_plan: Optional[EditorRevisionPlan] = None
    retries: int = 0
    word_count: int = 0


class ChapterPipelineResult(BaseModel):
    """Full result of a chapter generation pipeline run."""
    chapter_id: str
    title: str = ""
    detail_outline: Optional[ChapterDetailOutline] = None
    scene_results: List[SceneResult] = Field(default_factory=list)
    assembled_text: str = ""
    total_word_count: int = 0
    status: str = "pending"  # pending / generating / completed / needs_review


# ── Multi-Agent Group Chat Models ──

class FileEdit(BaseModel):
    """A file edit executed by the editor agent."""
    model_config = {"extra": "ignore"}
    file_path: str = Field("", description="相对于 book_dir 的路径")
    edit_type: str = Field("update", description="update | create | append")
    content: str = Field("", description="新内容")
    summary: str = Field("", description="变更摘要")


class GroupChatMessage(BaseModel):
    """A single message in the multi-agent group chat."""
    model_config = {"extra": "ignore"}
    id: str = ""
    role: str = Field("", description="human | editor | proposer | devil | author")
    display_name: str = ""
    avatar_color: str = ""
    content: str = ""
    thinking: Optional[str] = None
    is_pass: bool = False
    file_edits: List[FileEdit] = Field(default_factory=list)
    round_number: int = 0
    ts: float = 0.0


class AgentState(BaseModel):
    """Runtime state for a single agent in the group chat."""
    model_config = {"extra": "ignore"}
    agent_id: str
    display_name: str
    avatar_color: str = ""
    status: str = "idle"  # active | idle | thinking | passed
    consecutive_passes: int = 0
    last_spoke_round: int = 0


class ChatChannel(BaseModel):
    """A chat channel — group or private."""
    model_config = {"extra": "ignore"}
    channel_id: str = ""       # "group" | "author_editor" | "human_proposer"
    channel_type: str = ""     # "group" | "private"
    participants: List[str] = Field(default_factory=list)
    display_name: str = ""


# ── Memory System Models ──

class WritingPrinciple(BaseModel):
    """A learned writing principle from experience (core memory)."""
    model_config = {"extra": "ignore"}
    id: str = ""
    principle: str = ""
    source: str = ""
    confidence: float = 0.8
    created_at: str = ""
    example_good: str = ""
    example_bad: str = ""


# ── Agentic Workflow Task Schemas ──

class TaskStatus(str, Enum):
    DRAFTING = "drafting"
    EDITORIAL_REVIEW = "editorial_review"
    HUMAN_APPROVAL_PENDING = "human_approval_pending"
    COMPLETED = "completed"
    REJECTED = "rejected"
    ERROR = "error"

class TaskRecord(BaseModel):
    """Represents a single executable task in the state-driven workflow."""
    id: str
    book_id: str
    type: str  # e.g., 'write_chapter', 'write_outline'
    status: TaskStatus
    created_at: float
    updated_at: float
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
