# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoNovel-Studio is an AI-powered novel generation system using a **single-agent architecture**: one Author Agent (powered by LLM) operates autonomously with a toolbox of 17 tools via Vercel AI SDK's `streamText({ maxSteps: 20 })`. When quality review is needed, the Agent invokes `submit_to_editorial` which triggers 3 parallel specialized reviewers (lore/pacing/AI-tone). The system is migrating from Python to TypeScript.

## Commands

### TypeScript Backend (`server/`)
```bash
cd server && npm run dev          # tsx watch on :3001 (Fastify)
cd server && npm test             # vitest run — all tests
cd server && npm run test:watch   # vitest in watch mode
cd server && npx vitest run tests/safety.test.ts  # single test file
```

### Python Backend (`src/`) — LEGACY
```bash
pip install -r requirements.txt
python src/api/main.py            # FastAPI on :9864
python -m pytest tests/           # all Python tests
python -m pytest tests/test_specific.py -k "test_name"  # single test
```

### Frontend (`frontend/`)
```bash
cd frontend && npm run dev        # Vite on :5173
cd frontend && npm run build      # production build
cd frontend && npm run lint       # ESLint
```

**Note**: Frontend proxy currently targets Python backend (:9864). To use TS backend, change `target` in `frontend/vite.config.js` to `http://localhost:3001`.

## Architecture

### Agent Loop (Core Runtime)

`server/src/agent/agent-loop.ts` — The entire Python while-loop + `_dispatch_tool` chain is replaced by a single `streamText()` call with `maxSteps: 20`. The Vercel AI SDK handles the tool-call cycle automatically: LLM → tool_call → execute → inject result → LLM → ... → final text.

`server/src/agent/prompt-builder.ts` — Modular `PromptSection` assembly that builds the system prompt, injecting memory context dynamically.

### Tool System

`server/src/tools/base-tool.ts` defines `ToolDefinition<T>` interface + `ToolRegistry`. Every tool implements this interface — never add raw functions. `ToolRegistry.toVercelTools(ctx)` converts all tools to Vercel AI SDK format at runtime.

Path alias: `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`).

**17 registered tools** (in `server/src/tools/index.ts`):

| Category | Tools | Source File |
|----------|-------|-------------|
| Read | `read_file`, `search_lore`, `read_outline` | `read-file.ts`, `search-lore.ts`, `write-tools.ts` |
| Write | `save_draft`, `save_outline`, `save_lore` | `write-tools.ts` |
| Plot Tree | `read_tree`, `add_plot_node`, `confirm_path`, `prune_branch`, `merge_branches` | `plot-tree.ts` |
| Terminal | `submit_for_review`, `present_options`, `request_guidance` | `terminal.ts` |
| Skill | `load_skill`, `list_skills` | `skills.ts` |
| Editorial | `submit_to_editorial` | `editorial/editorial.ts` |

### Safety Layer (`server/src/tools/safety.ts`)

- **Auto-backup**: `.bak` files created before every write operation
- **Audit log**: all tool calls logged to `audit_log.jsonl` (JSONL, truncated args)
- **Input validation**: rejects prompt injection attempts and oversized inputs
- All write tools **must** use `createBackup()` + `appendAuditLog()`

### Editorial Pipeline (`server/src/editorial/`)

`editorial.ts` defines the `submit_to_editorial` tool. `pipeline.ts` runs 3 parallel reviewers via `Promise.all`:

1. **设定审稿** (`reader_scene_lore.j2`) — lore consistency
2. **节奏审稿** (`reader_scene_pacing.j2`) — rhythm and pacing
3. **文风审稿** (`reader_scene_ai_tone.j2`) — AI tone detection

No Editor arbitration layer — Author receives raw feedback and self-revises. Uses a separate `EDITORIAL_MODEL` (can be cheaper).

### Memory System (`server/src/memory/`)

Two-tier memory architecture:
- `core-memory.ts` — Cross-book memory (writing principles, reusable craft knowledge)
- `project-memory.ts` — Per-book project memory (plot progress, character arcs)
- `context-builder.ts` — Assembles memory into system prompt injection

### SSE Streaming Route (`server/src/routes/author-chat.ts`)

Three endpoints:
- `GET /api/author-chat/:bookId/history` — load chat history
- `DELETE /api/author-chat/:bookId/history` — clear history
- `POST /api/author-chat/:bookId/send` — SSE stream (events: `status`, `content`, `tool_start`, `tool_done`, `done`, `error`)

## Prompt Templates (`prompts/`)

**Never hardcode prompts in code.** Skills use `.md` with YAML frontmatter, reviewers use `.j2` Jinja2 templates.

- **9 writing skills**: `skill_*.md` with YAML frontmatter (`name`, `category`, `description`, `when_to_use`). Discovered dynamically via `discoverSkills()` — no static registry.
- **7 reader templates**: `reader_*.j2` — 3 scene-level + 4 chapter-level reviewers
- **4 summary templates**: `summary_*.j2` + `summarizer_*.j2`

## Book Data Layout

```
books/{book_id}/
├── 00_Config/               # book_meta.json
├── 01_Global_Settings/      # characters.json, world_lore.json
├── 02_Outlines/             # outline.json
├── memory/                  # decided_facts.json, plot_progress.json
├── plot_tree.json           # plot tree
├── author_chat_history.json # chat history (last 50 messages)
└── audit_log.jsonl          # tool call audit trail
```

## Critical Rules

- **ToolDefinition interface**: all tools implement it — never add raw functions to the agent
- **Safety wrapping**: all write tools must use `createBackup()` + `appendAuditLog()`
- **Prompts as files**: never hardcode prompts in code. Skills use `.md`, reviewers use `.j2`
- **Test policy**: never modify tests to make them pass — fix the implementation
- **ESM**: server package is `"type": "module"` — use `.js` extensions in imports

## Configuration

Environment variables (used by TS backend in `.env`):
- `LLM_API_KEY` — API key for LLM provider
- `LLM_BASE_URL` — custom base URL (DeepSeek, DashScope, etc.)
- `LLM_MODEL` — default model name
- `EDITORIAL_MODEL` — model for editorial reviewers (can be cheaper)
- `AUTONOVEL_DATA_DIR` — book data directory (default: `books`)

## Language Context

Documentation and prompts are in Chinese. Key terms:
- 小说 = Novel, 大纲 = Outline, 草稿 = Draft
- 编辑部 = Editorial Department, 审稿人 = Reviewer
- 剧情树 = Plot Tree, 设定 = Lore/World-building
- 冰山写作法 = Iceberg Writing Method
