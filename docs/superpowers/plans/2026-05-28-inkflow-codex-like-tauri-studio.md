# InkFlow Codex-like Tauri Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first vertical slice of InkFlow as a Mac-first, Codex-like novel studio with a split chat/workspace UI, clearer Agent session controls, message checkpoint recovery, and a Tauri shell.

**Architecture:** Keep the existing Fastify backend and React/Vite frontend, then add focused adapters around them instead of rewriting the application. The frontend gains an Editorial Glass design system and a new `studio/` shell that wraps existing chapter/outline/plot graph capabilities. The backend keeps snapshots as storage but exposes message checkpoint semantics, while Tauri runs the built frontend and manages the Node server sidecar.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4 via `@tailwindcss/vite`, Fastify 5, Vitest 4, TypeScript 6, Tauri v2, Node sidecar.

**Primary references:**
- Design spec: `docs/superpowers/specs/2026-05-28-inkflow-codex-like-tauri-studio-design.md`
- Tailwind v4 Vite install: <https://tailwindcss.com/docs/installation>
- Tauri Node sidecar guide: <https://v2.tauri.app/learn/sidecar-nodejs/>
- Tauri DMG guide: <https://v2.tauri.app/distribute/dmg/>

---

## File Structure

### Frontend Files

- Modify `frontend/package.json`: add Tailwind v4, Tauri JS API packages, and scripts.
- Modify `frontend/vite.config.js`: add `@tailwindcss/vite` plugin and API base handling.
- Modify `frontend/src/index.css`: import Tailwind and new design/motion layers.
- Modify `frontend/src/design-tokens.css`: replace or extend tokens with Editorial Glass OKLCH variables.
- Create `frontend/src/styles/agent-motion.css`: shimmer, breathing, and reduced-motion rules.
- Create `frontend/src/lib/apiBase.js`: central API URL helper for browser and Tauri modes.
- Create `frontend/src/components/studio/workspaceLayout.js`: pure state helpers for pane width/collapse persistence.
- Create `frontend/src/components/studio/workspaceLayout.test.ts`: unit tests for pane layout helpers.
- Create `frontend/src/components/studio/StudioShell.jsx`: app shell with rail, library, chat, splitter, workspace pane.
- Create `frontend/src/components/studio/WorkspacePane.jsx`: collapsible/resizable right pane.
- Create `frontend/src/components/studio/WorkspaceTabs.jsx`: `章节` / `大纲` / `剧情图` tab host.
- Create `frontend/src/components/studio/ChapterWorkspace.jsx`: preview/edit chapter tab.
- Create `frontend/src/components/studio/chapterWorkspaceState.js`: pure helpers for dirty state and word count.
- Create `frontend/src/components/studio/chapterWorkspaceState.test.ts`: tests for chapter helper behavior.
- Create `frontend/src/components/studio/OutlineWorkspace.jsx`: thin wrapper for existing outline component.
- Create `frontend/src/components/studio/PlotGraphWorkspace.jsx`: thin wrapper for existing plot graph component.
- Create `frontend/src/components/author-chat/slashCommands.js`: slash command parser.
- Create `frontend/src/components/author-chat/slashCommands.test.ts`: tests for `/compact`, `/clear`, `/remember`.
- Create `frontend/src/components/author-chat/checkpointActions.js`: request payload helpers for message checkpoint actions.
- Create `frontend/src/components/author-chat/checkpointActions.test.ts`: tests for checkpoint action payloads.
- Modify `frontend/src/components/author-chat/MessageCards.jsx`: add user message actions and shimmer classes.
- Modify `frontend/src/components/AuthorChatPanel.jsx`: remove primary snapshot button, call session/checkpoint endpoints, pass message actions.
- Modify `frontend/src/App.jsx`: render `StudioShell` and feed it existing panel data.
- Modify `frontend/src/i18n/locales.js`: add labels for workspace tabs, message checkpoint actions, session commands, and Tauri status.

### Backend Files

- Modify `server/src/snapshots/snapshots.ts`: allow optional checkpoint metadata in snapshot meta.
- Create `server/src/routes/checkpoints.ts`: restore/truncate checkpoint route.
- Create `server/src/routes/session.ts`: `/compact` and `/clear` session routes.
- Modify `server/src/routes/author-chat.ts`: create checkpoints with IDs, store user message metadata, emit lifecycle labels.
- Modify `server/src/routes/author-chat-support.ts`: expose clear-session helper for session route.
- Modify `server/src/routes/chat-history.ts`: add message ID helpers and truncation helper.
- Modify `server/src/runs/run-timeline.ts`: add run truncation helper after a checkpoint restore.
- Modify `server/src/index.ts`: register checkpoint and session routes.
- Create `server/tests/checkpoints.test.ts`: checkpoint restore and truncation tests.
- Create `server/tests/session-routes.test.ts`: compact and clear tests.
- Modify `server/tests/author-chat-routes.test.ts`: assert checkpoint metadata is saved.
- Modify `server/tests/run-timeline.test.ts`: test timeline truncation helper.

### Tauri Files

- Create `src-tauri/Cargo.toml`: Tauri app dependencies.
- Create `src-tauri/tauri.conf.json`: app window, build, bundle, and sidecar config.
- Create `src-tauri/capabilities/default.json`: shell sidecar permissions.
- Create `src-tauri/src/main.rs`: app bootstrap, sidecar process, API port command, shutdown.
- Create `src-tauri/binaries/.gitkeep`: placeholder for generated sidecar binaries.
- Create `desktop-sidecar/index.js`: package entrypoint for the Node/Fastify backend sidecar.
- Create `scripts/build-tauri-sidecar.mjs`: build server and prepare sidecar binary name.
- Modify root `package.json`: add Tauri dev/build scripts.
- Modify `server/src/agent/prompt-builder.ts`: allow packaged sidecar to locate bundled prompts.
- Modify `.gitignore`: ignore generated Tauri binaries and Rust target output while keeping source.

---

### Task 1: Tailwind v4 And Editorial Glass Tokens

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/design-tokens.css`
- Create: `frontend/src/styles/agent-motion.css`

- [ ] **Step 1: Install Tailwind v4 dependencies**

Run:

```bash
npm --prefix frontend install tailwindcss @tailwindcss/vite
```

Expected: `frontend/package.json` and `frontend/package-lock.json` include `tailwindcss` and `@tailwindcss/vite`.

- [ ] **Step 2: Configure Vite plugin**

Replace `frontend/vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.INKFLOW_API_TARGET || 'http://localhost:3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
```

- [ ] **Step 3: Add Tailwind and motion imports**

At the top of `frontend/src/index.css`, replace the imports with:

```css
@import "tailwindcss";
@import "./design-tokens.css";
@import "./typography.css";
@import "./styles/agent-motion.css";
```

Keep the rest of the existing file below these imports for the first pass so old components still render.

- [ ] **Step 4: Replace design tokens with Editorial Glass variables**

Update the top of `frontend/src/design-tokens.css` so it includes these variables while preserving any existing reviewer-specific variables still used by components:

```css
:root {
  color-scheme: light;

  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-serif: ui-serif, Georgia, "Times New Roman", serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  --bg: oklch(98.4% 0.006 255);
  --bg-subtle: oklch(96.8% 0.008 255);
  --bg-elevated: oklch(99.2% 0.004 255);
  --surface-glass: oklch(100% 0 0 / 0.72);
  --surface-paper: oklch(98.8% 0.012 82);

  --ink: oklch(23% 0.025 260);
  --ink-secondary: oklch(42% 0.022 260);
  --ink-muted: oklch(60% 0.018 260);

  --border-subtle: oklch(88.5% 0.012 255);
  --border-strong: oklch(78% 0.018 255);

  --accent: oklch(58% 0.18 250);
  --accent-soft: oklch(94% 0.035 250);
  --accent-strong: oklch(47% 0.2 250);

  --success: oklch(64% 0.14 145);
  --warning: oklch(74% 0.15 75);
  --danger: oklch(60% 0.18 28);
  --info: oklch(62% 0.13 220);
  --thinking: oklch(62% 0.16 285);

  --reviewer-lore: oklch(58% 0.16 285);
  --reviewer-pacing: oklch(62% 0.13 220);
  --reviewer-tone: oklch(70% 0.14 75);
  --reviewer-character: oklch(64% 0.14 145);
  --reviewer-causality: oklch(60% 0.18 28);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: oklch(18% 0.018 260);
  --bg-subtle: oklch(21% 0.018 260);
  --bg-elevated: oklch(24% 0.018 260);
  --surface-glass: oklch(25% 0.018 260 / 0.78);
  --surface-paper: oklch(26% 0.018 82);

  --ink: oklch(93% 0.01 255);
  --ink-secondary: oklch(78% 0.012 255);
  --ink-muted: oklch(63% 0.012 255);

  --border-subtle: oklch(32% 0.014 260);
  --border-strong: oklch(42% 0.016 260);

  --accent: oklch(70% 0.13 250);
  --accent-soft: oklch(30% 0.06 250);
  --accent-strong: oklch(78% 0.14 250);
}
```

- [ ] **Step 5: Add Agent motion CSS**

Create `frontend/src/styles/agent-motion.css`:

```css
.agent-shimmer {
  background: linear-gradient(
    110deg,
    var(--ink-muted) 0%,
    var(--thinking) 28%,
    var(--accent) 44%,
    var(--ink-muted) 62%
  );
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: agent-shimmer-sweep 1.8s ease-in-out infinite;
}

