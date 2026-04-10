# Frontend-Backend Unification Design

> **Date**: 2026-04-10
> **Status**: Draft
> **Goal**: Connect React frontend to TypeScript backend, prune unused panels, establish unified review system

---

## 1. Problem Statement

The TypeScript backend (Fastify + Vercel AI SDK) has a complete agent loop with 17 tools and 57 passing tests, but the frontend still proxies to the legacy Python backend. The frontend has 20 panels calling 54 Python-specific endpoints. The Python multi-agent architecture (separate Author/Editor/Reader agents) has been replaced by a single-agent TS architecture, making most of those endpoints unnecessary.

Additionally:
- Panel interactions are broken — no cross-panel state updates
- Streaming SSE quality needs improvement in some panels
- The 7-template reviewer system (3 scene + 4 chapter) needs redesign into a unified dimension-based approach
- AI tone detection is the most critical quality gate and must be prominently featured

## 2. Architecture Decision

**Single-entry authoring, data-viewer panels:**

```
Frontend (:5173, proxy → :3001)
  │
  ├── AuthorChat Panel ──→ POST /api/author-chat/:bookId/send (SSE)
  │     └── Agent autonomously calls tools: save_draft, save_outline, save_lore,
  │           read_tree, submit_to_editorial, etc.
  │
  ├── Brainstorm Panel ──→ Same author-chat SSE endpoint (different system prompt)
  │
  ├── OutlineTree Panel ──→ GET/PUT /api/books/:bookId/outline (data R/W)
  │     └── Dual mode: Outline editor + Plot Tree visualization
  │
  ├── ChapterEditor Panel ──→ GET /api/books/:bookId/chapters/:id (data read)
  │     └── Embedded review results from submit_to_editorial
  │
  ├── Sidebar ──→ GET /api/books, /api/books/explorer (navigation)
  └── Settings ──→ GET/PUT /api/settings (config)
```

**Key insight:** Instead of reimplementing 54 Python endpoints, the TS backend needs only 16 endpoints (5 books + 6 data + 2 settings + 3 author-chat). The Author Agent handles all creation/review operations via tools. Other panels only read the data the Agent creates.

## 3. Panel Pruning

### Keep (6 panels)
| Panel | Purpose | Backend Need |
|-------|---------|-------------|
| Sidebar | Book navigation + create/delete | Books CRUD |
| AuthorChat | SSE conversation with Agent | author-chat SSE (done) |
| Brainstorm | Reuses author-chat SSE + brainstorm prompt | author-chat SSE (done) |
| OutlineTree | Outline editing + Plot Tree dual view | outline R/W + plot-tree read |
| ChapterEditor | Chapter content + unified review display | chapters read |
| Settings | Configuration management | settings CRUD |

### Remove (9 panels)
GroupChatPanel, EmotionPanel, TaskBoardPanel, InboxPanel, DirectorConsole, CharactersPanel, ReviewPanel, IcebergPanel, WelcomePanel.

**App.jsx changes:** Remove all imports/renders for deleted panels. Simplify `renderEditor()` switch and `handleActivityClick` tab mapping. The ActivityBar needs its icon set reduced to match the 6 remaining panels.

## 4. API Design (16 endpoints total)

### 4.1 Books CRUD
```
GET    /api/books                 → BookMeta[]
GET    /api/books/:bookId         → BookMeta + stats
POST   /api/books                 → Create book (init directory structure)
DELETE /api/books/:bookId         → Delete book + directory
GET    /api/books/explorer        → TreeNode[] for sidebar navigation
```

Implementation: `server/src/routes/books.ts`. Each book maps to a directory under `AUTONOVEL_DATA_DIR`. `createBook()` initializes the standard directory structure (00_Config, 01_Global_Settings, 02_Outlines, memory/). `explorer` scans directories and builds a tree of volume → chapter → scene.

### 4.2 Data Endpoints
```
GET    /api/books/:bookId/outline         → outline.json
PUT    /api/books/:bookId/outline         → save outline.json
GET    /api/books/:bookId/chapters        → ChapterSummary[]
GET    /api/books/:bookId/chapters/:id    → ChapterDetail (outline + draft + reviews)
GET    /api/books/:bookId/lore            → { characters, worldLore }
GET    /api/books/:bookId/plot-tree       → plot_tree.json
```

