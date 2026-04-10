# Frontend-Backend Unification — Implementation Plan (Slice 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the React frontend to the TypeScript backend by pruning unused panels, implementing books/settings CRUD routes, and switching the proxy target.

**Architecture:** Register all TS routes under `/api/v1/` to match existing frontend paths. Books route manages directory-based book storage. Settings route reads/writes a JSON config file. Frontend deletes 9 unused panels and simplifies App.jsx to 6 panels.

**Tech Stack:** Fastify 5, Vitest 4, React 19, Vite 8, Zod 4, Node fs/path

**Spec:** `docs/superpowers/specs/2026-04-10-frontend-backend-unification-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/src/routes/books.ts` | 5 endpoints: list, get, create, delete, explorer |
| `server/src/routes/settings.ts` | 2 endpoints: get, put |
| `server/tests/books.test.ts` | Books CRUD + directory init tests |
| `server/tests/settings.test.ts` | Settings get/put tests |

### Modified Files
| File | Change |
|------|--------|
| `server/src/index.ts` | Register books + settings routes |
| `server/src/routes/author-chat.ts` | Prefix routes: `/api/` → `/api/v1/` |
| `frontend/vite.config.js` | Proxy target: `:9864` → `:3001` |
| `frontend/src/App.jsx` | Remove 9 panel imports/renders, add dataVersion linkage |
| `frontend/src/components/ActivityBar.jsx` | Reduce to 6 icons |

### Deleted Files
| File | Reason |
|------|--------|
| `frontend/src/components/GroupChatPanel.jsx` | Removed panel |
| `frontend/src/components/EmotionPanel.jsx` | Removed panel |
| `frontend/src/components/TaskBoardPanel.jsx` | Removed panel |
| `frontend/src/components/InboxPanel.jsx` | Removed panel |
| `frontend/src/components/DirectorConsole.jsx` | Removed panel |
| `frontend/src/components/CharactersPanel.jsx` | Removed panel |
| `frontend/src/components/ReviewPanel.jsx` | Removed panel |
| `frontend/src/components/IcebergPanel.jsx` | Removed panel |
| `frontend/src/components/WelcomePanel.jsx` | Removed panel |

---

## Task 1: Books Route — CRUD Endpoints

**Files:**
- Create: `server/src/routes/books.ts`
- Test: `server/tests/books.test.ts`

- [ ] **Step 1: Write failing tests for books route**