.agent-breathe {
  animation: agent-breathe-border 2.4s ease-in-out infinite;
}

@keyframes agent-shimmer-sweep {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

@keyframes agent-breathe-border {
  0%, 100% { box-shadow: 0 0 0 0 oklch(62% 0.16 285 / 0.12); }
  50% { box-shadow: 0 0 0 3px oklch(62% 0.16 285 / 0.18); }
}

@media (prefers-reduced-motion: reduce) {
  .agent-shimmer,
  .agent-breathe {
    animation: none;
  }
}
```

- [ ] **Step 6: Verify frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: build succeeds and `frontend/dist/` is generated.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/index.css frontend/src/design-tokens.css frontend/src/styles/agent-motion.css
git commit -m "feat: add editorial glass design tokens"
```

---

### Task 2: Workspace Layout State Helpers

**Files:**
- Create: `frontend/src/components/studio/workspaceLayout.js`
- Create: `frontend/src/components/studio/workspaceLayout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/studio/workspaceLayout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clampWorkspaceWidth,
  defaultWorkspaceLayout,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  storageKeyForBook,
} from './workspaceLayout'

describe('workspace layout helpers', () => {
  it('builds a per-book storage key', () => {
    expect(storageKeyForBook('book-one')).toBe('inkflow.workspaceLayout:book-one')
    expect(storageKeyForBook()).toBe('inkflow.workspaceLayout:global')
  })

  it('clamps workspace width between readable bounds', () => {
    expect(clampWorkspaceWidth(120, 1440)).toBe(320)
    expect(clampWorkspaceWidth(900, 1440)).toBe(720)
    expect(clampWorkspaceWidth(480, 1440)).toBe(480)
  })

  it('loads defaults when storage is empty or invalid', () => {
    const store = new Map<string, string>()
    expect(loadWorkspaceLayout('book-one', store)).toEqual(defaultWorkspaceLayout)
    store.set(storageKeyForBook('book-one'), '{broken json')
    expect(loadWorkspaceLayout('book-one', store)).toEqual(defaultWorkspaceLayout)
  })

  it('saves and loads layout state', () => {
    const store = new Map<string, string>()
    saveWorkspaceLayout('book-one', { collapsed: true, width: 420, activeTab: 'plot' }, store)
    expect(loadWorkspaceLayout('book-one', store)).toEqual({
      collapsed: true,
      width: 420,
      activeTab: 'plot',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend test -- workspaceLayout
```

Expected: FAIL because `workspaceLayout` does not exist.

- [ ] **Step 3: Implement helpers**

Create `frontend/src/components/studio/workspaceLayout.js`:

```js
export const WORKSPACE_MIN_WIDTH = 320
export const WORKSPACE_DEFAULT_WIDTH = 460

export const defaultWorkspaceLayout = {
  collapsed: false,
  width: WORKSPACE_DEFAULT_WIDTH,
  activeTab: 'chapter',
}

export function storageKeyForBook(bookId) {
  return `inkflow.workspaceLayout:${bookId || 'global'}`
}

export function clampWorkspaceWidth(width, viewportWidth = 1440) {
  const max = Math.max(WORKSPACE_MIN_WIDTH, Math.floor(viewportWidth * 0.5))
  return Math.min(max, Math.max(WORKSPACE_MIN_WIDTH, Math.round(Number(width) || WORKSPACE_DEFAULT_WIDTH)))
}

function readStore(store, key) {
  if (store instanceof Map) return store.get(key) ?? null
  return store.getItem(key)
}

function writeStore(store, key, value) {
  if (store instanceof Map) store.set(key, value)
  else store.setItem(key, value)
}

export function loadWorkspaceLayout(bookId, store = window.localStorage) {
  try {
    const raw = readStore(store, storageKeyForBook(bookId))
    if (!raw) return defaultWorkspaceLayout
    const parsed = JSON.parse(raw)
    return {
      collapsed: Boolean(parsed.collapsed),
      width: clampWorkspaceWidth(parsed.width),
      activeTab: ['chapter', 'outline', 'plot'].includes(parsed.activeTab)
        ? parsed.activeTab
        : defaultWorkspaceLayout.activeTab,
    }
  } catch {
    return defaultWorkspaceLayout
  }
}

export function saveWorkspaceLayout(bookId, layout, store = window.localStorage) {
  const normalized = {
    collapsed: Boolean(layout.collapsed),
    width: clampWorkspaceWidth(layout.width),
    activeTab: ['chapter', 'outline', 'plot'].includes(layout.activeTab)
      ? layout.activeTab
      : defaultWorkspaceLayout.activeTab,
  }
  writeStore(store, storageKeyForBook(bookId), JSON.stringify(normalized))
  return normalized
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix frontend test -- workspaceLayout
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/studio/workspaceLayout.js frontend/src/components/studio/workspaceLayout.test.ts
git commit -m "feat: add workspace layout state helpers"
```

---

### Task 3: Studio Shell And Resizable Workspace Pane

**Files:**
- Create: `frontend/src/components/studio/StudioShell.jsx`
- Create: `frontend/src/components/studio/WorkspacePane.jsx`
- Create: `frontend/src/components/studio/WorkspaceTabs.jsx`

- [ ] **Step 1: Create WorkspacePane component**

Create `frontend/src/components/studio/WorkspacePane.jsx`:

```jsx
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'

export function WorkspacePane({
  collapsed,
  width,
  activeTab,
  onToggle,
  onResizeStart,
  onTabChange,
  children,
}) {
  return (
    <>
      <div
        className="workspace-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        onPointerDown={onResizeStart}
        hidden={collapsed}
      >
        <GripVertical size={14} />
      </div>
      <aside
        className={`workspace-pane ${collapsed ? 'collapsed' : ''}`}
        style={{ width: collapsed ? 0 : width }}
        data-active-tab={activeTab}
      >
        <button className="workspace-collapse" type="button" onClick={onToggle} title={collapsed ? '展开作品空间' : '收起作品空间'}>
          {collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        {!collapsed && children}
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Create WorkspaceTabs component**

Create `frontend/src/components/studio/WorkspaceTabs.jsx`:

```jsx
const tabs = [
  { id: 'chapter', label: '章节' },
  { id: 'outline', label: '大纲' },
  { id: 'plot', label: '剧情图' },
]

export function WorkspaceTabs({ activeTab, onTabChange, chapter, outline, plot }) {
  return (
    <div className="workspace-tabs-shell">
      <div className="workspace-tabs" role="tablist" aria-label="作品空间">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="workspace-tab-panel" role="tabpanel">
        {activeTab === 'chapter' ? chapter : activeTab === 'outline' ? outline : plot}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create StudioShell component**

Create `frontend/src/components/studio/StudioShell.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Library, Search, Settings, Brain } from 'lucide-react'
import { WorkspacePane } from './WorkspacePane'
import { WorkspaceTabs } from './WorkspaceTabs'
import { clampWorkspaceWidth, loadWorkspaceLayout, saveWorkspaceLayout } from './workspaceLayout'

export function StudioShell({
  theme,
  currentBook,
  activePanel,
  onActivityClick,
  sidebar,
  chat,
  chapter,
  outline,
  plot,
  statusbar,
}) {
  const bookId = currentBook?.book_id
  const [layout, setLayout] = useState(() => loadWorkspaceLayout(bookId))

  useEffect(() => {
    setLayout(loadWorkspaceLayout(bookId))
  }, [bookId])

  const persistLayout = useCallback((patch) => {
    setLayout(prev => {
      const next = saveWorkspaceLayout(bookId, { ...prev, ...patch })
      return next
    })
  }, [bookId])

  const startResize = useCallback((event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startX = event.clientX
    const startWidth = layout.width
    const onMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      persistLayout({ collapsed: false, width: clampWorkspaceWidth(startWidth + delta, window.innerWidth) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [layout.width, persistLayout])

  const railItems = useMemo(() => [
    { id: 'explorer', icon: Library, title: '书籍' },
    { id: 'author-chat', icon: Brain, title: 'Agent' },
    { id: 'search', icon: Search, title: '搜索' },
    { id: 'settings', icon: Settings, title: '设置' },
  ], [])

  return (
    <div className="studio-shell" data-theme={theme}>
      <header className="studio-titlebar" data-tauri-drag-region>
        <div className="studio-titlebar-brand" data-tauri-drag-region>
          <BookOpen size={15} />
          <span>InkFlow Studio</span>
        </div>
        <div className="studio-titlebar-context" data-tauri-drag-region>
          {currentBook?.title || '未选择书籍'}
        </div>
      </header>

      <nav className="studio-rail" aria-label="Primary">
        {railItems.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={`studio-rail-item ${activePanel === item.id ? 'active' : ''}`}
              title={item.title}
              onClick={() => onActivityClick(item.id)}
            >
              <Icon size={19} />
            </button>
          )
        })}
      </nav>

      <section className="studio-library">
        {sidebar}
      </section>

      <main className="studio-main">
        <section className="studio-chat">
          {chat}
        </section>
        <WorkspacePane
          collapsed={layout.collapsed}
          width={layout.width}
          activeTab={layout.activeTab}
          onToggle={() => persistLayout({ collapsed: !layout.collapsed })}
          onResizeStart={startResize}
        >
          <WorkspaceTabs
            activeTab={layout.activeTab}
            onTabChange={(activeTab) => persistLayout({ activeTab })}
            chapter={chapter}
            outline={outline}
            plot={plot}
          />
        </WorkspacePane>
      </main>

      {statusbar}
    </div>
  )
}
```

- [ ] **Step 4: Add shell CSS to `frontend/src/index.css`**

Append:

```css
.studio-shell {
  display: grid;
  grid-template-areas:
    "titlebar titlebar titlebar"
    "rail library main"
    "status status status";
  grid-template-columns: 52px 260px minmax(0, 1fr);
  grid-template-rows: 38px minmax(0, 1fr) var(--statusbar-h);
  height: 100vh;
  background: var(--bg);
  color: var(--ink);
}

.studio-titlebar {
  grid-area: titlebar;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 78px;
  background: var(--surface-glass);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(18px);
  user-select: none;
}

.studio-titlebar-brand,
.studio-titlebar-context {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-secondary);
}

.studio-rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 6px;
  background: var(--bg-subtle);
  border-right: 1px solid var(--border-subtle);
}

.studio-rail-item {
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  color: var(--ink-muted);
  background: transparent;
}

.studio-rail-item.active,
.studio-rail-item:hover {
  color: var(--accent);
  background: var(--accent-soft);
}

.studio-library {
  grid-area: library;
  min-width: 0;
  overflow: hidden;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-subtle);
}

.studio-main {
  grid-area: main;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.studio-chat {
  flex: 1 1 auto;
  min-width: 360px;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

.workspace-splitter {
  width: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-muted);
  background: var(--bg-subtle);
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  cursor: col-resize;
}

.workspace-pane {
  position: relative;
  min-width: 0;
  max-width: 50vw;
  overflow: hidden;
  background: var(--surface-paper);
  transition: width 180ms ease-out;
}

.workspace-pane.collapsed {
  width: 0;
  border: 0;
}

.workspace-collapse {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-glass);
  color: var(--ink-secondary);
}

.workspace-tabs-shell {
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr);
  height: 100%;
}

.workspace-tabs {
  display: flex;
  align-items: end;
  gap: 4px;
  padding: 0 12px 0 44px;
  border-bottom: 1px solid var(--border-subtle);
}

.workspace-tab {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px 9px 0 0;
  background: transparent;
  color: var(--ink-muted);
  font-size: 12px;
  font-weight: 600;
}

.workspace-tab.active {
  background: var(--bg-elevated);
  color: var(--ink);
}

.workspace-tab-panel {
  min-height: 0;
  overflow: auto;
  background: var(--bg-elevated);
}

.studio-shell .statusbar {
  grid-area: status;
}
```

- [ ] **Step 5: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/studio/StudioShell.jsx frontend/src/components/studio/WorkspacePane.jsx frontend/src/components/studio/WorkspaceTabs.jsx frontend/src/index.css
git commit -m "feat: add codex-like studio shell"
```

---

### Task 4: Chapter Workspace Preview/Edit Mode

**Files:**
- Create: `frontend/src/components/studio/chapterWorkspaceState.js`
- Create: `frontend/src/components/studio/chapterWorkspaceState.test.ts`
- Create: `frontend/src/components/studio/ChapterWorkspace.jsx`

- [ ] **Step 1: Write failing helper tests**

Create `frontend/src/components/studio/chapterWorkspaceState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countCjkAwareWords, isDraftDirty, normalizeChapterContent } from './chapterWorkspaceState'

describe('chapter workspace state', () => {
  it('normalizes missing content to empty string', () => {
    expect(normalizeChapterContent(null)).toBe('')
    expect(normalizeChapterContent('  text  ')).toBe('  text  ')
  })

  it('detects dirty drafts by exact content', () => {
    expect(isDraftDirty('abc', 'abc')).toBe(false)
    expect(isDraftDirty('abc', 'abc ')).toBe(true)
  })

  it('counts CJK characters and latin words', () => {
    expect(countCjkAwareWords('雨落在窗上 hello world')).toBe(7)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend test -- chapterWorkspaceState
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement helper**

Create `frontend/src/components/studio/chapterWorkspaceState.js`:

```js
export function normalizeChapterContent(value) {
  return typeof value === 'string' ? value : ''
}

export function isDraftDirty(original, next) {
  return normalizeChapterContent(original) !== normalizeChapterContent(next)
}

export function countCjkAwareWords(text) {
  const source = normalizeChapterContent(text)
  const cjk = source.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const latin = source
    .replace(/[\u3400-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return cjk + latin
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
npm --prefix frontend test -- chapterWorkspaceState
```

Expected: PASS.

- [ ] **Step 5: Implement ChapterWorkspace**

Create `frontend/src/components/studio/ChapterWorkspace.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Edit3, Loader, Save, X } from 'lucide-react'
import { countCjkAwareWords, isDraftDirty, normalizeChapterContent } from './chapterWorkspaceState'

export function ChapterWorkspace({ bookId, chapter, dataVersion, addToast }) {
  const chapterId = chapter?.id
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('preview')
  const [original, setOriginal] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!bookId || !chapterId) {
        setOriginal('')
        setDraft('')
        return
      }
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`)
        const data = response.ok ? await response.json() : null
        const content = normalizeChapterContent(data?.content)
        if (!cancelled) {
          setOriginal(content)
          setDraft(content)
          setMode('preview')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [bookId, chapterId, dataVersion])

  const dirty = useMemo(() => isDraftDirty(original, draft), [original, draft])
  const wordCount = useMemo(() => countCjkAwareWords(draft), [draft])

  const save = useCallback(async () => {
    if (!bookId || !chapterId || !dirty) return
    setSaving(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!response.ok) throw new Error('save failed')
      setOriginal(draft)
      setMode('preview')
      addToast?.('章节已保存', 'success')
    } catch (error) {
      addToast?.(`保存失败：${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast, bookId, chapterId, dirty, draft])

  if (!bookId || !chapterId) {
    return <div className="chapter-workspace-empty">选择一个章节后查看正文</div>
  }

  if (loading) {
    return <div className="chapter-workspace-empty"><Loader className="anim-spin" size={18} /> 正在读取章节</div>
  }

  return (
    <div className="chapter-workspace">
      <header className="chapter-workspace-head">
        <div>
          <div className="chapter-workspace-kicker">当前章节</div>
          <h2>{chapter?.label || chapterId}</h2>
        </div>
        <div className="chapter-workspace-actions">
          <span className="chapter-workspace-stat">{wordCount} 字/词</span>
          {mode === 'preview' ? (
            <button className="btn btn-sm" type="button" onClick={() => setMode('edit')}>
              <Edit3 size={13} /> 编辑
            </button>
          ) : (
            <>
              <button className="btn btn-sm btn-secondary" type="button" onClick={() => { setDraft(original); setMode('preview') }}>
                <X size={13} /> 取消
              </button>
              <button className="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader className="anim-spin" size={13} /> : <Save size={13} />} 保存
              </button>
            </>
          )}
        </div>
      </header>

      {mode === 'preview' ? (
        <article className="chapter-workspace-preview">
          {draft ? draft.split(/\n{2,}/).map((para, index) => <p key={index}>{para}</p>) : <p className="muted">暂无正文</p>}
        </article>
      ) : (
        <textarea
          className="chapter-workspace-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
      )}

      {mode === 'edit' && dirty && <div className="chapter-workspace-save-state">有未保存修改</div>}
      {mode === 'preview' && !dirty && <div className="chapter-workspace-save-state"><Check size={12} /> 已保存</div>}
    </div>
  )
}
```

- [ ] **Step 6: Append ChapterWorkspace CSS**

Append to `frontend/src/index.css`:

```css
.chapter-workspace {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--surface-paper);
}

.chapter-workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.chapter-workspace-kicker {
  font-size: 11px;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: .08em;
}

.chapter-workspace-head h2 {
  margin: 2px 0 0;
  font-family: var(--font-serif);
  font-size: 20px;
}

.chapter-workspace-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapter-workspace-stat,
.chapter-workspace-save-state {
  font-size: 11px;
  color: var(--ink-muted);
}

.chapter-workspace-preview {
  padding: 26px 30px;
  overflow: auto;
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.9;
  color: var(--ink);
}

.chapter-workspace-preview p {
  margin: 0 0 1.15em;
}

.chapter-workspace-editor {
  width: 100%;
  min-height: 0;
  border: 0;
  resize: none;
  padding: 24px 28px;
  background: var(--surface-paper);
  color: var(--ink);
  font-family: var(--font-serif);
  font-size: 16px;
  line-height: 1.9;
}

.chapter-workspace-editor:focus {
  outline: none;
}

.chapter-workspace-empty {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-muted);
}

.chapter-workspace-save-state {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 18px;
  border-top: 1px solid var(--border-subtle);
}
```

- [ ] **Step 7: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/studio/ChapterWorkspace.jsx frontend/src/components/studio/chapterWorkspaceState.js frontend/src/components/studio/chapterWorkspaceState.test.ts frontend/src/index.css
git commit -m "feat: add chapter workspace preview edit mode"
```

---

### Task 5: Wire StudioShell Into App

**Files:**
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/components/studio/OutlineWorkspace.jsx`
- Create: `frontend/src/components/studio/PlotGraphWorkspace.jsx`

- [ ] **Step 1: Create outline wrapper**

Create `frontend/src/components/studio/OutlineWorkspace.jsx`:

```jsx
import { OutlineView } from '../OutlineView'

export function OutlineWorkspace(props) {
  return <OutlineView {...props} />
}
```

- [ ] **Step 2: Create plot wrapper**

Create `frontend/src/components/studio/PlotGraphWorkspace.jsx`:

```jsx
import { PlotGraphView } from '../PlotGraphView'

export function PlotGraphWorkspace(props) {
  return <PlotGraphView {...props} />
}
```

- [ ] **Step 3: Modify App imports**

Add these imports to `frontend/src/App.jsx`:

```jsx
import { StudioShell } from './components/studio/StudioShell'
import { ChapterWorkspace } from './components/studio/ChapterWorkspace'
import { OutlineWorkspace } from './components/studio/OutlineWorkspace'
import { PlotGraphWorkspace } from './components/studio/PlotGraphWorkspace'
```

- [ ] **Step 4: Track selected chapter separately from open tab**

In `App.jsx`, add state near `activeChapter`:

```jsx
const [workspaceChapter, setWorkspaceChapter] = useState(null)
```

In `handleSceneSelect`, when a chapter is selected, set it:

```jsx
setWorkspaceChapter(sceneInfo)
```

- [ ] **Step 5: Replace top-level return shell**

Keep the existing `renderEditor()` function for non-chat tabs, then add:

```jsx
const chatSurface = (
  <AuthorChatPanel
    currentBook={currentBook}
    addToast={addToast}
    onLoreUpdated={refreshData}
  />
)

const sidebarSurface = (
  <Sidebar
    activePanel={activePanel}
    addToast={addToast}
    onSelect={handleSceneSelect}
    onBookSelect={(book) => setCurrentBook(book)}
    onNewBook={() => setShowNewBook(true)}
    dataVersion={dataVersion}
  />
)

const statusbarSurface = (
  <footer className="statusbar">
    <div className="statusbar-section">
      <div className="statusbar-item"><span className="status-dot ok" /><span>{t('status.ready')}</span></div>
      <div className="statusbar-item"><Settings size={11} /><span>TS Backend</span></div>
    </div>
    <div className="statusbar-section">
      <div className="statusbar-item"><span>{t('status.model')}: {authorModel || t('status.demo')}</span></div>
    </div>
    <div className="statusbar-section">
      <div className="statusbar-item"><span>{t('status.scene')}: {workspaceChapter?.label || '--'}</span></div>
      <div className="statusbar-item" style={{ cursor: 'pointer' }} onClick={switchLang}>
        <Languages size={11} />
        <span>{lang === 'zh' ? '中文' : 'EN'}</span>
      </div>
    </div>
  </footer>
)
```

Then replace the main layout JSX with:

```jsx
<div data-theme={theme}>
  <StudioShell
    theme={theme}
    currentBook={currentBook}
    activePanel={activePanel}
    onActivityClick={handleActivityClick}
    sidebar={sidebarSurface}
    chat={chatSurface}
    chapter={
      <ChapterWorkspace
        bookId={currentBook?.book_id}
        chapter={workspaceChapter}
        dataVersion={dataVersion}
        addToast={addToast}
      />
    }
    outline={
      <OutlineWorkspace
        currentBook={currentBook}
        addToast={addToast}
        dataVersion={dataVersion}
        onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
      />
    }
    plot={
      <PlotGraphWorkspace
        currentBook={currentBook}
        addToast={addToast}
        dataVersion={dataVersion}
        onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
      />
    }
    statusbar={statusbarSurface}
  />
  {showNewBook && (
    <NewBookModal
      onClose={() => setShowNewBook(false)}
      onCreated={(book) => {
        setShowNewBook(false)
        setCurrentBook(book)
        setDataVersion(v => v + 1)
        handleActivityClick('brainstorm')
      }}
      addToast={addToast}
    />
  )}
  <ToastContainer toasts={toasts} onRemove={removeToast} />
</div>
```

Remove the old `ActivityBar`, `TabBar`, titlebar, main-area, and statusbar JSX from the active return. Leave imports only if still used.

- [ ] **Step 6: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS. If ESLint reports unused imports from the old shell, remove them.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/studio/OutlineWorkspace.jsx frontend/src/components/studio/PlotGraphWorkspace.jsx
git commit -m "feat: wire studio shell into app"
```

---

### Task 6: Slash Command Parser

**Files:**
- Create: `frontend/src/components/author-chat/slashCommands.js`
- Create: `frontend/src/components/author-chat/slashCommands.test.ts`
- Modify: `frontend/src/components/AuthorChatPanel.jsx`

- [ ] **Step 1: Write failing parser tests**

Create `frontend/src/components/author-chat/slashCommands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseSlashCommand } from './slashCommands'

describe('parseSlashCommand', () => {
  it('parses compact', () => {
    expect(parseSlashCommand('/compact')).toEqual({ type: 'compact' })
  })

  it('parses clear', () => {
    expect(parseSlashCommand('/clear')).toEqual({ type: 'clear' })
  })

  it('parses remember with text', () => {
    expect(parseSlashCommand('/remember keep this')).toEqual({ type: 'remember', text: 'keep this' })
  })

  it('returns null for normal messages', () => {
    expect(parseSlashCommand('write the next chapter')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend test -- slashCommands
```

Expected: FAIL because `slashCommands` does not exist.

- [ ] **Step 3: Implement parser**

Create `frontend/src/components/author-chat/slashCommands.js`:

```js
export function parseSlashCommand(input) {
  const text = String(input || '').trim()
  if (text === '/compact') return { type: 'compact' }
  if (text === '/clear') return { type: 'clear' }
  if (text.startsWith('/remember ')) {
    return { type: 'remember', text: text.slice('/remember '.length).trim() }
  }
  return null
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm --prefix frontend test -- slashCommands
```

Expected: PASS.

- [ ] **Step 5: Use parser in AuthorChatPanel**

In `frontend/src/components/AuthorChatPanel.jsx`, import:

```jsx
import { parseSlashCommand } from './author-chat/slashCommands'
```

In `handleSend`, replace the current `/remember` special case with:

```jsx
const slash = parseSlashCommand(baseInput)
if (slash?.type === 'remember') {
  if (!slash.text) return
  try {
    const r = await fetch('/api/v1/memory/remember', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: slash.text, scope: 'user', type: 'preference', tags: [] }),
    })
    if (r.ok) addToast?.('已记住', 'success')
    else addToast?.('保存失败', 'error')
  } catch (e) {
    addToast?.(e.message, 'error')
  }
  if (!fromOverride) updateInput('')
  return
}

if (slash?.type === 'compact') {
  await handleCompact()
  if (!fromOverride) updateInput('')
  return
}

if (slash?.type === 'clear') {
  await handleClear()
  if (!fromOverride) updateInput('')
  return
}
```

Add `handleCompact` near `handleClear`:

```jsx
const handleCompact = async () => {
  if (!bookId || loading) return
  try {
    const r = await fetch(`/api/v1/books/${bookId}/session/compact`, { method: 'POST' })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'compact failed')
    setMessages(prev => [...prev, {
      id: `manual_compact_${Date.now()}`,
      role: 'system_notice',
      content: `已手动压缩上下文：${data.compactedCount ?? 0} 条消息`,
    }])
    addToast?.('上下文已压缩', 'success')
  } catch (e) {
    addToast?.(`压缩失败：${e.message}`, 'error')
  }
}
```

- [ ] **Step 6: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/author-chat/slashCommands.js frontend/src/components/author-chat/slashCommands.test.ts frontend/src/components/AuthorChatPanel.jsx
git commit -m "feat: parse chat session slash commands"
```

---

### Task 7: Backend Session Compact And Clear Routes

**Files:**
- Create: `server/src/routes/session.ts`
- Create: `server/tests/session-routes.test.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Write route tests**

Create `server/tests/session-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import Fastify from 'fastify'
import { sessionRoutes } from '../src/routes/session.js'
import { saveHistory } from '../src/routes/chat-history.js'
import { appendRunEvent } from '../src/runs/run-timeline.js'

function makeDataDir() {
  return fs.mkdtempSync(path.join(tmpdir(), 'inkflow-session-'))
}

describe('session routes', () => {
  it('clears chat session without deleting book assets', async () => {
    const dataDir = makeDataDir()
    const bookId = 'book-one'
    const bookDir = path.join(dataDir, bookId)
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'draft', 'utf8')
    saveHistory(dataDir, bookId, [{ role: 'user', content: 'hello' } as any])
    appendRunEvent(dataDir, bookId, {
      runId: 'run_1',
      seq: 1,
      ts: new Date().toISOString(),
      type: 'run_start',
      status: 'running',
      label: 'start',
    })

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/books/${bookId}/session` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(fs.existsSync(path.join(bookDir, 'author_chat_history.json'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, 'author_chat_history.json'), 'utf8'))).toEqual([])
    expect(fs.existsSync(path.join(bookDir, 'runs'))).toBe(false)
    expect(fs.readFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'utf8')).toBe('draft')
  })

  it('returns compact unavailable when no history exists', async () => {
    const dataDir = makeDataDir()
    const bookId = 'book-one'
    fs.mkdirSync(path.join(dataDir, bookId), { recursive: true })

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'POST', url: `/api/v1/books/${bookId}/session/compact` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      compactedCount: 0,
      message: 'No history to compact',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix server test -- session-routes
```

Expected: FAIL because `sessionRoutes` does not exist.

- [ ] **Step 3: Implement session routes**

Create `server/src/routes/session.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { type FastifyInstance } from 'fastify'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { clearAuthorChatSession, loadAuthorChatConfig } from './author-chat-support.js'
import { loadHistoryFull, saveHistory } from './chat-history.js'
import { createSessionState } from '../context/session-state.js'
import { processContext } from '../context/decision.js'
import { getModelContextWindow } from '../context/model-window.js'

export interface SessionRoutesOptions {
  dataDir?: string
}

export async function sessionRoutes(app: FastifyInstance, opts: SessionRoutesOptions = {}): Promise<void> {
  const dataDir = () => opts.dataDir || process.env.AUTONOVEL_DATA_DIR || 'books'

  app.delete<{ Params: { bookId: string } }>('/books/:bookId/session', async (request, reply) => {
    try {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      clearAuthorChatSession(dataDir(), bookId)
      return { ok: true }
    } catch (err: any) {
      reply.code(400)
      return { error: err.message }
    }
  })

  app.post<{ Params: { bookId: string } }>('/books/:bookId/session/compact', async (request, reply) => {
    try {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const history = loadHistoryFull(dataDir(), bookId).filter((m: any) => !m.status)
      if (history.length === 0) return { ok: true, compactedCount: 0, message: 'No history to compact' }

      const { llmConfig } = loadAuthorChatConfig()
      const bookDir = path.join(dataDir(), bookId)
      const windowSize = getModelContextWindow(llmConfig.model)
      const processed = await processContext({
        messages: history,
        model: llmConfig.model,
        lastUsage: { total_tokens: windowSize },
        sessionState: createSessionState(),
        bookDir,
        llmConfig,
        mode: 'auto',
      })

      saveHistory(dataDir(), bookId, processed.newMessages)
      fs.appendFileSync(
        path.join(bookDir, 'context_log.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), manual: true, ...processed.decision }) + '\n',
        'utf8',
      )

      return {
        ok: true,
        compactedCount: processed.decision.compactedCount,
        decayedCount: processed.decision.decayedCount,
        tier: processed.decision.tier,
      }
    } catch (err: any) {
      reply.code(400)
      return { error: err.message }
    }
  })
}
```

- [ ] **Step 4: Register routes**

Modify `server/src/index.ts`:

```ts
import { sessionRoutes } from './routes/session.js'
```

After memory routes registration, add:

```ts
await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm --prefix server test -- session-routes
```

Expected: PASS.

- [ ] **Step 6: Run route-related tests**

Run:

```bash
npm --prefix server test -- author-chat-routes chat-history run-timeline
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/session.ts server/src/index.ts server/tests/session-routes.test.ts
git commit -m "feat: add agent session routes"
```

---

### Task 8: Message Checkpoint Metadata And Restore

**Files:**
- Modify: `server/src/snapshots/snapshots.ts`
- Modify: `server/src/routes/chat-history.ts`
- Modify: `server/src/runs/run-timeline.ts`
- Create: `server/src/routes/checkpoints.ts`
- Create: `server/tests/checkpoints.test.ts`
- Modify: `server/src/routes/author-chat.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Write checkpoint tests**

Create `server/tests/checkpoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import Fastify from 'fastify'
import { createSnapshot } from '../src/snapshots/snapshots.js'
import { checkpointRoutes } from '../src/routes/checkpoints.js'
import { saveHistory } from '../src/routes/chat-history.js'
import { appendRunEvent, loadRecentRuns } from '../src/runs/run-timeline.js'

function makeBook() {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'inkflow-checkpoints-'))
  const bookId = 'book-one'
  const draftDir = path.join(dataDir, bookId, '04_Drafts')
  fs.mkdirSync(draftDir, { recursive: true })
  fs.writeFileSync(path.join(draftDir, 'ch01.md'), 'before', 'utf8')
  return { dataDir, bookId, draftFile: path.join(draftDir, 'ch01.md') }
}

describe('checkpoint routes', () => {
  it('restores a checkpoint and truncates later history and runs', async () => {
    const { dataDir, bookId, draftFile } = makeBook()
    const checkpoint = createSnapshot(dataDir, bookId, 'first message', { messageId: 'm1' })
    fs.writeFileSync(draftFile, 'after', 'utf8')
    saveHistory(dataDir, bookId, [
      { role: 'user', content: 'first', id: 'm1', checkpoint_id: checkpoint.id } as any,
      { role: 'assistant', content: 'reply one' } as any,
      { role: 'user', content: 'second', id: 'm2' } as any,
    ])
    appendRunEvent(dataDir, bookId, {
      runId: 'run_later',
      seq: 1,
      ts: new Date().toISOString(),
      type: 'run_start',
      status: 'running',
      label: 'later',
    })

    const app = Fastify()
    await app.register(checkpointRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/books/${bookId}/checkpoints/${checkpoint.id}/restore`,
      payload: { message_id: 'm1', replacement_message: 'first edited' },
    })

    expect(response.statusCode).toBe(200)
    expect(fs.readFileSync(draftFile, 'utf8')).toBe('before')
    const history = JSON.parse(fs.readFileSync(path.join(dataDir, bookId, 'author_chat_history.json'), 'utf8'))
    expect(history).toEqual([{ role: 'user', content: 'first edited', id: 'm1', checkpoint_id: checkpoint.id }])
    expect(loadRecentRuns(dataDir, bookId)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix server test -- checkpoints
```

Expected: FAIL because `checkpointRoutes` and snapshot metadata overload do not exist.

- [ ] **Step 3: Extend snapshot metadata**

Modify `server/src/snapshots/snapshots.ts`:

```ts
export interface SnapshotMeta {
  id: string
  created_at: string
  label: string
  message_id?: string
}

export interface SnapshotOptions {
  messageId?: string
}
```

Change the function signature:

```ts
export function createSnapshot(dataDir: string, bookId: string, label: string, options: SnapshotOptions = {}): SnapshotMeta {
```

Change meta construction:

```ts
const meta: SnapshotMeta = {
  id,
  created_at: new Date().toISOString(),
  label: label.slice(0, 200),
  message_id: options.messageId,
}
```

- [ ] **Step 4: Add history truncation helper**

Modify `server/src/routes/chat-history.ts`:

```ts
export type ChatHistoryMessage = ModelMessage & {
  id?: string
  checkpoint_id?: string
  status?: string
}

export function createMessageId(date = new Date()): string {
  return `msg_${date.toISOString().replace(/[-:.]/g, '').replace('Z', '')}_${Math.random().toString(36).slice(2, 8)}`
}

export function truncateHistoryAtMessage(
  messages: ChatHistoryMessage[],
  messageId: string,
  replacementContent?: string,
): ChatHistoryMessage[] {
  const index = messages.findIndex((m) => m.id === messageId)
  if (index === -1) return messages
  return messages.slice(0, index + 1).map((message, i) => {
    if (i !== index || replacementContent === undefined) return message
    return { ...message, content: replacementContent }
  })
}
```

- [ ] **Step 5: Add run timeline truncation helper**

Modify `server/src/runs/run-timeline.ts`:

```ts
export function clearRunsAfterCheckpointRestore(dataDir: string, bookId: string): void {
  clearRunTimeline(dataDir, bookId)
}
```

This intentionally clears all recent run files after restore because run files do not yet carry checkpoint IDs.

- [ ] **Step 6: Implement checkpoint route**

Create `server/src/routes/checkpoints.ts`:

```ts
import { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import { restoreSnapshot } from '../snapshots/snapshots.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { loadHistoryFull, saveHistory, truncateHistoryAtMessage, type ChatHistoryMessage } from './chat-history.js'
import { clearRunsAfterCheckpointRestore } from '../runs/run-timeline.js'

const restoreBody = z.object({
  message_id: z.string().min(1),
  replacement_message: z.string().min(1).max(50000).optional(),
})

export interface CheckpointRoutesOptions {
  dataDir?: string
}

export async function checkpointRoutes(app: FastifyInstance, opts: CheckpointRoutesOptions = {}): Promise<void> {
  const dataDir = () => opts.dataDir || process.env.AUTONOVEL_DATA_DIR || 'books'

  app.post<{ Params: { bookId: string; checkpointId: string } }>(
    '/books/:bookId/checkpoints/:checkpointId/restore',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const checkpointId = sanitizePathSegment(request.params.checkpointId, 'checkpointId')
        const parsed = restoreBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map(i => i.message).join('; ') }
        }

        restoreSnapshot(dataDir(), bookId, checkpointId)
        const history = loadHistoryFull(dataDir(), bookId) as ChatHistoryMessage[]
        const truncated = truncateHistoryAtMessage(history, parsed.data.message_id, parsed.data.replacement_message)
        saveHistory(dataDir(), bookId, truncated)
        clearRunsAfterCheckpointRestore(dataDir(), bookId)

        return { ok: true, messages: truncated.length }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )
}
```

- [ ] **Step 7: Register checkpoint route**

Modify `server/src/index.ts`:

```ts
import { checkpointRoutes } from './routes/checkpoints.js'
```

Register:

```ts
await app.register(checkpointRoutes, { prefix: '/api/v1', dataDir })
```

- [ ] **Step 8: Store checkpoint metadata during chat send**

Modify `server/src/routes/author-chat.ts` imports:

```ts
import { createMessageId } from './chat-history.js'
```

Inside the send route, before `try`, create:

```ts
const userMessageId = createMessageId()
let checkpointId: string | undefined
```

Replace:

```ts
createSnapshot(dataDir, bookId, message)
```

with:

```ts
const snap = createSnapshot(dataDir, bookId, message, { messageId: userMessageId })
checkpointId = snap.id
```

In `persistAssistant`, replace the user message construction with:

```ts
const userMsg: ModelMessage & { id?: string; checkpoint_id?: string; status?: string } = {
  role: 'user',
  content: message,
  id: userMessageId,
  checkpoint_id: checkpointId,
}
```

- [ ] **Step 9: Run tests**

Run:

```bash
npm --prefix server test -- checkpoints snapshots chat-history run-timeline author-chat-routes
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/snapshots/snapshots.ts server/src/routes/chat-history.ts server/src/runs/run-timeline.ts server/src/routes/checkpoints.ts server/src/routes/author-chat.ts server/src/index.ts server/tests/checkpoints.test.ts
git commit -m "feat: add message checkpoint restore"
```

---

### Task 9: Frontend Message Actions For Checkpoints

**Files:**
- Create: `frontend/src/components/author-chat/checkpointActions.js`
- Create: `frontend/src/components/author-chat/checkpointActions.test.ts`
- Modify: `frontend/src/components/author-chat/MessageCards.jsx`
- Modify: `frontend/src/components/AuthorChatPanel.jsx`

- [ ] **Step 1: Write action helper tests**

Create `frontend/src/components/author-chat/checkpointActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildCheckpointRestoreRequest, canRestoreFromMessage } from './checkpointActions'

describe('checkpoint actions', () => {
  it('allows restore for user messages with checkpoint metadata', () => {
    expect(canRestoreFromMessage({ role: 'user', id: 'm1', checkpoint_id: 'snap_1' })).toBe(true)
    expect(canRestoreFromMessage({ role: 'assistant', id: 'm1', checkpoint_id: 'snap_1' })).toBe(false)
  })

  it('builds restore request', () => {
    expect(buildCheckpointRestoreRequest({ id: 'm1', checkpoint_id: 'snap_1' }, 'edited')).toEqual({
      checkpointId: 'snap_1',
      body: { message_id: 'm1', replacement_message: 'edited' },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend test -- checkpointActions
```

Expected: FAIL.

- [ ] **Step 3: Implement helper**

Create `frontend/src/components/author-chat/checkpointActions.js`:

```js
export function canRestoreFromMessage(message) {
  return message?.role === 'user' && Boolean(message.id) && Boolean(message.checkpoint_id)
}

export function buildCheckpointRestoreRequest(message, replacementMessage) {
  return {
    checkpointId: message.checkpoint_id,
    body: {
      message_id: message.id,
      ...(replacementMessage !== undefined ? { replacement_message: replacementMessage } : {}),
    },
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend test -- checkpointActions
```

Expected: PASS.

- [ ] **Step 5: Add user message actions**

Modify `MessageBubble` signature in `frontend/src/components/author-chat/MessageCards.jsx`:

```jsx
export function MessageBubble({ msg, onOptionSelect, optionsDisabled, onEditResend, onContinueFromHere }) {
```

After the user/assistant label block, add:

```jsx
{isUser && msg.checkpoint_id && (
  <div className="message-actions">
    <button type="button" onClick={() => onEditResend?.(msg)}>编辑并重发</button>
    <button type="button" onClick={() => onContinueFromHere?.(msg)}>从这里继续</button>
  </div>
)}
```

Add CSS to `frontend/src/index.css`:

```css
.message-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity 140ms ease, transform 140ms ease;
}

.message-actions button {
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--surface-glass);
  color: var(--ink-muted);
  font-size: 10px;
  padding: 2px 7px;
}

.message-actions button:hover {
  color: var(--accent);
  border-color: var(--accent);
}

div:hover > .message-actions {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 6: Wire actions in AuthorChatPanel**

Import helpers:

```jsx
import { buildCheckpointRestoreRequest } from './author-chat/checkpointActions'
```

Add state:

```jsx
const [editingCheckpoint, setEditingCheckpoint] = useState(null)
```

Add handler:

```jsx
const restoreCheckpoint = async (message, replacementMessage) => {
  if (!bookId) return
  const { checkpointId, body } = buildCheckpointRestoreRequest(message, replacementMessage)
  const response = await fetch(`/api/v1/books/${bookId}/checkpoints/${checkpointId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'restore failed')
  loadChatHistory()
  fetchRecentRuns()
  onLoreUpdated?.()
}

const handleEditResend = (message) => {
  setEditingCheckpoint(message)
  updateInput(message.content || '')
  inputRef.current?.focus()
}

const handleContinueFromHere = async (message) => {
  try {
    await restoreCheckpoint(message)
    addToast?.('已回到该消息处', 'success')
  } catch (e) {
    addToast?.(`恢复失败：${e.message}`, 'error')
  }
}
```

Before sending a normal message in `handleSend`, if `editingCheckpoint` exists:

```jsx
if (editingCheckpoint) {
  try {
    await restoreCheckpoint(editingCheckpoint, baseInput)
    setEditingCheckpoint(null)
  } catch (e) {
    addToast?.(`恢复失败：${e.message}`, 'error')
    return
  }
}
```

Pass handlers to every `MessageBubble` render:

```jsx
onEditResend={handleEditResend}
onContinueFromHere={handleContinueFromHere}
```

- [ ] **Step 7: Remove primary snapshot button**

In `AuthorChatPanel.jsx`, remove the header button that renders `<History size={12} /> 快照` and its dropdown. Keep the fetch/restore snapshot functions only if still used elsewhere; otherwise remove snapshot state in the same commit.

- [ ] **Step 8: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/author-chat/checkpointActions.js frontend/src/components/author-chat/checkpointActions.test.ts frontend/src/components/author-chat/MessageCards.jsx frontend/src/components/AuthorChatPanel.jsx frontend/src/index.css
git commit -m "feat: add checkpoint message actions"
```

---

### Task 10: Agent State Shimmer And Lifecycle Labels

**Files:**
- Modify: `frontend/src/components/author-chat/MessageCards.jsx`
- Modify: `frontend/src/components/AgentRunTimeline.jsx`
- Modify: `server/src/routes/author-chat.ts`

- [ ] **Step 1: Update ThinkingCard live label**

In `ThinkingCard`, replace the live suffix text:

```jsx
{live ? <span className="agent-shimmer">thinking</span> : '分析已完成'}
```

Use it in the existing button:

```jsx
执行分析已折叠 ({len} {t('authorChat.chars')}) · {live ? <span className="agent-shimmer">thinking</span> : 'done'}
```

Add `agent-breathe` to the expanded live panel:

```jsx
className={live ? 'agent-breathe' : undefined}
```

- [ ] **Step 2: Update StreamingToolCard live label**

In `StreamingToolCard`, when `segment.status === 'running'`, render:

```jsx
<span className="agent-shimmer">running tool</span>
```

next to the loader.

- [ ] **Step 3: Update AgentRunTimeline current event**

In `AgentRunTimeline.jsx`, where `event.status === 'running'`, wrap the label:

```jsx
<span className={event.status === 'running' ? 'agent-shimmer' : undefined}>{label}</span>
```

- [ ] **Step 4: Rename backend timeline labels**

In `server/src/routes/author-chat.ts`, replace labels:

```ts
timeline('run_start', '收到用户指令', 'running', { inputPreview: previewValue(message) })
timeline('snapshot_start', '创建发送前快照', 'running')
timeline('snapshot_done', '快照已创建', 'done')
timeline('history_load_start', '读取对话历史', 'running')
timeline('history_load_done', '对话历史已读取', 'done', { meta: { messages: rawHistory.length } })
timeline('context_start', '处理上下文预算', 'running', { meta: { contextMode, model: llmConfig.model } })
timeline('context_done', '上下文处理完成', 'done', { meta: { ... } })
timeline('agent_loop_start', '模型与工具链运行中', 'running')
timeline('stream_done', '模型主响应完成', 'done')
timeline('agent_loop_done', '模型与工具链完成', 'done')
timeline('run_done', '本轮运行完成', 'done')
```

with product labels:

```ts
timeline('run_start', '收到请求', 'running', { inputPreview: previewValue(message) })
timeline('checkpoint_start', '建立对话检查点', 'running')
timeline('checkpoint_done', '检查点已建立', 'done')
timeline('history_load_start', '读取会话', 'running')
timeline('history_load_done', '会话已读取', 'done', { meta: { messages: rawHistory.length } })
timeline('context_start', '准备上下文', 'running', { meta: { contextMode, model: llmConfig.model } })
timeline('context_done', '上下文已准备', 'done', { meta: { ... } })
timeline('agent_loop_start', 'thinking', 'running')
timeline('stream_done', '主响应完成', 'done')
timeline('agent_loop_done', '工具链完成', 'done')
timeline('run_done', '完成', 'done')
```

Keep event types compatible by only renaming snapshot events after checking `AgentRunTimeline.displayKey()`. If tests assume `snapshot_*`, update those tests in the same task.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm --prefix server test -- author-chat-routes run-timeline
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/author-chat/MessageCards.jsx frontend/src/components/AgentRunTimeline.jsx server/src/routes/author-chat.ts
git commit -m "feat: polish agent lifecycle states"
```

---

### Task 11: Tauri Mac Shell And Sidecar Scripts

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/binaries/.gitkeep`
- Create: `desktop-sidecar/index.js`
- Create: `scripts/build-tauri-sidecar.mjs`
- Modify: `package.json`
- Modify: `server/src/agent/prompt-builder.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install Tauri packages**

Run:

```bash
npm install --save-dev @tauri-apps/cli @yao-pkg/pkg
npm --prefix frontend install @tauri-apps/api @tauri-apps/plugin-shell
```

Expected: root `package-lock.json`, root `package.json`, `frontend/package.json`, and `frontend/package-lock.json` update.

- [ ] **Step 2: Add Tauri Cargo manifest**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "inkflow"
version = "1.0.1"
description = "InkFlow novel authoring studio"
authors = ["InkFlow"]
edition = "2021"

[lib]
name = "inkflow_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 3: Add Rust main**

Create `src-tauri/src/main.rs`:

```rust
use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::ShellExt;

#[tauri::command]
fn api_base_url() -> String {
    std::env::var("INKFLOW_API_BASE").unwrap_or_else(|_| "http://127.0.0.1:3001".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![api_base_url])
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir")
                .join("books");
            std::fs::create_dir_all(&data_dir).expect("create app data books dir");

            let mut sidecar = handle
                .shell()
                .sidecar("inkflow-server")
                .expect("server sidecar");
            sidecar = sidecar.env("AUTONOVEL_DATA_DIR", data_dir.to_string_lossy().to_string());
            sidecar = sidecar.env("INKFLOW_DESKTOP", "1");
            let (_rx, child) = sidecar.spawn().expect("spawn server sidecar");
            app.manage(std::sync::Mutex::new(Some(child)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Some(state) = window.try_state::<std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>>() {
                    if let Ok(mut child) = state.lock() {
                        if let Some(child) = child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Add Tauri config**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "InkFlow",
  "version": "1.0.1",
  "identifier": "studio.inkflow.app",
  "build": {
    "beforeDevCommand": "npm run dev:frontend",
    "devUrl": "http://127.0.0.1:5173",
    "beforeBuildCommand": "npm run build && node scripts/build-tauri-sidecar.mjs",
    "frontendDist": "../frontend/dist"
  },
  "app": {
    "windows": [
      {
        "title": "InkFlow",
        "width": 1320,
        "height": 860,
        "minWidth": 1040,
        "minHeight": 700,
        "hiddenTitle": true,
        "titleBarStyle": "Overlay"
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "externalBin": ["binaries/inkflow-server"],
    "macOS": {
      "minimumSystemVersion": "12.0",
      "dmg": {
        "windowSize": {
          "width": 660,
          "height": 400
        },
        "appPosition": {
          "x": 180,
          "y": 170
        },
        "applicationFolderPosition": {
          "x": 480,
          "y": 170
        }
      }
    }
  }
}
```

- [ ] **Step 5: Add shell capability**

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for InkFlow",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "binaries/inkflow-server",
          "sidecar": true,
          "args": true
        }
      ]
    }
  ]
}
```

- [ ] **Step 6: Add sidecar build script**

Create `desktop-sidecar/index.js`:

```js
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sidecarDir = path.dirname(fileURLToPath(import.meta.url))

process.env.INKFLOW_DESKTOP = '1'
process.env.INKFLOW_PROMPTS_DIR ||= path.join(sidecarDir, 'prompts')

await import(new URL('./server/dist/index.js', import.meta.url).href)
```

Create `scripts/build-tauri-sidecar.mjs`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const binDir = path.join(root, 'src-tauri', 'binaries')
const sidecarRoot = path.join(root, 'desktop-sidecar')
const sidecarServerDir = path.join(sidecarRoot, 'server')
const sidecarPromptsDir = path.join(sidecarRoot, 'prompts')
fs.mkdirSync(binDir, { recursive: true })

execFileSync('npm', ['--prefix', 'server', 'run', 'build'], { cwd: root, stdio: 'inherit' })

fs.rmSync(sidecarServerDir, { recursive: true, force: true })
fs.rmSync(sidecarPromptsDir, { recursive: true, force: true })
fs.mkdirSync(path.join(sidecarServerDir, 'dist'), { recursive: true })
fs.cpSync(path.join(root, 'server', 'dist'), path.join(sidecarServerDir, 'dist'), { recursive: true })
fs.cpSync(path.join(root, 'prompts'), sidecarPromptsDir, { recursive: true })

const targetTriple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  .split('\n')
  .find(line => line.startsWith('host: '))
  ?.slice('host: '.length)

if (!targetTriple) {
  throw new Error('Unable to determine Rust host triple')
}

const pkgTarget = process.platform === 'darwin' && process.arch === 'arm64'
  ? 'node22-macos-arm64'
  : process.platform === 'darwin'
    ? 'node22-macos-x64'
    : (() => { throw new Error(`Unsupported sidecar build platform: ${process.platform}/${process.arch}`) })()

const output = path.join(binDir, `inkflow-server-${targetTriple}`)
execFileSync('npx', [
  'pkg',
  path.join(sidecarRoot, 'index.js'),
  '--targets', pkgTarget,
  '--output', output,
  '--assets', path.join(sidecarRoot, 'server/dist/**/*'),
  '--assets', path.join(sidecarRoot, 'prompts/**/*'),
], { cwd: root, stdio: 'inherit' })

fs.chmodSync(output, 0o755)
console.log(`Prepared ${output}`)
```

- [ ] **Step 7: Let packaged server locate bundled prompts**

Modify `server/src/agent/prompt-builder.ts`:

```ts
const PROMPTS_DIR = process.env.INKFLOW_PROMPTS_DIR || path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts',
)
```

- [ ] **Step 8: Add package scripts**

Modify root `package.json` scripts:

```json
"tauri:dev": "tauri dev",
"tauri:build": "tauri build -- --bundles dmg",
"tauri:sidecar": "node scripts/build-tauri-sidecar.mjs"
```

- [ ] **Step 9: Update `.gitignore`**

Append:

```gitignore
/src-tauri/target/
/src-tauri/binaries/inkflow-server-*
/desktop-sidecar/server/
/desktop-sidecar/prompts/
```

Keep `src-tauri/binaries/.gitkeep` tracked.

- [ ] **Step 10: Build checks**

Run:

```bash
npm run build
npm run tauri:sidecar
```

Expected: frontend and server builds pass, and `src-tauri/binaries/inkflow-server-<target-triple>` exists.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json frontend/package.json frontend/package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/src/main.rs src-tauri/binaries/.gitkeep desktop-sidecar/index.js scripts/build-tauri-sidecar.mjs server/src/agent/prompt-builder.ts .gitignore
git commit -m "feat: add tauri mac shell"
```

---

### Task 12: API Base Helper For Browser And Tauri

**Files:**
- Create: `frontend/src/lib/apiBase.js`
- Modify: `frontend/src/components/AuthorChatPanel.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create API helper**

Create `frontend/src/lib/apiBase.js`:

```js
let cachedApiBase = ''

export async function getApiBase() {
  if (cachedApiBase) return cachedApiBase
  if (window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      cachedApiBase = await invoke('api_base_url')
      return cachedApiBase
    } catch {
      cachedApiBase = ''
      return cachedApiBase
    }
  }
  cachedApiBase = ''
  return cachedApiBase
}

export async function apiFetch(path, options) {
  const base = await getApiBase()
  return fetch(`${base}${path}`, options)
}
```

- [ ] **Step 2: Replace fetch calls incrementally in AuthorChatPanel**

Import:

```jsx
import { apiFetch } from '../lib/apiBase'
```

Replace fetch calls in `AuthorChatPanel.jsx` that target `/api/` with `apiFetch`. Example:

```jsx
fetch(`/api/v1/author-chat/${bookId}/history`)
```

becomes:

```jsx
apiFetch(`/api/v1/author-chat/${bookId}/history`)
```

Do this for all `/api/v1` and `/api` calls in the file.

- [ ] **Step 3: Replace settings fetch in App**

Import in `App.jsx`:

```jsx
import { apiFetch } from './lib/apiBase'
```

Replace:

```jsx
fetch('/api/v1/settings')
```

with:

```jsx
apiFetch('/api/v1/settings')
```

- [ ] **Step 4: Build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/apiBase.js frontend/src/components/AuthorChatPanel.jsx frontend/src/App.jsx
git commit -m "feat: add desktop aware api fetch"
```

---

### Task 13: End-To-End Verification

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run backend tests**

Run:

```bash
npm --prefix server test
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm --prefix frontend test
```

Expected: PASS.

- [ ] **Step 3: Run full build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Start dev servers**

Run:

```bash
npm --prefix server run dev
```

In another terminal:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Expected: backend listens on `http://127.0.0.1:3001`, frontend on `http://127.0.0.1:5173`.

- [ ] **Step 5: Browser smoke**

Open `http://127.0.0.1:5173` and verify:

```text
1. App shows Editorial Glass shell.
2. Right workspace pane is visible.
3. Collapse button hides workspace pane.
4. Expanding restores previous width.
5. Dragging divider changes width.
6. Workspace tabs switch between 章节, 大纲, 剧情图.
7. Selecting a chapter updates the 章节 tab.
8. Editing and saving chapter content works.
9. /clear clears chat history and does not delete chapter draft.
10. /compact emits a visible status or clear error.
11. User message action menu appears for messages with checkpoint_id.
```

- [ ] **Step 6: Tauri dev smoke**

Run:

```bash
npm run tauri:dev
```

Expected: native macOS window opens, frontend loads, and API calls reach the sidecar or dev backend.

- [ ] **Step 7: Tauri DMG build**

Run:

```bash
npm run tauri:build
```

Expected: Tauri creates an app bundle and `.dmg` under `src-tauri/target/release/bundle/`.

- [ ] **Step 8: Commit verification fixes**

If any fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: stabilize codex-like studio slice"
```

If no fixes were needed, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: The tasks cover Editorial Glass/Tailwind, split workspace, chapter preview/edit, workspace tabs, checkpoint recovery, `/compact`, `/clear`, Agent shimmer states, Tauri shell, and verification.
- Scope control: Windows `.exe`, full editorial UI rewrite, and Rust backend rewrite remain excluded.
- Type consistency: checkpoint fields are consistently named `id` and `checkpoint_id` in chat messages; API body uses `message_id` and `replacement_message`.
- Known implementation risk: the Tauri sidecar binary may need asset-list adjustment after the first local `tauri build` because packaging dynamic Node server assets is platform-sensitive. The plan keeps that work isolated to Task 11 and verification.
