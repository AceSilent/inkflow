# Agentic Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AutoNovel Studio into a State-Driven Agentic Workflow with autonomous Author tool use, Editorial rejection loops, and passive Lore updating.

**Architecture:** A Task Log system (`books/<id>/tasks/*.json`) acts as the state machine. The Author Agent uses tools (`read_outline`, `search_lore`) to draft. The Editorial Department reviews and can reject drafts back to the Author up to 3 times. Humans act as the final approval gate. 

**Tech Stack:** Python, FastAPI, React context/hooks.

**Iron Rules:**
1. No mock data. Everything must run on real user data.
2. Timely kill completed background bash processes.
3. Use background bash tasks to prevent freezing.

---

### Phase 1: Task State Machine Infrastructure

**Files:**
- Create: `src/core/task_manager.py` (Manages JSON task logs)
- Modify: `src/api/routes/books.py` (Add endpoints to list/get tasks for a book)
- Modify: `src/core/models.py` (Define Task schemas: `TaskStatus` enum, `TaskRecord` pydantic model)

- [ ] **Step 1: Define Task Schemas**
  - In `models.py`, define `TaskStatus` (DRAFTING, EDITORIAL_REVIEW, HUMAN_APPROVAL_PENDING, COMPLETED, REJECTED, ERROR).
  - Define `TaskRecord` (id, book_id, type: str, status: TaskStatus, created_at, updated_at, payload: dict, metadata: dict).

- [ ] **Step 2: Implement TaskManager storage**
  - Create `task_manager.py` with `create_task`, `get_task`, `update_task_status`, `list_tasks` saving to `books/<book_id>/tasks/<task_id>.json`.

- [ ] **Step 3: Expose Task API**
  - In `routes/books.py`, add `GET /{book_id}/tasks` and `GET /{book_id}/tasks/{task_id}`.

### Phase 2: Author Agent Refactoring & Skills

**Files:**
- Create: `src/core/agent_tools.py` (Core tool implementations for agents)
- Modify: `src/core/groupchat_orchestrator.py` (Update Author prompt and enable tool usage)
- Create: `src/core/workflow_engine.py` (The loop that executes tasks based on state)

- [ ] **Step 1: Implement Author Tools**
  - In `agent_tools.py`, implement `read_file(path)`, `search_lore(query)`, `read_outline()`.
  
- [ ] **Step 2: Update Author Prompt**
  - In `groupchat_orchestrator.py`, update the Author system prompt to instruct them to use tools before drafting.

- [ ] **Step 3: Define OpenAI Tool schemas**
  - Map Python tools to OpenAI JSON schema tools for the Author agent completion call.

### Phase 3: Editorial Rejection Loop & Engine

**Files:**
- Modify: `src/core/workflow_engine.py`

- [ ] **Step 1: Implement the drafting node**
  - `execute_drafting(task)` -> Calls Author LLM with tools -> Updates task payload with draft text -> Transitions status to `EDITORIAL_REVIEW`.

- [ ] **Step 2: Implement the review node**
  - `execute_editorial_review(task)` -> Calls Editor LLM to review draft.
  - If pass: Set `HUMAN_APPROVAL_PENDING`.
  - If fail: Increment retry count in metadata. If < 3, append critique, set `DRAFTING`. Else set `ERROR`.

### Phase 4: Frontend UI Overhaul

**Files:**
- Create: `frontend/src/components/TaskBoard.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/GroupChatPanel.jsx`

- [ ] **Step 1: Task Board UI**
  - Build `TaskBoard.jsx` to list active tasks and their state machine status.
  - Show drafts pending Human Approval with "Approve" and "Reject (with feedback)" buttons.

- [ ] **Step 2: Human Interaction API**
  - Add backend route `POST /tasks/{task_id}/review` accepting `action` (approve/reject) and `feedback`.
  - Wire frontend buttons to this API.

### Phase 5: Lore Agent Pipeline

**Files:**
- Create: `src/core/lore_agent.py`

- [ ] **Step 1: Background Update Logic**
  - Detect when a task reaches `COMPLETED` (e.g., Chapter Published).
  - Submit published text to Lore Agent LLM to extract new entities.
  - Merge updates into `books/<id>/lore/characters.json` and `world_setting.json`.
