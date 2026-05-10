# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoNovel-Studio is an AI-powered novel generation system using a **single-agent architecture**: one Author Agent (powered by LLM) operates autonomously with a toolbox of 20 tools via Vercel AI SDK's `streamText({ maxSteps: 20 })`. When quality review is needed, the Agent invokes `submit_to_editorial` which triggers 5 parallel specialized reviewers (lore/pacing/AI-tone/character/causality) and auto-persists results. The system is migrated from Python to TypeScript with **392 tests** across 52 test files.

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
cd frontend && npm run dev        # Vite on :5173, proxies /api to :3001
cd frontend && npm run build      # production build
cd frontend && npm run lint       # ESLint
```

## Architecture

### Agent Loop (Core Runtime)

`server/src/agent/agent-loop.ts` — The entire Python while-loop + `_dispatch_tool` chain is replaced by a single `streamText()` call with `maxSteps: 20`. Supports `AbortSignal` for client disconnect, mode-aware `ToolContext`, and tool summary injection. The Vercel AI SDK handles the tool-call cycle automatically: LLM → tool_call → execute → inject result → LLM → ... → final text.

`server/src/agent/prompt-builder.ts` — Modular `PromptSection` assembly that builds the system prompt, injecting memory context and tool summary dynamically.

### Tool System

`server/src/tools/base-tool.ts` defines `ToolDefinition<T>` interface + `ToolRegistry`. Every tool implements this interface — never add raw functions. `ToolRegistry.toVercelTools(ctx)` converts all tools to Vercel AI SDK format at runtime. `ToolRegistry.getToolSummary()` generates categorized tool inventory for prompt injection. `ToolContext` carries `bookId`, `dataDir`, and `mode`.

Path alias: `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`).

**20 registered tools** (in `server/src/tools/index.ts`):

| Category | Tools | Source File |
|----------|-------|-------------|
| Read | `read_file`, `search_lore`, `read_outline` | `read-file.ts`, `search-lore.ts`, `write-tools.ts` |
| Write | `save_draft`, `save_outline`, `save_lore` | `write-tools.ts` |
| Plot Graph | `read_graph`, `add_plot_node`, `add_edge`, `remove_edge`, `query_unresolved_setups`, `confirm_path`, `prune_branch`, `merge_branches` | `plot-graph.ts` |
| Terminal | `submit_for_review`, `present_options`, `request_guidance` | `terminal.ts` |
| Skill | `load_skill`, `list_skills` | `skills.ts` |
| Editorial | `submit_to_editorial` | `editorial/editorial.ts` |

### Plot Graph (`server/src/services/plot-graph.ts` + `server/src/tools/plot-graph.ts`)

The old tree has been replaced by a DAG in `plot_graph.json`:
- Nodes (6 types): event / setup / payoff / decision / turning_point / convergence. `chapter` and `arc` are forbidden.
- Edges (6 types): causes / triggers / enables / blocks / pays-off / parallel.
- Nodes reference chapters via `references: string[]` (many-to-many weak link).
- `editorial_causality` reviewer receives `plot_graph_context` (chapter subgraph + unresolved setups).
- `prompt-builder` injects an unresolved-setups ledger into the system prompt so the Agent tracks foreshadowing debt.

Tools: `read_graph`, `add_plot_node`, `add_edge`, `remove_edge`, `query_unresolved_setups`, `confirm_path`, `prune_branch`, `merge_branches`.

### Safety Layer (`server/src/tools/safety.ts`)

- **Auto-backup**: `.bak` files created before every write operation
- **Audit log**: all tool calls logged to `audit_log.jsonl` (JSONL, truncated args)
- **Input validation**: rejects prompt injection attempts and oversized inputs
- All write tools **must** use `createBackup()` + `appendAuditLog()`

### Editorial Pipeline (`server/src/editorial/`)

`editorial.ts` defines the `submit_to_editorial` tool. `pipeline.ts` runs 5 parallel reviewers via `Promise.all`:

1. **设定审稿** (`reader_scene_lore.j2`) — lore consistency
2. **节奏审稿** (`reader_scene_pacing.j2`) — rhythm and pacing
3. **文风审稿** (`reader_scene_ai_tone.j2`) — AI tone detection
4. **角色审稿** (`reader_scene_character.j2`) — character consistency
5. **因果审稿** (`reader_scene_causality.j2`) — causality and foreshadowing

No Editor arbitration layer — Author receives raw feedback and self-revises. Uses a separate `EDITORIAL_MODEL` (can be cheaper). Results auto-persist to `04_Drafts/review_{chapterId}.json`.

### Memory System (`server/src/memory/`)

Two-tier memory architecture:
- `core-memory.ts` — Cross-book memory (writing principles, reusable craft knowledge)
- `project-memory.ts` — Per-book project memory (plot progress, character arcs)
- `context-builder.ts` — Assembles memory into system prompt injection

### Memory v2 (`server/src/memory/{markdown-io,memory-service,extractor,recall}.ts`)

Markdown layer alongside existing JSON:

- Storage: `global/memories/{_pending,user_preferences,craft_skills,anti_patterns,_archived}/*.md` (cross-book, sibling of `books/`) + `books/{id}/memories/*.md` (per-book) + `books/{id}/session_summaries/*.md` (compact output).
- Each memory is a `.md` file with YAML frontmatter (id / scope / type / confidence / tags / source / status / created_at).
- Auto-extract via EDITORIAL_MODEL fires fire-and-forget on author-chat SSE done + editorial return. Failures log, never block main path.
- All auto-extracted items land in `_pending/`; user approves via Memory Library UI.
- `/remember <text>` slash command in AuthorChat writes directly to active `user_preferences/`.
- Recall: `buildMarkdownMemoryContext` in `recall.ts`. Dump-all with confidence sort + scope budget (project 50% / global 30% / session 20%), char budget 3000.
- Existing 8 JSON memory files untouched (hot path for editorial reviewers).

### Context Manager (`server/src/context/*.ts`)

Fine-grained 3-tier retention replacing the old `.slice(-20)` hard cut in `chat-history.ts`:

- **Budget tiers** (green 0-30% / yellow 30-60% / orange 60-80% / red 80%+) computed from `usage.total_tokens / getModelContextWindow(model)`. Window auto-detected for GLM-5 (1M), DeepSeek V3 (200K), Claude [1m] suffix, etc.
- **Token-weighted zones**: Hot (last 20k tok, never touched) / Warm (next 40k tok, large tool-result payloads decayed) / Cold (rest, eligible for summary compact)
- **Tool-result decay** (primary mechanism, cheap, cache-friendly): `read_file` > 10k chars / `read_outline` > 5k / `read_graph` > 8k / `search_lore` > 4k in warm zone → replaced with `[tool: ..., re-fetch if needed]`. `submit_to_editorial`, `save_*` results preserved always.
- **Cold-segment compact** (fallback): fork EDITORIAL_MODEL summary call with PTL fallback (head-strip retry up to 3 times) + circuit breaker (stops after 3 consecutive failures; reset via Settings). Summary persists to Memory v2 `session_summaries/*.md`.
- **Modes**: `auto` / `decay_only` / `disabled` via Settings.
- **Observability**: frontend status bar + `context_log.jsonl` per book + debug endpoint `/api/v1/books/:bookId/debug/context-state`.

### Design System (`frontend/src/design-tokens.css` + `typography.css`)

"Literary Journal" aesthetic with two themes (Light: cream paper + ink + oxide-red accents; Dark: espresso + parchment + brick red + gold "Library Espresso"). All colors and fonts defined as CSS variables in `design-tokens.css`. Signature components (`.drop-cap`, `.rail-label`, `.epigraph`, `.wordmark`, `.label-sc`, `.display-hero`, `.display-heading`) in `typography.css`. Fonts: Fraunces (display) + Noto Serif SC (body), preloaded from Google Fonts in `index.html`. `useTheme` defaults to light. See `docs/superpowers/specs/2026-04-18-design-system.md` and `docs/superpowers/plans/2026-04-18-design-system.md`.

### API Routes (`server/src/routes/`)

Fastify is configured with `ignoreTrailingSlash: true`. All POST/PUT bodies validated via Zod schemas in `schemas.ts`. Route modules:

**author-chat.ts** — SSE streaming for Agent interaction:
- `GET /api/v1/author-chat/:bookId/history` — load chat history
- `DELETE /api/v1/author-chat/:bookId/history` — clear history
- `POST /api/v1/author-chat/:bookId/send` — SSE stream (events: `status`, `content`, `tool_start`, `tool_done`, `done`, `error`, `aborted`). Client disconnect detected via `request.socket.on('close')` with `streamDone` guard to avoid false aborts from POST body consumption.

**context (in author-chat.ts)** — Context manager endpoints:
- `GET /api/v1/books/:bookId/debug/context-state` — current tier + last decision
- `POST /api/v1/books/:bookId/context/reset-breaker` — manual breaker reset

**books.ts** — Book CRUD:
- `GET /api/v1/books` — list all books
- `GET /api/v1/books/explorer` — tree structure for sidebar navigation
- `GET /api/v1/books/:bookId` — single book metadata
- `POST /api/v1/books` — create book with directory structure
- `DELETE /api/v1/books/:bookId` — delete book directory

**data.ts** — Read-only book data:
- `GET /api/v1/books/:bookId/outline` — read outline.json
- `GET /api/v1/books/:bookId/lore` — combined lore (meta + world_setting + characters + outline)
- `GET /api/v1/books/:bookId/chapters` — list chapter nodes from outline
- `GET /api/v1/books/:bookId/chapters/:chapterId` — chapter detail with draft content

**settings.ts** — LLM provider configuration (persisted to `settings.json` in dataDir):
- `GET /api/v1/settings` — return settings with masked API keys
- `PUT /api/v1/settings` — save provider configs and model assignments

**chat-history.ts** — Shared chat history module (used by both SSE route and Feishu bot).

**workbench.ts** — Chapter workbench endpoints:
- `GET / POST / PATCH / DELETE /api/v1/books/:bookId/chapters/:chId/annotations` — annotation CRUD
- `GET / PUT /api/v1/books/:bookId/chapters/:chId/status` — user approval state
- `POST / DELETE /api/v1/books/:bookId/chapters/:chId/workbench-lock` — edit lock
- `POST /api/v1/books/:bookId/chapters/:chId/resubmit-review` — direct editorial re-run
- `POST /api/v1/books/:bookId/chapters/:chId/send-annotations` — compose prompt + mark annotations sent

**outline.ts** — Outline-specific endpoints:
- `POST /api/v1/books/:bookId/outline/renumber` — cascade-rename chapter IDs to match outline order

**plot-graph.ts** — Plot graph DAG endpoints:
- `GET /api/v1/books/:bookId/plot-graph` — full graph
- `POST / PATCH / DELETE /api/v1/books/:bookId/plot-graph/nodes[/:id]`
- `POST / DELETE /api/v1/books/:bookId/plot-graph/edges[/:id]`
- `GET /api/v1/books/:bookId/plot-graph/unresolved-setups`

**memory.ts** — Memory v2 endpoints:
- `GET /api/v1/memory/{pending,active,archived}` — list by status
- `GET /api/v1/memory/:id` — read single
- `POST /api/v1/memory/:id/{approve,reject,archive,restore}` — state transitions
- `PATCH /api/v1/memory/:id` — inline edit body / confidence / tags
- `DELETE /api/v1/memory/:id`
- `POST /api/v1/memory/remember` — direct active write (used by /remember slash command)

### LLM Provider (`server/src/llm/provider.ts`)

Creates a Vercel AI SDK model from `LLMConfig`. Key considerations:
- **Uses `provider.chat(model)`**, not `provider(model)` — the default in `@ai-sdk/openai` v3 calls the OpenAI Responses API (`/responses`), which non-OpenAI providers don't support
- **GLM-5.x reasoning mode**: ZhipuAI GLM-5 models default to "thinking" mode, sending output in `delta.reasoning_content` instead of `delta.content`. A custom fetch wrapper injects `thinking: { type: "disabled" }` into request bodies for these models
- **AI SDK v6 breaking change**: `fullStream` text-delta parts use `part.text` (was `part.textDelta` in v5)

## Feishu Bot Integration (`server/src/feishu/`)

Optional Feishu (Lark) bot that mirrors all frontend features, sharing the same session and book data:

- **WebSocket mode** (default) — no public URL needed for development
- **Webhook mode** — HTTP callback for production deployments
- **CardKit streaming** — creates card entity, updates during Agent streaming (throttled 500ms)
- **Session sharing** — same `author_chat_history.json` and `books/` directory as web frontend
- **Session mapping** — `feishu_sessions.json` maps `open_id`/`chat_id` to `bookId`

Commands: `/help /list /create /select /current /outline /lore /chapters /review /clear /history`. Free text = Agent chat.

Environment variables: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_MODE=ws`, `FEISHU_ENCRYPT_KEY`, `FEISHU_VERIFICATION_TOKEN`, `FEISHU_DOMAIN`

Shared chat history module: `server/src/routes/chat-history.ts` (used by both SSE route and Feishu bot).

## Prompt Templates (`prompts/`)

**Never hardcode prompts in code.** Skills use `.md` with YAML frontmatter, reviewers use `.j2` Jinja2 templates.

- **9 writing skills**: `skill_*.md` with YAML frontmatter (`name`, `category`, `description`, `when_to_use`). Discovered dynamically via `discoverSkills()` — no static registry.
- **7 reader templates**: `reader_*.j2` — 3 scene-level (`reader_scene_*.j2`) + 4 chapter-level (`reader_*.j2`)
- **4 summary templates**: `summarizer_brief.j2`, `summarizer_full.j2`, `summary_chapter.j2`, `summary_scene.j2`

## Book Data Layout

```
books/{book_id}/
├── 00_Config/               # book_meta.json
├── 01_Global_Settings/      # characters.json, world_lore.json
├── 02_Outlines/             # outline.json
├── 04_Drafts/               # chapter drafts + review_{chapterId}.json
├── memory/                  # decided_facts.json, plot_progress.json
├── plot_graph.json          # plot graph (DAG, see services/plot-graph.ts)
├── author_chat_history.json # chat history (last 50 messages)
└── audit_log.jsonl          # tool call audit trail
```

## Critical Rules

- **ToolDefinition interface**: all tools implement it — never add raw functions to the agent
- **Safety wrapping**: all write tools must use `createBackup()` + `appendAuditLog()`
- **Prompts as files**: never hardcode prompts in code. Skills use `.md`, reviewers use `.j2`
- **Test policy**: never modify tests to make them pass — fix the implementation
- **ESM**: server package is `"type": "module"` — use `.js` extensions in imports
- **Input validation**: all route POST/PUT bodies validated via Zod schemas in `schemas.ts` (see Routes section)
- **Path sanitization**: all `bookId`/`chapterId` params sanitized via `server/src/utils/path-sanitizer.ts`
- **Error types**: use custom `AgentError` hierarchy from `server/src/utils/errors.ts`
- **User approval override**: `chapter_status_{chId}.json.user_decision` takes precedence over `review_{chId}.json.overall_pass` in the `review-prev-chapter` hook
- **Workbench lock**: while `workbench_lock_{chId}` exists (and is fresh < 10min), Agent's `save_draft` for that chapter is blocked by the `block-while-user-editing` hook
- **chat-history full-load**: `loadHistoryFull` (replacing `.slice(-20)` `loadHistory`) does not truncate on read — trimming is done by ContextManager's zone-based logic. `saveHistory` still caps at 50 messages on disk (by design); early messages beyond this window are not lost — ContextManager's cold compact writes them to `session_summaries/*.md` before they age out, and Memory v2 recall injects those summaries back into the system prompt.

## Configuration

**Runtime settings** (`settings.json` in dataDir): LLM provider configs (base URL, API key, models) managed via the Settings UI/API. This is the primary way users configure LLM providers — the settings route reads/writes this file.

**Environment variables** (`.env`, fallback/override):
- `LLM_API_KEY` — API key for LLM provider
- `LLM_BASE_URL` — custom base URL (DeepSeek, DashScope, etc.)
- `LLM_MODEL` — default model name
- `EDITORIAL_MODEL` — model for editorial reviewers (can be cheaper)
- `AUTONOVEL_DATA_DIR` — book data directory (default: `books`)

## Global Core Memory (`global/core_memory/`)

Cross-book persistent memory stored as JSON files: `writing_principles.json`, `craft_skills.json`, `anti_patterns.json`, `user_preferences.json`, `reflection_log.json`. Read/written by `server/src/memory/core-memory.ts`.

## Stale Files

- **README.md** describes the old Python multi-agent GAN architecture — do not trust it for current architecture. CLAUDE.md is authoritative.
- **PROJECT_STRUCTURE.md** is partially outdated (test counts, some structural details).

## Language Context

Documentation and prompts are in Chinese. Key terms:
- 小说 = Novel, 大纲 = Outline, 草稿 = Draft
- 编辑部 = Editorial Department, 审稿人 = Reviewer
- 剧情树 = Plot Tree, 设定 = Lore/World-building
- 冰山写作法 = Iceberg Writing Method
