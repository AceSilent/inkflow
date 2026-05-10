# Agent Run Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Agent Run Timeline that shows each Author run's phases, tool calls, durations, failures, and restart recovery state without introducing a database.

**Architecture:** Backend emits timeline events through the existing Author Chat SSE and appends them to `books/{bookId}/runs/{runId}.jsonl`. Frontend renders the current run live and reloads recent run state from a new read-only endpoint so browser/backend restarts can show completed or interrupted runs. Existing chat segments and tool cards remain in place.

**Tech Stack:** Fastify routes, Vercel AI SDK stream parts, JSONL files, React state/components, Vitest, Vite.

---

### Task 1: Backend Timeline Storage

**Files:**
- Create: `server/src/runs/run-timeline.ts`
- Modify: `server/src/routes/author-chat.ts`
- Test: `server/tests/author-chat-routes.test.ts`

- [ ] **Step 1: Write failing storage tests**
  - Add tests for appending JSONL timeline events under `books/{bookId}/runs/{runId}.jsonl`.
  - Add test for loading recent run summaries and marking the last event as `interrupted` if no terminal event exists.

- [ ] **Step 2: Implement storage helper**
  - Export `createRunId()`, `appendRunEvent()`, `loadRecentRuns()`, `markRunInterruptedIfOpen()`.
  - Use sanitized `bookId`, create directories recursively, and write one JSON object per line.

- [ ] **Step 3: Add read endpoint**
  - `GET /api/v1/books/:bookId/runs/recent?limit=5`
  - Return recent runs with `runId`, `startedAt`, `endedAt`, `status`, `events`.

### Task 2: SSE Timeline Events

**Files:**
- Modify: `server/src/routes/author-chat.ts`
- Test: `server/tests/author-chat-routes.test.ts`

- [ ] **Step 1: Add timeline emitter in send route**
  - On each run, create `runId`, `seq`, and `timeline(type, patch)`.
  - Each call appends JSONL and sends `sse({ type: 'timeline', event })`.

- [ ] **Step 2: Instrument phases**
  - Emit `snapshot_start/done/error`, `context_start/done/error`, `agent_loop_start`, `tool_start/tool_done/tool_error`, `stream_done`, `usage_persist_start/done/timeout/error`, `memory_extract_start/done/error`, `run_done/run_error/run_aborted`.
  - Tool events include input/output previews and duration.

- [ ] **Step 3: Preserve done semantics**
  - `done` still goes out before usage persistence can block.
  - Usage persistence timeline is best effort; timeout is visible but does not keep UI loading.

### Task 3: Frontend Timeline Panel

**Files:**
- Create: `frontend/src/components/AgentRunTimeline.jsx`
- Modify: `frontend/src/components/AuthorChatPanel.jsx`

- [ ] **Step 1: Add live timeline state**
  - Fetch recent runs on book change.
  - Initialize current run when `timeline` events arrive.
  - Preserve live events until the run ends.

- [ ] **Step 2: Render timeline**
  - Compact header: current status, elapsed time, event count.
  - Vertical events with icons/color by status.
  - Tool events expandable with input summary, output summary, duration, failure reason.
  - Show interrupted recovery state for non-terminal run logs after restart.

- [ ] **Step 3: Keep chat UX stable**
  - Existing content/thinking/tool cards remain unchanged.
  - Stop button stays visible during active run.
  - Timeline should not dominate the chat; use a compact collapsible panel.

### Task 4: Verification and UI Retest

**Files:**
- No source changes unless verification finds defects.

- [ ] **Step 1: Run backend build and tests**
  - `cd server && npm run build`
  - `cd server && npm test`

- [ ] **Step 2: Run frontend build**
  - `cd frontend && npm run build`

- [ ] **Step 3: Browser retest**
  - Open `http://127.0.0.1:5173/`.
  - Use current book `朋友送的精灵·十章集成测试·字数门槛复测`.
  - Generate `ch02` through UI.
  - Verify timeline shows read tools, draft save, editorial submission, reviewer pass/fail, done, usage persistence status.

- [ ] **Step 4: Experience report**
  - Summarize human UX issues, book-quality issues, and optimization points.
  - Compare website vs Feishu for personal remote use.
