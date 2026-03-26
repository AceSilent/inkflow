# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoNovel-Studio is an AI-powered novel generation system using a **GAN-inspired architecture** with multiple agents:
- **Author Agent**: Generates content (Generator)
- **Matrix Reader Agents**: Evaluate content across dimensions (Discriminator)
- **Editor Agent**: Arbitrates decisions (Loss Function)
- **Human Intervention**: Final gradient intervention

The system uses **pure Python + State Machine + File System as Database** architecture, explicitly avoiding LangChain and other black-box frameworks.

## Directory Structure

```
AutoNovel-Studio/
├── 00_Config/
│   └── book_meta.json          # Novel metadata (tone, genre, forbidden tropes)
├── 01_Global_Settings/
│   ├── world_lore.json         # World-building dictionary
│   └── characters.json         # Character profiles and real-time status
├── 02_Outlines/
│   ├── volume_01.md            # Volume outline
│   └── ch_01_outline.json      # Chapter detailed outline (scene divisions)
├── 03_Story_Memory/
│   ├── full_summaries.md       # Complete minimal summaries
│   └── recent_chapters/        # Sliding window memory (last N chapters)
├── 04_Drafts/
│   ├── ch01_v1.txt             # Author drafts with version numbers
│   └── ch01_v2.txt
├── 05_Reviews/
│   ├── ch01_v1_readers.json    # Raw feedback from reader matrix
│   └── ch01_v1_editor.json     # Editor's revision guidance
├── prompts/                    # Jinja2 prompt templates
└── src/
    ├── agents/                 # Agent logic
    ├── core/                   # State machine, LLM client, Pydantic models
    └── utils/                  # File I/O, Jinja2 rendering
```

**Critical Rule**: **NO OVERWRITE** - All data must be persisted with version numbers. 100% traceability required.

## Core Technology Stack

- **State Management**: Pure Python control flow with `transitions` library for state machines
- **Data Validation**: Pydantic for strict LLM output formatting
- **LLM Calls**: Lightweight wrapper using native APIs or OpenAI SDK (multi-model compatible), with `instructor` or native Tool Calling for structured output
- **Prompt Management**: Jinja2 templates - complete separation of prompts from code
- **Concurrency**: `asyncio` - Reader Agent reviews MUST execute concurrently (respect API rate limits)

## Core Data Models (Pydantic)

### Reader Feedback
Each Reader Agent must return this structure:
- `Issue`: error_type, severity (1-5), quote, description
- `ReaderFeedback`: reader_role, immersion_score (1-10), emotional_watermark, issues: List[Issue]

### Editor Arbitration
Editor Agent outputs:
- `EditorRevisionPlan`: pass_status (bool), rejected_feedbacks, revision_instructions, scene_target

## Agent Specifications

### Author Agent
- **Input**: book_meta + volume_outline + recent_summaries (sliding window) + ch_outline + editor_plan (if rewrite)
- **Constraints**: 600-1000 characters per generation (per Scene). "Show, Don't Tell" principle
- **Recommended Models**: DeepSeek-V3 / Kimi / 智谱 (good web novel style)

### Lore Keeper Reader
- **Input**: characters.json + world_lore.json + Draft
- **Role**: Purely rational. Only compares against JSON settings. Finds names wrong, dead characters resurrecting, power level inconsistencies

### Pacing Junkie Reader
- **Input**: Previous 2 chapters full text + Chapters 3-10 summaries + Draft + book_meta.tone
- **Role**: Maintains emotional experience using emotional_watermark. Reports severity: 5 fatal errors for "3 consecutive chapters of frustration", "pacing drag", "golden three chapters without hook"

### Anti-Trope Scanner
- **Input**: book_meta.forbidden_elements + Draft
- **Role**: Mechanical scan + experiential warning. Immediate report on forbidden vocabulary or tropes

### Editor Agent
- **Input**: book_meta + all reader feedback + ch_outline + Draft
- **Role**: Constitution guardian. Filters reader opinions conflicting with book_meta, consolidates remaining opinions
- **Recommended Models**: Claude 3.5 Sonnet / GPT-4o (strongest logic and instruction following)

## State Machine Design

### States
- **INIT**: Load metadata, character cards, detailed outline
- **DRAFTING**: Trigger Author Agent (write one Scene at a time)
- **REVIEWING**: Concurrently trigger three Reader Agents (async)
- **EDITING**: Trigger Editor Agent to consolidate reviews
- **HUMAN_INTERVENTION**: Suspend for console input (pass/modify outline/force rewrite)
- **COMMITTING**: Merge approved draft, update Summarizer for recent summaries and character JSON

### Transitions with Circuit Breaker
- DRAFTING -> REVIEWING -> EDITING
- If EDITING pass_status == True and scene incomplete: back to DRAFTING
- If EDITING pass_status == True and scene complete: enter HUMAN_INTERVENTION for final review
- If EDITING pass_status == False: retry_counter + 1, back to DRAFTING
- **Circuit Breaker**: If current Scene retry_counter > 3, force transition to HUMAN_INTERVENTION with deadlock alert

## Development Guidelines

### LLM Client Abstraction
Never hardcode `openai.ChatCompletion` in business logic. Implement base class:
```python
class BaseLLMClient(ABC):
    @abstractmethod
    async def generate_text(self, system_prompt: str, user_prompt: str, **kwargs) -> str: pass

    @abstractmethod
    async def generate_json(self, system_prompt: str, user_prompt: str, response_model: Type[BaseModel]) -> BaseModel: pass
```

### Prompt as Code
All prompts must be .j2 files. Business code only passes context:
```python
template = jinja_env.get_template('editor_review.j2')
prompt = template.render(book_tags=book_meta.sub_genres, outline=current_outline, feedbacks=reader_feedbacks_json)
```

### Robustness with Tenacity
Network requests and JSON parsing must use Tenacity for retry logic:
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def safe_json_generation(...): pass
```

### Incremental State Updates
Only update characters.json and recent_chapters in COMMITTING phase. Use dedicated StateUpdater Agent. Backup original files before update (e.g., to .backup/).

## Development Order

1. Read full documentation
2. **Infrastructure**: Setup project directory, install dependencies (pydantic, transitions, jinja2, tenacity, asyncio)
3. **Define Models**: Implement Pydantic models in src/core/models.py
4. **Implement LLM Base Class**: Complete generate_json interface with retry mechanism
5. **Mock Testing**: Use static data to verify state machine flow, file system I/O, and version increment logic without LLM
6. **Agent Implementation**: Write Jinja2 templates, mount real LLM APIs for single scene testing

## Language Context

This project's documentation is in Chinese. When working with this codebase, understand that:
- "小说" = Novel
- "大纲" = Outline
- "草稿" = Draft
- "考据党" = Lore Keeper (fact-checker)
- "毒点" = Forbidden elements/tropes that readers dislike
- "爽文" = Power fantasy/gratification novels
- "情绪水位" = Emotional watermark/state
