# CLAUDE.md

This file provides guidance to AI assistants working with this repository.

## Project Overview

AutoNovel-Studio is an AI-powered novel generation system using a **single-agent architecture**: one Author Agent (powered by LLM) operates autonomously with a toolbox of 17 tools. When quality review is needed, the Agent invokes `submit_to_editorial` which triggers 3 parallel specialized reviewers (lore/pacing/AI-tone). The system is in the process of migrating from Python to TypeScript.

## Architecture: Dual Backend (Migration in Progress)

### TypeScript Backend (NEW — `server/`)
```bash
cd server && npm run dev        # Fastify on :3001
cd server && npm test           # Vitest (57 tests)
```

Core stack: **Fastify + Vercel AI SDK + Zod**

- `src/agent/agent-loop.ts` — `streamText({ maxSteps: 20 })` replaces Python while-loop
- `src/tools/base-tool.ts` — `ToolDefinition` interface + `ToolRegistry`
- `src/tools/safety.ts` — audit log (JSONL), auto-backup, prompt injection detection
- `src/editorial/pipeline.ts` — 3 parallel reviewers via `Promise.all`
- `src/memory/` — two-tier memory (core + project)
- `src/routes/author-chat.ts` — SSE streaming endpoint

### Python Backend (LEGACY — `src/`)
```bash
pip install -r requirements.txt
python src/api/main.py          # FastAPI on :9864
python -m pytest tests/         # Pytest (128 tests)
```

### Frontend
```bash
cd frontend && npm run dev      # Vite on :5173 (proxies /api to :9864)
```

React 19 + Vite. Components in `frontend/src/components/`. Icons: Lucide React only (no emoji).

## Key Tools (17 registered)

| Category | Tools |
|----------|-------|
| Read | `read_file`, `search_lore`, `read_outline` |
| Write | `save_draft`, `save_outline`, `save_lore` |
| Plot Tree | `read_tree`, `add_plot_node`, `confirm_path`, `prune_branch`, `merge_branches` |
| Terminal | `submit_for_review`, `present_options`, `request_guidance` |
| Skill | `load_skill`, `list_skills` |
| Editorial | `submit_to_editorial` |

## Skill System

9 writing methodology skills in `prompts/skill_*.md` with YAML frontmatter:
```yaml
---
name: iceberg_writing
category: writing
description: 冰山写作法...
when_to_use: 在撰写任何正文之前
---
```

Discovered dynamically via `discoverSkills()` — no static registry.

## Book Data Layout

```
books/{book_id}/
├── 00_Config/           # book_meta.json
├── 01_Global_Settings/  # characters.json, world_lore.json
├── 02_Outlines/         # outline.json
├── memory/              # decided_facts.json, plot_progress.json, ...
├── plot_tree.json       # plot tree
└── audit_log.jsonl      # tool call audit trail
```

## Editorial Department (编辑部)

Three specialized reviewers run in parallel via `submit_to_editorial`:
1. **设定审稿** (`reader_scene_lore.j2`) — lore consistency
2. **节奏审稿** (`reader_scene_pacing.j2`) — rhythm and pacing
3. **文风审稿** (`reader_scene_ai_tone.j2`) — AI tone detection

No Editor arbitration layer — Author receives raw feedback and self-revises.

## Safety Layer

- **Input validation**: rejects prompt injection attempts and oversized inputs
- **Auto-backup**: `.bak` files created before every write operation
- **Audit log**: all tool calls logged to `audit_log.jsonl` (JSONL, truncated args)

## Critical Rules

- **ToolDefinition interface**: all tools implement it — never add raw functions
- **Safety wrapping**: all write tools must use `createBackup()` + `appendAuditLog()`
- **Prompts as files**: never hardcode prompts in code. Skills use `.md`, reviewers use `.j2`
- **Test policy**: never modify tests to make them pass — fix the implementation

## Configuration

Environment variables in `.env`:
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