Create `server/tests/books.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { booksRoutes } from '../src/routes/books.js'

const TEST_DATA_DIR = path.join(__dirname, '__test_books__')

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true })
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('Books Route — CRUD', () => {
  it('should list empty books initially', async () => {
    const { listBooks } = await setupBooksRoute()
    const books = await listBooks()
    expect(books).toEqual([])
  })

  it('should create a book with directory structure', async () => {
    const { createBook, listBooks } = await setupBooksRoute()
    const book = await createBook({
      book_id: 'test_novel',
      title: 'Test Novel',
      genre: 'xianxia',
      tone: 'dark_revenge',
      target_words: 500000,
    })
    expect(book.book_id).toBe('test_novel')
    expect(book.title).toBe('Test Novel')

    // Verify directory structure created
    const bookDir = path.join(TEST_DATA_DIR, 'test_novel')
    expect(fs.existsSync(path.join(bookDir, '00_Config'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '01_Global_Settings'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '02_Outlines'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, 'memory'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '00_Config', 'book_meta.json'))).toBe(true)

    // Verify meta content
    const meta = JSON.parse(fs.readFileSync(path.join(bookDir, '00_Config', 'book_meta.json'), 'utf-8'))
    expect(meta.title).toBe('Test Novel')
    expect(meta.genre).toBe('xianxia')
  })

  it('should get a single book', async () => {
    const { createBook, getBook } = await setupBooksRoute()
    await createBook({ book_id: 'b1', title: 'Book 1', genre: 'fantasy', tone: 'hot_blood', target_words: 300000 })
    const book = await getBook('b1')
    expect(book.title).toBe('Book 1')
    expect(book.genre).toBe('fantasy')
  })

  it('should delete a book', async () => {
    const { createBook, deleteBook, listBooks } = await setupBooksRoute()
    await createBook({ book_id: 'b1', title: 'Book 1', genre: 'fantasy', tone: 'hot_blood', target_words: 300000 })
    await deleteBook('b1')
    const books = await listBooks()
    expect(books).toEqual([])
    expect(fs.existsSync(path.join(TEST_DATA_DIR, 'b1'))).toBe(false)
  })

  it('should return explorer tree', async () => {
    const { createBook, getExplorer } = await setupBooksRoute()
    await createBook({ book_id: 'novel_a', title: 'Novel A', genre: 'xianxia', tone: 'dark_revenge', target_words: 500000 })
    await createBook({ book_id: 'novel_b', title: 'Novel B', genre: 'fantasy', tone: 'hot_blood', target_words: 300000 })
    const tree = await getExplorer()
    expect(tree.length).toBe(2)
    expect(tree[0].type).toBe('book')
    expect(tree[0].label).toBe('Novel A')
  })

  it('should reject duplicate book_id', async () => {
    const { createBook } = await setupBooksRoute()
    await createBook({ book_id: 'b1', title: 'Book 1', genre: 'fantasy', tone: 'hot_blood', target_words: 300000 })
    await expect(createBook({ book_id: 'b1', title: 'Dup', genre: 'fantasy', tone: 'hot_blood', target_words: 300000 }))
      .rejects.toThrow(/already exists/)
  })
})

// Helper to call route functions directly (no HTTP layer)
async function setupBooksRoute() {
  const mod = await import('../src/routes/books.js')
  const dataDir = TEST_DATA_DIR
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return {
    listBooks: () => mod.listBooks(dataDir),
    createBook: (body: any) => mod.createBook(dataDir, body),
    getBook: (id: string) => mod.getBook(dataDir, id),
    deleteBook: (id: string) => mod.deleteBook(dataDir, id),
    getExplorer: () => mod.getExplorer(dataDir),
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/books.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement books route**

Create `server/src/routes/books.ts`:

```typescript
/**
 * Books CRUD Route — manages book directory structure.
 * Each book is a directory under AUTONOVEL_DATA_DIR.
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'

export interface BookMeta {
  book_id: string
  title: string
  genre: string
  tone: string
  target_words: number
  created_at?: string
}

export interface TreeNode {
  id: string
  label: string
  type: 'book' | 'volume' | 'chapter' | 'scene'
  icon?: string
  children?: TreeNode[]
  status?: string
  summary?: string
}

const BOOK_DIRS = ['00_Config', '01_Global_Settings', '02_Outlines', 'memory']

// ── Exported functions for direct testing ──

export function listBooks(dataDir: string): BookMeta[] {
  if (!fs.existsSync(dataDir)) return []
  return fs.readdirSync(dataDir)
    .filter(name => {
      const p = path.join(dataDir, name)
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '00_Config', 'book_meta.json'))
    })
    .map(bookId => {
      const metaPath = path.join(dataDir, bookId, '00_Config', 'book_meta.json')
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BookMeta
      } catch {
        return null
      }
    })
    .filter((m): m is BookMeta => m !== null)
}

export function createBook(dataDir: string, body: {
  book_id: string
  title: string
  genre: string
  tone: string
  target_words: number
}): BookMeta {
  const bookDir = path.join(dataDir, body.book_id)
  if (fs.existsSync(bookDir)) {
    throw new Error(`Book '${body.book_id}' already exists`)
  }
  fs.mkdirSync(bookDir, { recursive: true })
  for (const sub of BOOK_DIRS) {
    fs.mkdirSync(path.join(bookDir, sub), { recursive: true })
  }
  const meta: BookMeta = {
    book_id: body.book_id,
    title: body.title,
    genre: body.genre,
    tone: body.tone,
    target_words: body.target_words,
    created_at: new Date().toISOString(),
  }
  fs.writeFileSync(
    path.join(bookDir, '00_Config', 'book_meta.json'),
    JSON.stringify(meta, null, 2),
    'utf-8',
  )
  return meta
}

export function getBook(dataDir: string, bookId: string): BookMeta {
  const metaPath = path.join(dataDir, bookId, '00_Config', 'book_meta.json')
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Book '${bookId}' not found`)
  }
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BookMeta
}

export function deleteBook(dataDir: string, bookId: string): void {
  const bookDir = path.join(dataDir, bookId)
  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book '${bookId}' not found`)
  }
  fs.rmSync(bookDir, { recursive: true })
}

export function getExplorer(dataDir: string): TreeNode[] {
  return listBooks(dataDir).map(book => {
    const bookDir = path.join(dataDir, book.book_id)
    const children: TreeNode[] = []

    // Scan outlines for chapters
    const outlinePath = path.join(bookDir, '02_Outlines', 'outline.json')
    if (fs.existsSync(outlinePath)) {
      try {
        const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf-8'))
        if (outline.children) {
          for (const vol of outline.children) {
            children.push(scanOutlineNode(vol))
          }
        }
      } catch { /* ignore parse errors */ }
    }

    return {
      id: book.book_id,
      label: book.title,
      type: 'book',
      children,
    }
  })
}