Implementation: `server/src/routes/data.ts`. These are thin file-read/write wrappers around the book data directory. All safety wrapping (backup + audit log) applies to PUT endpoints.

### 4.3 Settings
```
GET    /api/settings               → { llmModel, editorialModel, ... }
PUT    /api/settings               → update settings
```

Implementation: `server/src/routes/settings.ts`. Reads/writes a `settings.json` file at the data root. API keys are masked in GET responses.

### 4.4 Author Chat (already done)
```
GET    /api/author-chat/:bookId/history
DELETE /api/author-chat/:bookId/history
POST   /api/author-chat/:bookId/send     → SSE stream
```

**Brainstorm reuse:** The BrainstormPanel sends to the same `/api/author-chat/:bookId/send` endpoint, but adds a `mode: 'brainstorm'` field in the request body. The author-chat route detects this and injects a brainstorm-specific system prompt section into `PromptSection[]` before the regular sections. The brainstorm prompt instructs the Agent to: (1) focus on ideation and exploration, not writing polished prose, (2) actively extract and save lore/characters/settings using `save_lore` tool, (3) ask clarifying questions to deepen world-building, (4) avoid generating full chapter drafts. This avoids a separate brainstorm API.

## 5. Unified Review System

### 5.1 Design Principles

The existing 7-template system (3 scene-level + 4 chapter-level Jinja2 templates) is replaced by a **unified 4-dimension review**. All dimensions apply equally to any text length — a scene, a chapter, or a full arc.

### 5.2 Four Review Dimensions

**Dimension 1: AI Tone Detection (Anti-AI) — PRIMARY**

This is the most critical quality gate. The reviewer scans for:

| Pattern | Examples | Detection Rules |
|---------|----------|----------------|
| Formulaic transitions | "然而", "不禁", "眸中闪过一丝" | Flag top-50 AI-cliché phrases |
| Generic descriptions | "璀璨的光芒", "强大的气场" | Require specific sensory details |
| Over-explanation | Narrator tells what subtext should show | Verify "show, don't tell" compliance |
| Repetitive sentence structure | Sequential "他...了。他...了。他...了。" | Sentence length variance check |
| Emotional detachment | "感到一阵XX" without visceral grounding | Must anchor emotions in body/action |
| Information dumps | Long expository paragraphs | Break into scene-embedded reveals |

Scoring: 1-10. Below 6 = fail (must revise). Outputs specific flagged passages with rewrite suggestions.

**Dimension 2: Consistency (Lore)**

Checks text against the book's lore database:
- Character traits, relationships, abilities match `characters.json`
- World-building rules match `world_lore.json`
- Plot events match `plot_tree.json` and previous chapters
- No contradictions with established facts

Scoring: 1-10. Below 7 = fail.

**Dimension 3: Pacing (Rhythm)**

Analyzes narrative flow:
- Scene opening hooks and closing beats
- Tension curve across the text segment
- Action vs. reflection ratio
- Paragraph length variation for rhythm
- Dialogue pacing (not too dense, not too sparse)

Scoring: 1-10. Below 6 = fail.

**Dimension 4: Structure (Craft)**

Evaluates structural quality:
- POV consistency within scenes
- Scene goal/conflict/resolution arc
- Sensory detail diversity (not just visual)
- Dialogue attribution clarity
- Scene transition smoothness

Scoring: 1-10. Below 6 = fail.

### 5.3 Pipeline Implementation

Replace `server/src/editorial/pipeline.ts`:

```typescript
interface ReviewDimension {
  id: 'anti_ai' | 'consistency' | 'pacing' | 'structure'
  name: string          // e.g. "AI味检测"
  templateFile: string  // e.g. "review_anti_ai.j2"
  passThreshold: number // e.g. 6
}

interface DimensionResult {
  dimension: ReviewDimension['id']
  score: number
  pass: boolean
  issues: Array<{
    location: string    // quoted passage
    problem: string     // what's wrong
    suggestion: string  // how to fix
  }>
}

interface UnifiedReviewResult {
  overall_pass: boolean
  dimensions: DimensionResult[]
  summary: string       // merged actionable feedback
}
```

