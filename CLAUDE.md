# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoNovel-Studio is an AI-powered novel generation system using a **GAN-inspired multi-agent architecture**: Author (Generator) writes, Reader Matrix (Discriminator) evaluates, Editor (Loss Function) arbitrates, and Human provides final gradient intervention. The system uses **pure Python + State Machine + File System as Database** — no LangChain or black-box frameworks.

## Common Commands

### Backend
```bash
pip install -r requirements.txt          # Install Python dependencies
python main.py                           # CLI: generate chapter 1
python main.py 5                         # CLI: generate chapter 5
python src/api/main.py                   # FastAPI server on port 9864
```

### Frontend
```bash
cd frontend
npm install                              # Install JS dependencies
npm run dev                              # Vite dev server on port 5173
npm run build                            # Production build to frontend/dist
npm run lint                             # ESLint check
```

### Testing
```bash
python run_tests.py                      # Interactive test menu
python run_tests.py all                  # Run all tests
python run_tests.py author               # Single test: author agent
python run_tests.py readers              # Single test: reader matrix
python run_tests.py editor               # Single test: editor agent
python run_tests.py ai_tone              # Single test: AI tone scanner
python run_tests.py system               # Single test: full pipeline
python -m pytest tests/                  # Run pytest suite
python -m pytest tests/unit/test_openai_client.py  # Single pytest file
```

The custom test runner (`run_tests.py`) uses subprocess to invoke individual `tests/test_*.py` files. The pytest suite lives under `tests/unit/`, `tests/core/`, and `tests/api/`. Tests mock LLM calls — `conftest.py` sets a dummy `OPENAI_API_KEY`.

## Architecture

### Two Entry Points

1. **CLI** (`main.py`): `NovelGenerator` class orchestrates agents directly via `NovelStateMachine` (the older `transitions`-based state machine). Used for headless generation.
2. **Web API** (`src/api/main.py`): FastAPI server (port 9864) with React frontend (port 5173, proxied via Vite). Uses `StateMachine` (the newer checkpoint-based state machine in `src/core/state_machine.py`). Frontend is a pure SPA — no SSR.

### Dual State Machine Coexistence

There are **two** state machine implementations serving different entry points:
- `src/core/state_machine.py` — `StateMachine` + `WorkflowState` enum + `ProjectContext`. Checkpoint-based persistence (`.checkpoint/`), used by the web API workflow.
- `src/core/workflow.py` — `NovelStateMachine` using the `transitions` library. Used by `main.py` CLI. Has states: INIT, DRAFTING, REVIEWING, EDITING, HUMAN_INTERVENTION, COMMITTING.

Both share the same agent implementations and Pydantic models.

### Multi-Agent Pipeline

```
DRAFTING (AuthorAgent) → REVIEWING (ReaderMatrix, concurrent asyncio)
  → EDITING (EditorAgent) → loop or HUMAN_INTERVENTION → COMMITTING
```

**Reader agents** (all in `src/agents/readers.py`) run concurrently:
- `LoreKeeperAgent` — consistency against characters.json / world_lore.json
- `PacingJunkieAgent` — emotional watermark tracking
- `AntiTropeScannerAgent` — forbidden tropes from book_meta
- `AIToneScannerAgent` — detects AI-generated patterns

Each reader returns `ReaderFeedback` (immersion_score, emotional_watermark, issues). Editor returns `EditorRevisionPlan` (pass_status, revision_instructions). Circuit breaker: max 3 retries per scene, then force human intervention.

### Key Source Directories

| Path | Purpose |
|------|---------|
| `src/core/llm_client.py` | `BaseLLMClient` ABC — all LLM calls go through here with tenacity retry |
| `src/core/openai_client.py` | `OpenAILLMClient`, `InstructorLLMClient` — concrete implementations |
| `src/core/models.py` | All Pydantic models: `ReaderFeedback`, `EditorRevisionPlan`, `SceneBeat`, `BookMeta`, etc. |
| `src/core/book_manager.py` | `BookPathManager` — path resolution per-book, `BookManager` — CRUD |
| `src/core/workflow_engine.py` | Web API workflow orchestration |
| `src/core/scene_pipeline.py` | Scene-level generation pipeline |
| `src/core/groupchat_orchestrator.py` | Multi-agent group chat system |
| `src/agents/` | Agent implementations: `author.py`, `editor.py`, `readers.py`, `scene_readers.py`, `draft_summarizer.py`, `brainstorming.py` |
| `src/api/routes/` | FastAPI route modules: `books.py`, `generate.py`, `review.py`, `characters.py`, `groupchat.py`, `author_chat.py`, `brainstorm.py`, `writing.py`, `inbox.py`, `settings.py` |
| `prompts/` | Jinja2 `.j2` templates — all prompts live here, never inline in Python |

### Book Data Layout

Each book has its own isolated directory under `books/`:
```
books/{title}_{id}/
├── 00_Config/           # book_meta.json, book_state.json
├── 01_Global_Settings/  # world_lore.json, characters.json
├── 02_Outlines/         # volume_*.md, chapter_*_outline.json
├── 03_Story_Memory/     # full_summaries.md, recent_chapters/
├── 04_Drafts/ch*/       # scene_*_v{N}.txt (versioned, never overwritten)
├── 05_Reviews/ch*/      # scene_*_v{N}_readers.json, *_editor.json
└── .backup/             # backups before state updates
```

### Frontend

React 19 + Vite 8 in `frontend/`. Components in `frontend/src/components/` — each major panel is a file: `AuthorChatPanel.jsx`, `GroupChatPanel.jsx`, `BrainstormPanel.jsx`, `ChapterEditor.jsx`, `CharactersPanel.jsx`, etc. Vite proxies `/api` to `localhost:9864`. Icons: Lucide React only (no emoji in UI code).

## Critical Rules

- **NO OVERWRITE**: All data persisted with version numbers (`_v1`, `_v2`, ...). 100% traceability.
- **Prompts as .j2 files**: Never hardcode prompts in Python. Always use Jinja2 templates from `prompts/`.
- **LLM calls via BaseLLMClient**: Never use `openai.ChatCompletion` directly in business logic. Use the abstract interface with retry.
- **Reader concurrency**: Reader agents MUST run concurrently via `asyncio.gather`, respecting API rate limits.
- **File operations**: Use `FileManager` from `src/utils/file_utils.py` for all reads/writes — it handles versioning and encoding.

## Configuration

Environment variables in `.env`:
- `LLM_PROVIDER` — openai, deepseek, kimi
- `OPENAI_API_KEY`, `OPENAI_BASE_URL` — API credentials
- `AUTHOR_MODEL`, `EDITOR_MODEL`, `READER_MODEL` — model names per role
- Separate clients are instantiated per role (author/editor/reader) to use different models

## Language Context

Documentation and prompts are in Chinese. Key terms:
- 小说 = Novel, 大纲 = Outline, 草稿 = Draft
- 考据党 = Lore Keeper, 毒点 = Forbidden tropes, 爽文 = Power fantasy
- 情绪水位 = Emotional watermark/state