function scanOutlineNode(node: any): TreeNode {
  return {
    id: node.id || String(Math.random()),
    label: node.label || '',
    type: node.type || 'scene',
    status: node.status,
    summary: node.summary,
    children: node.children?.map(scanOutlineNode),
  }
}

// ── Fastify route registration ──

export async function booksRoutes(app: FastifyInstance) {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  app.get('/api/v1/books', async () => listBooks(dataDir()))

  app.get<{ Params: { bookId: string } }>('/api/v1/books/:bookId', async (request) => {
    return getBook(dataDir(), request.params.bookId)
  })

  app.post('/api/v1/books', async (request) => {
    return createBook(dataDir(), request.body as any)
  })

  app.delete<{ Params: { bookId: string } }>('/api/v1/books/:bookId', async (request) => {
    deleteBook(dataDir(), request.params.bookId)
    return { status: 'ok' }
  })

  app.get('/api/v1/books/explorer', async () => getExplorer(dataDir()))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/books.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd server
git add src/routes/books.ts tests/books.test.ts
git commit -m "feat(ts): add books CRUD route with directory-based storage (5 endpoints)"
```

---

## Task 2: Settings Route

**Files:**
- Create: `server/src/routes/settings.ts`
- Test: `server/tests/settings.test.ts`

- [ ] **Step 1: Write failing tests for settings route**

Create `server/tests/settings.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const TEST_DATA_DIR = path.join(__dirname, '__test_settings__')

function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true })
}

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('Settings Route', () => {
  it('should return defaults when no settings file exists', async () => {
    const { getSettings } = await setupSettings()
    const settings = getSettings()
    expect(settings.providers).toEqual([])
    expect(settings.authorModel).toBe('')
    expect(settings.editorModel).toBe('')
    expect(settings.readerModel).toBe('')
  })

  it('should save and load settings', async () => {
    const { getSettings, saveSettings } = await setupSettings()
    const updated = {
      providers: [{ id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test-key', models: ['deepseek-chat'] }],
      authorModel: 'deepseek/deepseek-chat',
      editorModel: 'deepseek/deepseek-chat',
      readerModel: 'deepseek/deepseek-chat',
    }
    saveSettings(updated)
    const loaded = getSettings()
    expect(loaded.authorModel).toBe('deepseek/deepseek-chat')
  })

  it('should mask API keys in get response', async () => {
    const { getSettings, saveSettings } = await setupSettings()
    saveSettings({
      providers: [{ id: 'test', name: 'Test', baseUrl: 'https://api.test.com', apiKey: 'sk-secret-key-12345', models: ['model-1'] }],
      authorModel: '',
      editorModel: '',
      readerModel: '',
    })
    const loaded = getSettings()
    const provider = loaded.providers[0]
    expect(provider.apiKey).toBe('sk-sec...2345')
    expect(provider.apiKey).not.toBe('sk-secret-key-12345')
  })
})

async function setupSettings() {
  const mod = await import('../src/routes/settings.js')
  const dataDir = TEST_DATA_DIR
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return {
    getSettings: () => mod.getSettings(dataDir),
    saveSettings: (s: any) => mod.saveSettings(dataDir, s),
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/settings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement settings route**

Create `server/src/routes/settings.ts`:

```typescript
/**
 * Settings Route — reads/writes application settings.
 * API keys are masked in GET responses.
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface AppSettings {
  providers: ProviderConfig[]
  authorModel: string
  editorModel: string
  readerModel: string
}

const DEFAULTS: AppSettings = {
  providers: [],
  authorModel: '',
  editorModel: '',
  readerModel: '',
}

function settingsPath(dataDir: string): string {
  return path.join(dataDir, 'settings.json')
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****'
  return key.slice(0, 5) + '...' + key.slice(-4)
}

export function getSettings(dataDir: string): AppSettings {
  const p = settingsPath(dataDir)
  if (!fs.existsSync(p)) return { ...DEFAULTS }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    // Mask API keys before returning
    if (raw.providers) {
      raw.providers = raw.providers.map((prov: ProviderConfig) => ({
        ...prov,
        apiKey: maskApiKey(prov.apiKey),
      }))
    }
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(dataDir: string, settings: AppSettings): void {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(settingsPath(dataDir), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function settingsRoutes(app: FastifyInstance) {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  app.get('/api/v1/settings', async () => {
    return getSettings(dataDir())
  })

  app.put('/api/v1/settings', async (request) => {
    saveSettings(dataDir(), request.body as AppSettings)
    return { status: 'ok' }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/settings.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd server
git add src/routes/settings.ts tests/settings.test.ts
git commit -m "feat(ts): add settings route with API key masking (2 endpoints)"
```

---

## Task 3: Register Routes + Fix API Prefix

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/author-chat.ts`

- [ ] **Step 1: Update author-chat.ts route prefix**

The existing routes use `/api/author-chat/...` but frontend calls `/api/v1/author-chat/...`. Change the prefix in `server/src/routes/author-chat.ts`.

Replace all three route paths:
- `/api/author-chat/:bookId/history` → `/api/v1/author-chat/:bookId/history`
- `/api/author-chat/:bookId/history` (DELETE) → `/api/v1/author-chat/:bookId/history`
- `/api/author-chat/:bookId/send` → `/api/v1/author-chat/:bookId/send`

- [ ] **Step 2: Update server/src/index.ts to register new routes**

```typescript
/**
 * AutoNovel-Studio TypeScript Backend — Entry Point
 */
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { authorChatRoutes } from './routes/author-chat.js'
import { booksRoutes } from './routes/books.js'
import { settingsRoutes } from './routes/settings.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(booksRoutes)
await app.register(settingsRoutes)
await app.register(authorChatRoutes)

app.get('/health', async () => ({ status: 'ok', engine: 'autonovel-ts' }))

const start = async () => {
  await app.listen({ port: 3001, host: '0.0.0.0' })
  console.log('AutoNovel TS backend running on :3001')
}
start()
```

- [ ] **Step 3: Run all tests**

Run: `cd server && npm test`
Expected: All 66 tests pass (57 existing + 6 books + 3 settings)

- [ ] **Step 4: Commit**

```bash
cd server
git add src/index.ts src/routes/author-chat.ts
git commit -m "feat(ts): register books + settings routes, fix API prefix to /api/v1/"
```

---

## Task 4: Switch Frontend Proxy + Prune Panels

**Files:**
- Modify: `frontend/vite.config.js`
- Delete: 9 panel files
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ActivityBar.jsx`

- [ ] **Step 1: Switch proxy target**

In `frontend/vite.config.js`, change target from `http://localhost:9864` to `http://localhost:3001`.

- [ ] **Step 2: Delete 9 unused panel files**

```bash
cd frontend/src/components
rm -f GroupChatPanel.jsx EmotionPanel.jsx TaskBoardPanel.jsx InboxPanel.jsx
rm -f DirectorConsole.jsx CharactersPanel.jsx ReviewPanel.jsx IcebergPanel.jsx
rm -f WelcomePanel.jsx
```

- [ ] **Step 3: Rewrite ActivityBar.jsx**

Replace `frontend/src/components/ActivityBar.jsx` with 6 icons:

```jsx
import { FolderOpen, Lightbulb, PenTool, ListTree, BookOpen, Settings } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

const items = [
  { id: 'explorer', icon: FolderOpen, labelKey: 'nav.explorer' },
  { id: 'brainstorm', icon: Lightbulb, labelKey: 'nav.brainstorm' },
  { id: 'author-chat', icon: PenTool, labelKey: 'nav.authorChat' },
  { id: 'outline', icon: ListTree, labelKey: 'nav.outline' },
  { id: 'chapter', icon: BookOpen, labelKey: 'nav.chapter' },
]

export function ActivityBar({ active, onClick }) {
  const { t } = useI18n()
  return (
    <nav className="activity-bar">
      <div className="activity-bar-top">
        {items.map(it => (
          <button key={it.id} className={`ab-item ${active === it.id ? 'active' : ''}`} onClick={() => onClick(it.id)} title={t(it.labelKey)}>
            <it.icon />
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        <button className={`ab-item ${active === 'settings' ? 'active' : ''}`} onClick={() => onClick('settings')} title={t('nav.settings')}>
          <Settings />
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Clean BrainstormPanel's TaskBoardPanel dependency**

BrainstormPanel.jsx imports TaskBoardPanel and AuthorChatPanel. Remove the TaskBoardPanel import and the task tab — keep only AuthorChatPanel in the left pane.

In `frontend/src/components/BrainstormPanel.jsx`:
- Remove import: `{ TaskBoardPanel }` from `'./TaskBoardPanel.jsx'`
- Remove `leftTab` state variable and the tab switcher UI (the two buttons for "对话" and "任务看板")
- Remove the conditional rendering — always show AuthorChatPanel
- The left pane should just directly render `<AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={fetchLore} />`

- [ ] **Step 5: Rewrite App.jsx**

Replace `frontend/src/App.jsx`. Key changes: remove deleted panel imports, import AuthorChatPanel, simplify renderEditor, add dataVersion linkage, simplify handleActivityClick:

```jsx
import { useState, useCallback } from 'react'
import { Moon, Sun, Settings, BookOpen, Languages } from 'lucide-react'
import { useI18n } from './i18n/index.jsx'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { BrainstormPanel } from './components/BrainstormPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { OutlineTreeEditor } from './components/OutlineTreeEditor'
import { ChapterEditor } from './components/ChapterEditor'
import { AuthorChatPanel } from './components/AuthorChatPanel'
import { NewBookModal } from './components/NewBookModal'
import { ToastContainer, useToast } from './components/Toast'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t, lang, switchLang } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activePanel, setActivePanel] = useState('explorer')
  const [tabs, setTabs] = useState([{ id: 'brainstorm', label: 'tab.brainstorm' }])
  const [activeTab, setActiveTab] = useState('brainstorm')
  const [currentBook, setCurrentBook] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
  const [showNewBook, setShowNewBook] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const { toasts, addToast, removeToast } = useToast()

  const refreshData = useCallback(() => setDataVersion(v => v + 1), [])

  const openTab = useCallback((id, labelKey) => {
    setTabs(prev => { if (prev.find(t => t.id === id)) return prev; return [...prev, { id, label: labelKey }]; });
    setActiveTab(id);
  }, [])

  const closeTab = useCallback((id) => {
    setTabs(prev => prev.filter(t => t.id !== id));
    setActiveTab(prev => prev === id ? 'brainstorm' : prev);
  }, [])

  const handleActivityClick = useCallback((panel) => {
    setActivePanel(panel);
    const tabMap = {
      brainstorm: ['brainstorm', 'tab.brainstorm'],
      'author-chat': ['author-chat', 'tab.authorChat'],
      outline: ['outline', 'tab.outline'],
      settings: ['settings', 'tab.settings'],
    };
    if (tabMap[panel]) openTab(tabMap[panel][0], tabMap[panel][1]);
  }, [openTab])

  const handleSceneSelect = useCallback((sceneInfo) => {
    if (sceneInfo.type === 'chapter') {
      const tabId = `chapter-${sceneInfo.id}`
      openTab(tabId, sceneInfo.label)
      setActiveTab(tabId)
      setActiveChapter(sceneInfo)
      return
    }
    if (sceneInfo.type === 'volume') {
      openTab('outline', 'tab.outline')
      setActiveTab('outline')
      return
    }
  }, [openTab])

  const renderEditor = () => {
    switch (activeTab) {
      case 'brainstorm': return <BrainstormPanel addToast={addToast} currentBook={currentBook} />;
      case 'author-chat': return <AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={refreshData} />;
      case 'outline': return <OutlineTreeEditor addToast={addToast} currentBook={currentBook} dataVersion={dataVersion} />;
      case 'settings': return <SettingsPanel addToast={addToast} theme={theme} toggleTheme={toggleTheme} />;
      default:
        if (activeTab.startsWith('chapter-') && activeChapter) {
          return <ChapterEditor bookId={currentBook?.book_id} chapterId={activeChapter.id} chapterLabel={activeChapter.label} addToast={addToast} dataVersion={dataVersion} />;
        }
        return <BrainstormPanel addToast={addToast} currentBook={currentBook} />;
    }
  }

  return (
    <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`} data-theme={theme}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <BookOpen size={16} />
          <span>{t('app.brand')}</span>
          <span style={{ opacity: 0.4, fontSize: 10 }}>{t('app.version')}</span>
        </div>
        <div className="titlebar-actions">
          <button className="btn-icon" onClick={switchLang} title={t('settings.language')}>
            <Languages size={15} />
          </button>
          <button className="btn-icon" onClick={toggleTheme} title={t('settings.theme')}>
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button className="btn-icon" onClick={() => handleActivityClick('settings')} title={t('nav.settings')}>
            <Settings size={15} />
          </button>
        </div>
      </header>

      <ActivityBar active={activePanel} onClick={handleActivityClick} />
      <Sidebar activePanel={activePanel} addToast={addToast} onSelect={handleSceneSelect} onBookSelect={(book) => setCurrentBook(book)} onNewBook={() => setShowNewBook(true)} />

      <main className="main-area">
        <div className="editor-section">
          <TabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} onClose={closeTab} />
          <div className="editor-content anim-fade" key={activeTab}>
            {renderEditor()}
          </div>
        </div>
      </main>

      <footer className="statusbar">
        <div className="statusbar-section">
          <div className="statusbar-item"><span className="status-dot ok" /><span>{t('status.ready')}</span></div>
          <div className="statusbar-item"><Settings size={11} /><span>TS Backend</span></div>
        </div>
        <div className="statusbar-section">
          <div className="statusbar-item"><span>{t('status.words')}: --</span></div>
          <div className="statusbar-item" style={{ cursor: 'pointer' }} onClick={switchLang}>
            <Languages size={11} />
            <span>{lang === 'zh' ? '中文' : 'EN'}</span>
          </div>
        </div>
      </footer>

      {showNewBook && (
        <NewBookModal
          onClose={() => setShowNewBook(false)}
          onCreated={(book) => {
            setShowNewBook(false)
            setCurrentBook(book)
            refreshData()
            handleActivityClick('brainstorm')
          }}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
```

- [ ] **Step 6: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no import errors

- [ ] **Step 7: Clean up any i18n references to deleted panels**

Search `frontend/src/i18n/` for references to deleted panels. Add any missing translation keys (e.g., `nav.authorChat`, `tab.authorChat`). Only add keys that are referenced in the new code.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: prune frontend to 6 panels, switch proxy to TS backend :3001"
```

---

## Task 5: Fix SettingsPanel Import Bug

**Files:**
- Modify: `frontend/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Fix missing useEffect import**

SettingsPanel uses `useEffect` but only imports `useState`. Add `useEffect` to the import:

```jsx
import { useState, useEffect } from 'react'
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SettingsPanel.jsx
git commit -m "fix: add missing useEffect import in SettingsPanel"
```

---

## Task 6: Full Integration Smoke Test

- [ ] **Step 1: Start TS backend**

Run: `cd server && npm run dev`
Expected: "AutoNovel TS backend running on :3001"

- [ ] **Step 2: In another terminal, start frontend**

Run: `cd frontend && npm run dev`
Expected: Vite on :5173, proxying to :3001

- [ ] **Step 3: Verify API connectivity**

Run: `curl http://localhost:3001/api/v1/books`
Expected: `[]`

Run: `curl http://localhost:3001/health`
Expected: `{"status":"ok","engine":"autonovel-ts"}`

- [ ] **Step 4: Run all server tests**

Run: `cd server && npm test`
Expected: All tests pass

---

## Subsequent Slices (Outline Only)

Slice 1 is the foundation. After it's complete, detailed plans will be written for:

### Slice 2: Core Authoring — AuthorChat + Brainstorm SSE
- Rewrite BrainstormPanel to reuse author-chat SSE endpoint (add `mode: 'brainstorm'` to request)
- Add brainstorm prompt section to prompt-builder.ts
- Wire `onDataChanged` callback for cross-panel refresh
- Add data read endpoints (outline, lore, plot-tree) to `server/src/routes/data.ts`

### Slice 3: Outline + Plot Tree
- OutlineTreeEditor connects to data endpoints
- Add dual-mode toggle: outline editor + plot tree viewer
- Panel auto-refresh when Agent saves outline

### Slice 4: Chapter Editor + Unified Review
- Rewrite editorial pipeline to 4-dimension unified review
- Create 4 new review templates (anti_ai, consistency, pacing, structure)
- ChapterEditor displays review results with score bars
- Data endpoints for chapters list + chapter detail