Pipeline runs 4 parallel LLM calls (one per dimension) via `Promise.all`. Each call uses its own `.j2` template. The `EDITORIAL_MODEL` env var controls which model to use (can be cheaper/faster than the author model).

### 5.4 Template Files

Create 4 new templates in `prompts/`:
- `review_anti_ai.j2` — AI tone detection with cliché phrase list
- `review_consistency.j2` — Lore consistency checker
- `review_pacing.j2` — Rhythm and pacing analysis
- `review_structure.j2` — Structural craft evaluation

Each template expects JSON input with: text, book_lore, plot_context. Each outputs structured JSON matching `DimensionResult`.

The existing 7 templates (`reader_scene_*.j2`, `reader_*_keeper.j2`, etc.) are deprecated but kept for reference during migration.

### 5.5 Frontend Display in ChapterEditor

When the Author Agent calls `submit_to_editorial`, the tool result includes the full `UnifiedReviewResult`. The ChapterEditor parses this and displays:

1. **Summary card** — overall pass/fail with aggregate score
2. **4-dimension bar chart** — simple CSS-based score bars per dimension (no external charting library)
3. **Dimension tabs** — click a dimension to see flagged passages + suggestions
4. **Inline markers** — in the chapter text, highlight passages that were flagged

## 6. Implementation Slices

### Slice 1: Foundation — Prune + Books CRUD + Proxy Switch

**Backend (`server/src/routes/`):**
- `books.ts` — 5 endpoints (list, get, create, delete, explorer)
- `settings.ts` — 2 endpoints (get, put)
- Register in `index.ts`

**Frontend:**
- Delete 9 unused panel files
- Simplify `App.jsx` — remove imports, simplify `renderEditor()` and `handleActivityClick()`
- Update `ActivityBar.jsx` — 6 icons only (explorer, author-chat, brainstorm, outline, chapter, settings)
- Switch `vite.config.js` proxy target from `:9864` to `:3001`
- Update `Sidebar.jsx` to use new `/api/books/` endpoints
- Update `SettingsPanel.jsx` to use new `/api/settings/` endpoints

**Tests:**
- `server/tests/books.test.ts` — CRUD operations + directory structure initialization
- `server/tests/settings.test.ts` — get/put + key masking

**Acceptance:** Can create/delete books in sidebar, switch between books, settings panel works.

### Slice 2: Core Authoring — AuthorChat + Brainstorm SSE

**Backend:**
- Extend `author-chat.ts` to support `mode: 'brainstorm'` in request body
- Add brainstorm-specific prompt section to `prompt-builder.ts`

**Frontend:**
- `AuthorChatPanel.jsx` — verify SSE streaming works with TS backend (already uses `/api/v1/` prefix — needs path change to `/api/`)
- `BrainstormPanel.jsx` — rewrite to use author-chat SSE endpoint instead of synchronous brainstorm endpoint
- Panel linkage: add `onDataChanged` callback prop pattern — when Agent uses tools (save_lore, save_outline), parent App notifies other panels to refresh

**Tests:**
- `server/tests/author-chat-brainstorm.test.ts` — brainstorm mode prompt injection

**Acceptance:** Can chat with Agent via SSE in both AuthorChat and Brainstorm modes. Tool calls display correctly. Brainstorm results persist.

### Slice 3: Outline + Plot Tree

**Backend:**
- `data.ts` — outline R/W, plot-tree read, lore read endpoints

**Frontend:**
- `OutlineTreeEditor.jsx` — connect to new data endpoints, add dual-mode toggle:
  - **Outline mode** — tree-based outline editor (existing functionality)
  - **Plot Tree mode** — read-only visualization of `plot_tree.json` with node expansion, branch colors, path confirmation status
- Panel linkage: after Agent calls `save_outline`, OutlineTree auto-refreshes

**Tests:**
- `server/tests/data-routes.test.ts` — outline R/W, plot-tree read, lore read

**Acceptance:** Can view and edit outlines. Can switch to plot tree view and see Agent-created tree structure.

### Slice 4: Chapter Editor + Unified Review

**Backend:**
- Extend `data.ts` — chapters list, chapter detail endpoint
- Rewrite `server/src/editorial/pipeline.ts` — unified 4-dimension pipeline
- Create 4 new review templates in `prompts/`
- Update `submit_to_editorial` tool to use new pipeline

**Frontend:**
- `ChapterEditor.jsx` — connect to chapter data endpoints, add review results display:
  - Summary card (pass/fail + aggregate score)
  - Dimension tabs with flagged passages
  - Expandable issue cards per dimension

**Tests:**
- `server/tests/unified-review.test.ts` — 4-dimension pipeline logic
- Update `server/tests/editorial.test.ts` — new pipeline interface

**Acceptance:** Full creative flow works: create book → brainstorm → outline → write chapter → submit to editorial → see review results.

## 7. Panel Linkage Pattern

Cross-panel communication uses a lightweight event pattern in App.jsx:

```typescript
// App-level state
const [dataVersion, setDataVersion] = useState(0)

const refreshData = () => setDataVersion(v => v + 1)

// Pass to AuthorChat — SSE 'done' event includes tools_used array.
// When tools_used contains write tools (save_draft, save_outline, save_lore),
// AuthorChatPanel calls onDataChanged to notify other panels.
<AuthorChatPanel onDataChanged={refreshData} />

// Pass to data viewers — they re-fetch when dataVersion changes
<OutlineTreeEditor dataVersion={dataVersion} />
<ChapterEditor dataVersion={dataVersion} />
```

This avoids complex state management libraries. Data viewers watch `dataVersion` in a `useEffect` and re-fetch from the backend when it changes.

## 8. File Structure After Implementation

```
server/src/
├── index.ts                # + register books, data, settings routes
├── routes/
│   ├── author-chat.ts      # (existing) + brainstorm mode support
│   ├── books.ts            # NEW — 5 endpoints
│   ├── data.ts             # NEW — 6 data endpoints
│   └── settings.ts         # NEW — 2 endpoints
├── editorial/
│   ├── editorial.ts        # (existing) — updated tool interface
│   └── pipeline.ts         # REWRITE — 4-dimension unified pipeline
├── agent/
│   ├── agent-loop.ts       # (existing, no changes)
│   └── prompt-builder.ts   # + brainstorm mode section
├── tools/                  # (existing, no changes)
├── memory/                 # (existing, no changes)
└── llm/                    # (existing, no changes)

prompts/
├── review_anti_ai.j2       # NEW — AI tone detection
├── review_consistency.j2   # NEW — Lore consistency
├── review_pacing.j2        # NEW — Rhythm analysis
├── review_structure.j2     # NEW — Structural craft
├── skill_*.md              # (existing, unchanged)
└── reader_*.j2             # DEPRECATED — kept for reference

frontend/src/components/
├── ActivityBar.jsx          # SIMPLIFIED — 6 icons
├── App.jsx                  # SIMPLIFIED — fewer panels, dataVersion linkage
├── Sidebar.jsx              # UPDATED — new API paths
├── AuthorChatPanel.jsx      # UPDATED — API path change
├── BrainstormPanel.jsx      # REWRITTEN — SSE-based
├── OutlineTreeEditor.jsx    # ENHANCED — dual mode (outline + plot tree)
├── ChapterEditor.jsx        # ENHANCED — embedded review display
├── SettingsPanel.jsx        # UPDATED — new API paths
├── NewBookModal.jsx         # UPDATED — new API path
├── TabBar.jsx               # (existing, no changes)
└── Toast.jsx                # (existing, no changes)
```

## 9. API Path Migration

The Python backend uses `/api/v1/` prefix. The TS backend uses `/api/` (no version prefix). Frontend components currently call `/api/v1/...`. Migration requires:

1. Search all `frontend/src/` for `/api/v1/` references
2. Replace with `/api/` (matching TS backend routes)
3. Alternatively, register TS routes under `/api/v1/` to match existing frontend calls — this is simpler and requires zero frontend path changes. **Recommended approach.**

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Brainstorm SSE rewrite breaks UX | Brainstorm panel unusable | Keep Python brainstorm endpoint as fallback during migration |
| Unified review templates produce bad JSON | Pipeline crashes | Add Zod validation + fallback error handling per dimension |
| Plot tree visualization complex | Delay in Slice 3 | Start with read-only text view, enhance to visual later |
| Frontend API path migration incomplete | Mixed Python/TS calls | Search for all `/api/v1/` references, replace systematically |
