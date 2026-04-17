# Outline View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSON tree editor with a literary "project document" long-flow view — book synopsis → volume summaries → chapter rows — with inline editing, drag/keyboard reorder, and optional cascade-renumbering.

**Architecture:** Backend changes are minimal (extend `save_outline` Zod validation for new optional fields `epigraph` / `synopsis`; add one renumber endpoint). Frontend is the bulk — new `OutlineView.jsx` renders book/volume/chapter sections using design-system typography (drop cap, roman numerals, hairline); uses `@dnd-kit` for drag reorder; inline editing via a reusable `EditableField`. Chapter status derived on-the-fly from existing draft + chapter_status files.

**Tech Stack:** TypeScript + Fastify + Zod (backend); React 19 + @dnd-kit (frontend); depends on `design-system` plan tokens/components.

Spec reference: `docs/superpowers/specs/2026-04-18-outline-view.md`

**Testing approach:** Backend gets vitest coverage for schema + renumber logic (file ops critical for safety). Frontend components smoke-tested in browser.

---

## Phase A · Backend

## Task 1: Extend outline schema with optional epigraph + synopsis

**Files:**
- Modify: `server/src/tools/write-tools.ts` — extend `validateOutlineNode` + tool description
- Modify: `server/tests/write-tools.test.ts` (or equivalent) — add tests; if no existing file, create `server/tests/outline-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/outline-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { saveOutlineTool } from '../src/tools/write-tools.js'

describe('save_outline with epigraph + synopsis', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outl-'))
  const ctx = { dataDir: tmpDir, bookId: 'book1', mode: 'write' as const }
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })

  it('accepts book.epigraph + book.synopsis + volume.synopsis', async () => {
    const outline = {
      id: 'book1', type: 'book', label: '雨夜来信',
      epigraph: '记忆是…',
      synopsis: '这是一个关于…的故事',
      children: [
        {
          id: 'vol1', type: 'volume', label: '雨夜',
          synopsis: '林舟回乡',
          children: [
            { id: 'ch01', type: 'chapter', label: '雨夜', summary: '...' },
          ],
        },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Outline saved/)
    const saved = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'book1', '02_Outlines', 'outline.json'), 'utf8'))
    expect(saved.epigraph).toBe('记忆是…')
    expect(saved.synopsis).toContain('这是一个')
    expect(saved.children[0].synopsis).toBe('林舟回乡')
  })

  it('accepts outline without new fields (backward-compat)', async () => {
    const outline = {
      id: 'book1', type: 'book', label: 'X',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch01', type: 'chapter', label: 'c', summary: 's' },
        ] },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Outline saved/)
  })

  it('rejects epigraph on volume node (only book gets epigraph)', async () => {
    const outline = {
      id: 'book1', type: 'book', label: 'X',
      children: [
        { id: 'vol1', type: 'volume', label: 'v',
          epigraph: 'bad — epigraph only on book',
          children: [] },
      ],
    }
    const result = await saveOutlineTool.execute(
      { outline_json: JSON.stringify(outline) },
      ctx as any,
    )
    expect(result).toMatch(/Error|schema/i)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/outline-schema.test.ts
```

Expected: first 2 tests fail (fields stripped / rejected by current validator), third may pass or fail depending on current validator's strictness.

- [ ] **Step 3: Extend `validateOutlineNode` in `server/src/tools/write-tools.ts`**

Locate the `validateOutlineNode` function. Add field allow-list logic per type:

```ts
function validateOutlineNode(node: any, where: string): string | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return `${where}: must be an object`
  }
  if (typeof node.type !== 'string' || !VALID_OUTLINE_TYPES.has(node.type)) {
    return `${where}: missing or invalid 'type'`
  }
  if (where === 'root' && node.type !== 'book') {
    return `root: type must be 'book'`
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    return `${where}: missing 'id'`
  }
  if (node.type === 'chapter' && !/^ch\d{1,4}$/i.test(node.id)) {
    return `${where} (chapter): id must be 'ch{N}'`
  }

  // New optional fields — enforce correct node-type scoping
  if (node.epigraph !== undefined) {
    if (node.type !== 'book') {
      return `${where}: 'epigraph' only allowed on book type, got ${node.type}`
    }
    if (typeof node.epigraph !== 'string') {
      return `${where}: 'epigraph' must be a string`
    }
  }
  if (node.synopsis !== undefined) {
    if (node.type !== 'book' && node.type !== 'volume') {
      return `${where}: 'synopsis' only allowed on book or volume, got ${node.type}`
    }
    if (typeof node.synopsis !== 'string') {
      return `${where}: 'synopsis' must be a string`
    }
  }
  if (node.summary !== undefined && typeof node.summary !== 'string') {
    return `${where}: 'summary' must be a string`
  }

  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) return `${where}: 'children' must be array`
    for (let i = 0; i < node.children.length; i++) {
      const childErr = validateOutlineNode(node.children[i], `${where}.children[${i}]`)
      if (childErr) return childErr
    }
  }
  return null
}
```

- [ ] **Step 4: Update the tool description to mention the new fields**

In `saveOutlineTool.description`, append:

```
可选字段：book 节点 epigraph（题词）与 synopsis（全书梗概）；volume 节点 synopsis（卷梗概）；chapter 节点 summary（章摘要）。
```

- [ ] **Step 5: Run tests — pass**

```bash
cd server && npx vitest run tests/outline-schema.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 6: Run full existing test suite to catch regressions**

```bash
cd server && npm test
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/tools/write-tools.ts server/tests/outline-schema.test.ts
git commit -m "feat(tools): save_outline accepts epigraph + synopsis fields"
```

---

## Task 2: Renumber endpoint with cascade rename

**Files:**
- Create: `server/src/services/outline-renumber.ts`
- Create: `server/src/routes/outline.ts` (new route file; or add to existing data.ts)
- Create: `server/tests/outline-renumber.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/outline-renumber.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { renumberChapters } from '../src/services/outline-renumber.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ren-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(path.join(bookDir, '02_Outlines'), { recursive: true })
  fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('renumberChapters', () => {
  it('no changes when outline order matches existing ids', async () => {
    fs.writeFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), JSON.stringify({
      id: 'book1', type: 'book', label: 'b',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch01', type: 'chapter', label: 'c1' },
          { id: 'ch02', type: 'chapter', label: 'c2' },
        ]},
      ],
    }))
    const result = await renumberChapters(bookDir)
    expect(result.renamed).toEqual([])
  })

  it('renames ch05→ch01 when outline has only one chapter and its id is ch05', async () => {
    fs.writeFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), JSON.stringify({
      id: 'book1', type: 'book', label: 'b',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch05', type: 'chapter', label: 'first' },
        ]},
      ],
    }))
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch05.md'), 'content of five')
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'review_ch05.json'), '{}')

    const result = await renumberChapters(bookDir)
    expect(result.renamed).toContainEqual({ from: 'ch05', to: 'ch01' })

    expect(fs.existsSync(path.join(bookDir, '04_Drafts', 'ch01.md'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '04_Drafts', 'ch05.md'))).toBe(false)
    expect(fs.existsSync(path.join(bookDir, '04_Drafts', 'review_ch01.json'))).toBe(true)

    const outline = JSON.parse(fs.readFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), 'utf8'))
    expect(outline.children[0].children[0].id).toBe('ch01')
  })

  it('updates plot_graph.json references to match new ids', async () => {
    fs.writeFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), JSON.stringify({
      id: 'book1', type: 'book', label: 'b',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch05', type: 'chapter', label: 'first' },
        ]},
      ],
    }))
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch05.md'), 'x')
    fs.writeFileSync(path.join(bookDir, 'plot_graph.json'), JSON.stringify({
      book_id: 'book1', version: 2, nodes: {
        evt_1: { id: 'evt_1', type: 'event', title: 't', description: '', references: ['ch05'], characters: [], status: 'draft', created_at: '2026' },
      }, edges: [],
    }))
    await renumberChapters(bookDir)
    const pg = JSON.parse(fs.readFileSync(path.join(bookDir, 'plot_graph.json'), 'utf8'))
    expect(pg.nodes.evt_1.references).toEqual(['ch01'])
  })

  it('aborts dry-run on naming conflict and makes no writes', async () => {
    // Outline requires both ch02 (old ch01) and ch01 (old ch02) — direct swap impossible without temp
    // The implementation should use two-phase with temp prefix; test that outcome is safe
    fs.writeFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), JSON.stringify({
      id: 'book1', type: 'book', label: 'b',
      children: [
        { id: 'vol1', type: 'volume', label: 'v', children: [
          { id: 'ch02', type: 'chapter', label: 'was second' },
          { id: 'ch01', type: 'chapter', label: 'was first' },
        ]},
      ],
    }))
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'A')
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch02.md'), 'B')

    await renumberChapters(bookDir)

    const chA = fs.readFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'utf8')
    const chB = fs.readFileSync(path.join(bookDir, '04_Drafts', 'ch02.md'), 'utf8')
    // The renumbering puts the first-in-outline at ch01: it was originally ch02 → "B"
    expect(chA).toBe('B')
    expect(chB).toBe('A')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/outline-renumber.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement renumberChapters service**

Create `server/src/services/outline-renumber.ts`:

```ts
import fs from 'fs'
import path from 'path'
import { safeReadJson, writeJson } from '../utils/file-io.js'
import { createBackup, appendAuditLog } from '../tools/safety.js'

interface RenameOp { from: string; to: string }
export interface RenumberResult {
  renamed: RenameOp[]
  skipped: string[]
}

function walkChapters(node: any, acc: any[] = []): any[] {
  if (!node) return acc
  if (node.type === 'chapter') acc.push(node)
  if (Array.isArray(node.children)) for (const c of node.children) walkChapters(c, acc)
  return acc
}

const RELATED_FILES = (chId: string): string[] => [
  `04_Drafts/${chId}.md`,
  `04_Drafts/review_${chId}.json`,
  `04_Drafts/chapter_status_${chId}.json`,
  `04_Drafts/annotations_${chId}.json`,
]
const RELATED_DIRS = (chId: string): string[] => [
  `.draft_history/${chId}`,
]

export async function renumberChapters(bookDir: string): Promise<RenumberResult> {
  const outlineFile = path.join(bookDir, '02_Outlines', 'outline.json')
  const outline = safeReadJson<any>(outlineFile)
  if (!outline) return { renamed: [], skipped: [] }

  const chapters = walkChapters(outline)
  const mapping: Record<string, string> = {}
  chapters.forEach((node, idx) => {
    const newId = 'ch' + String(idx + 1).padStart(2, '0')
    if (node.id !== newId) mapping[node.id] = newId
  })

  const renamed: RenameOp[] = []
  const skipped: string[] = []

  if (Object.keys(mapping).length === 0) return { renamed, skipped }

  // Two-phase rename: move all sources to a temp prefix first to avoid collisions
  const tmpPrefix = '__renum_' + Date.now().toString(36) + '_'

  // Phase 1: old → tmp
  for (const [oldId, newId] of Object.entries(mapping)) {
    for (const rel of RELATED_FILES(oldId)) {
      const src = path.join(bookDir, rel)
      if (fs.existsSync(src)) {
        const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
        createBackup(src)
        fs.renameSync(src, tmp)
      }
    }
    for (const rel of RELATED_DIRS(oldId)) {
      const src = path.join(bookDir, rel)
      if (fs.existsSync(src)) {
        const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
        fs.renameSync(src, tmp)
      }
    }
  }

  // Phase 2: tmp → new
  for (const [oldId, newId] of Object.entries(mapping)) {
    for (const rel of RELATED_FILES(oldId)) {
      const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
      const dst = path.join(bookDir, rel.replace(oldId, newId))
      if (fs.existsSync(tmp)) fs.renameSync(tmp, dst)
    }
    for (const rel of RELATED_DIRS(oldId)) {
      const tmp = path.join(bookDir, rel.replace(oldId, tmpPrefix + newId))
      const dst = path.join(bookDir, rel.replace(oldId, newId))
      if (fs.existsSync(tmp)) fs.renameSync(tmp, dst)
    }
    renamed.push({ from: oldId, to: newId })
  }

  // Update outline node ids
  chapters.forEach((node, idx) => {
    const newId = 'ch' + String(idx + 1).padStart(2, '0')
    if (mapping[node.id]) node.id = newId
  })
  createBackup(outlineFile)
  writeJson(outlineFile, outline)

  // Update plot_graph.json references
  const plotGraphFile = path.join(bookDir, 'plot_graph.json')
  const pg = safeReadJson<any>(plotGraphFile)
  if (pg && pg.nodes) {
    let changed = false
    for (const node of Object.values<any>(pg.nodes)) {
      if (Array.isArray(node.references)) {
        const updated = node.references.map((r: string) => mapping[r] ?? r)
        if (updated.some((r: string, i: number) => r !== node.references[i])) {
          node.references = updated
          changed = true
        }
      }
    }
    if (changed) {
      createBackup(plotGraphFile)
      writeJson(plotGraphFile, pg)
    }
  }

  appendAuditLog(
    path.join(bookDir, 'audit_log.jsonl'),
    'renumber_chapters', {}, JSON.stringify({ mapping }), true,
  )

  return { renamed, skipped }
}
```

- [ ] **Step 4: Create the HTTP route**

Create `server/src/routes/outline.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import { sanitizePathParam } from '../utils/path-sanitizer.js'
import { renumberChapters } from '../services/outline-renumber.js'

interface OutlineOptions { dataDir: string }

export const outlineRoutes: FastifyPluginAsync<OutlineOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.post('/books/:bookId/outline/renumber', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    try {
      const result = await renumberChapters(bookDir)
      return reply.send(result)
    } catch (e) {
      return reply.code(500).send({ error: String(e) })
    }
  })
}
```

- [ ] **Step 5: Register plugin in `server/src/index.ts`**

Add alongside other route registrations:

```ts
import { outlineRoutes } from './routes/outline.js'
// ...
await app.register(outlineRoutes, { prefix: '/api/v1', dataDir })
```

- [ ] **Step 6: Run tests — pass**

```bash
cd server && npx vitest run tests/outline-renumber.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/outline-renumber.ts \
  server/src/routes/outline.ts \
  server/src/index.ts \
  server/tests/outline-renumber.test.ts
git commit -m "feat(server): outline renumber endpoint with cascade rename"
```

---

## Phase B · Frontend

## Task 3: Install @dnd-kit dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

```bash
cd frontend && npm install @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3
```

- [ ] **Step 2: Quick import probe**

Create temporary `frontend/src/utils/dndkit-probe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
describe('dnd-kit imports resolve', () => {
  it('loads core', async () => {
    const core = await import('@dnd-kit/core')
    expect(core.DndContext).toBeDefined()
  })
  it('loads sortable', async () => {
    const s = await import('@dnd-kit/sortable')
    expect(s.useSortable).toBeDefined()
  })
})
```

Run: `cd frontend && npx vitest run src/utils/dndkit-probe.test.ts`

Expected: 2 tests pass.

- [ ] **Step 3: Delete probe**

```bash
rm frontend/src/utils/dndkit-probe.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add @dnd-kit for outline reorder"
```

---

## Task 4: `OutlineView.jsx` shell — read-only document flow

**Files:**
- Create: `frontend/src/components/OutlineView.jsx`
- Modify: `frontend/src/App.jsx` — route `'outline'` tab to the new component

- [ ] **Step 1: Create shell**

Create `frontend/src/components/OutlineView.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, FileText, RefreshCw } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

function useDerivedChapterStatus(bookId, chId) {
  const [status, setStatus] = useState('-')  // '-' | 'Draft' | 'Done'
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const [stR, chR] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chId}/status`).then(r => r.json()).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chId}`).then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return
        if (stR?.user_decision === 'approved') setStatus('Done')
        else if (chR?.content && chR.content.length > 0) setStatus('Draft')
        else setStatus('-')
      } catch {
        if (!cancelled) setStatus('-')
      }
    }
    check()
    return () => { cancelled = true }
  }, [bookId, chId])
  return status
}

function ChapterRow({ bookId, chNode, index, onClick }) {
  const status = useDerivedChapterStatus(bookId, chNode.id)
  const statusClass = status === 'Done' ? 'done' : status === 'Draft' ? 'draft' : ''
  return (
    <div className="chapter-row" onClick={() => onClick?.(chNode)}>
      <div className="chapter-num label-sc">{toRoman(index + 1)}.</div>
      <div className="chapter-body">
        <div className="chapter-title">{chNode.label}</div>
        {chNode.summary && <div className="chapter-summary">{chNode.summary}</div>}
      </div>
      <div className={`chapter-status label-sc ${statusClass}`}>{status}</div>
    </div>
  )
}

export function OutlineView({ currentBook, addToast, onChapterOpen, dataVersion }) {
  const { t } = useI18n()
  const [outline, setOutline] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentBook) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/v1/books/${currentBook.book_id}/outline`)
      .then(r => r.json())
      .then(setOutline)
      .finally(() => setLoading(false))
  }, [currentBook, dataVersion])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader size={20} className="anim-spin" /></div>
  if (!currentBook) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>未选择书籍</div>
  if (!outline) return <div style={{ padding: 40 }}>大纲为空</div>

  // Detect free-form (no children array) → fallback notice
  const hasStructure = Array.isArray(outline.children) && outline.children.length > 0

  return (
    <div className="outline-view">
      {/* Top bar */}
      <div className="outline-topbar">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>— Outline —</div>
        <div className="outline-actions">
          <button className="btn btn-sm" title="整理章节编号"><RefreshCw size={12} /></button>
          <button className="btn btn-sm" title="导出 .md"><FileText size={12} /></button>
        </div>
      </div>

      {/* Main doc flow */}
      <div className="outline-doc">
        {hasStructure ? (
          <>
            <h1 className="display-hero">{outline.label || '（未命名）'}</h1>
            {outline.epigraph && <div className="epigraph">{outline.epigraph}</div>}
            {outline.synopsis && <p className="drop-cap book-synopsis">{outline.synopsis}</p>}

            {outline.children.map((vol, volIdx) => (
              <section key={vol.id} className="outline-volume">
                <div className="vol-head">
                  <span className="vol-num label-sc">Vol. {toRoman(volIdx + 1)}</span>
                  <span className="vol-title display-heading">{vol.label}</span>
                </div>
                {vol.synopsis && <p className="vol-synopsis">{vol.synopsis}</p>}
                {(vol.children || []).map((ch, chIdx) => (
                  <ChapterRow
                    key={ch.id}
                    bookId={currentBook.book_id}
                    chNode={ch}
                    index={chIdx}
                    onClick={(node) => onChapterOpen?.(node)}
                  />
                ))}
              </section>
            ))}
          </>
        ) : (
          <FreeformFallback data={outline} />
        )}
      </div>
    </div>
  )
}

function FreeformFallback({ data }) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ background: 'var(--accent-soft)', padding: 10, marginBottom: 16, fontSize: 11 }}>
        ⚠ 大纲是 free-form JSON，非标准章节树。新视图不支持编辑，请用 Agent 重新生成规范 outline。
      </div>
      <pre style={{ fontSize: 11, background: 'var(--bg-subtle)', padding: 10, overflow: 'auto' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}
```

- [ ] **Step 2: Add outline-view CSS**

Append to `frontend/src/App.css`:

```css
.outline-view {
  height: 100%; overflow-y: auto;
  background: var(--bg);
  padding: 0;
}
.outline-topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 28px; border-bottom: 1px solid var(--border-strong);
  background: var(--bg-elevated);
}
.outline-doc { padding: 28px 36px; max-width: 900px; margin: 0 auto; }
.outline-doc .display-hero { margin-bottom: 4px; }
.outline-doc .book-synopsis { margin-bottom: 24px; text-indent: 2em; }
.outline-volume { margin-top: 20px; }
.vol-head {
  display: flex; align-items: baseline; gap: 12px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-strong);
  margin-bottom: 8px;
}
.vol-num { color: var(--accent); }
.vol-synopsis {
  font-family: var(--font-body); font-size: var(--fs-small);
  text-indent: 2em; color: var(--ink-secondary); margin: 0 0 10px;
}
.chapter-row {
  display: grid; grid-template-columns: 50px 1fr auto;
  gap: 10px; padding: 8px 0; align-items: baseline;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.chapter-row:hover { background: var(--accent-soft); }
.chapter-num { color: var(--accent); }
.chapter-body .chapter-title { font-family: var(--font-display); font-size: 13px; }
.chapter-body .chapter-summary { font-size: 10px; color: var(--ink-secondary); line-height: 1.55; margin-top: 2px; }
.chapter-status { color: var(--ink-secondary); }
.chapter-status.draft { color: var(--warning); }
.chapter-status.done { color: var(--success); }
```

- [ ] **Step 3: Replace OutlineTreeEditor in App.jsx**

```jsx
import { OutlineView } from './components/OutlineView'

// in renderEditor():
case 'outline':
  return <OutlineView
    currentBook={currentBook}
    addToast={addToast}
    dataVersion={dataVersion}
    onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
  />
```

Remove the old OutlineTreeEditor import.

- [ ] **Step 4: Smoke test**

Dev server. Open the Outline tab.
- If current book has standard outline.json tree: see book title (Fraunces 34px), maybe epigraph, drop-cap synopsis, volumes with Vol. I / Vol. II roman headers, chapter rows with roman numerals + status labels
- If outline has no epigraph/synopsis yet (legacy), those sections just don't render — that's fine for Phase A (editing comes in Task 5+)
- Click any chapter row → opens the Chapter Workbench tab

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OutlineView.jsx frontend/src/App.css frontend/src/App.jsx
git commit -m "feat(frontend): OutlineView read-only document shell"
```

---

## Task 5: `EditableField` — reusable inline editor

**Files:**
- Create: `frontend/src/components/outline/EditableField.jsx`
- Modify: `frontend/src/components/OutlineView.jsx` — wrap editable spots

- [ ] **Step 1: Create EditableField**

Create `frontend/src/components/outline/EditableField.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'

export function EditableField({
  value,
  onSave,
  placeholder,
  multiline = false,
  className = '',
  style = {},
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      // Select all for single-line; place cursor at end for multiline
      if (!multiline && ref.current.select) ref.current.select()
    }
  }, [editing, multiline])

  const finish = () => {
    setEditing(false)
    if (draft !== value) onSave?.(draft)
  }
  const cancel = () => {
    setEditing(false)
    setDraft(value ?? '')
  }

  const isEmpty = !value || value.trim() === ''

  if (!editing) {
    return (
      <span
        className={`editable-display ${className} ${isEmpty ? 'empty' : ''}`}
        style={style}
        onClick={() => setEditing(true)}
        title="点击编辑"
      >
        {isEmpty ? (placeholder ?? '— 点此添加 —') : value}
      </span>
    )
  }

  const Tag = multiline ? 'textarea' : 'input'
  const onKey = (e) => {
    if (multiline) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish()
      if (e.key === 'Escape') cancel()
    } else {
      if (e.key === 'Enter') finish()
      if (e.key === 'Escape') cancel()
    }
  }

  return (
    <Tag
      ref={ref}
      className={`editable-input ${className}`}
      style={style}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={onKey}
      placeholder={placeholder}
      rows={multiline ? Math.max(3, (draft.match(/\n/g)?.length ?? 0) + 2) : undefined}
    />
  )
}
```

Add CSS to App.css:

```css
.editable-display {
  cursor: text;
  border-bottom: 1px dashed transparent;
  transition: border-color 100ms;
}
.editable-display:hover { border-bottom-color: var(--border-subtle); }
.editable-display.empty {
  color: var(--ink-muted);
  font-style: italic;
}
.editable-input {
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  padding: 4px 6px;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  font-style: inherit;
  font-weight: inherit;
  width: 100%;
  box-sizing: border-box;
}
textarea.editable-input { resize: vertical; font-family: var(--font-body); }
```

- [ ] **Step 2: Wire editable fields into OutlineView**

In OutlineView, replace display-only elements with EditableField:

```jsx
import { EditableField } from './outline/EditableField'

// Save helper
const saveOutline = useCallback(async (updated) => {
  setOutline(updated)
  await fetch(`/api/v1/books/${currentBook.book_id}/outline`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updated),
  })
}, [currentBook])

const patchBook = (patch) => saveOutline({ ...outline, ...patch })
const patchVolume = (volIdx, patch) => {
  const next = { ...outline, children: [...outline.children] }
  next.children[volIdx] = { ...next.children[volIdx], ...patch }
  saveOutline(next)
}
const patchChapter = (volIdx, chIdx, patch) => {
  const next = { ...outline, children: [...outline.children] }
  const vol = { ...next.children[volIdx], children: [...next.children[volIdx].children] }
  vol.children[chIdx] = { ...vol.children[chIdx], ...patch }
  next.children[volIdx] = vol
  saveOutline(next)
}
```

Replace the book title rendering:
```jsx
<h1 className="display-hero">
  <EditableField value={outline.label} onSave={(v) => patchBook({ label: v })} placeholder="（未命名）" />
</h1>
<div className="epigraph">
  <EditableField value={outline.epigraph} onSave={(v) => patchBook({ epigraph: v })} placeholder="— 点此添加题词 —" />
</div>
<p className="drop-cap book-synopsis">
  <EditableField multiline value={outline.synopsis} onSave={(v) => patchBook({ synopsis: v })} placeholder="— 点此添加全书梗概 —" />
</p>
```

Volume:
```jsx
<span className="vol-title display-heading">
  <EditableField value={vol.label} onSave={(v) => patchVolume(volIdx, { label: v })} />
</span>
// ...
<p className="vol-synopsis">
  <EditableField multiline value={vol.synopsis} onSave={(v) => patchVolume(volIdx, { synopsis: v })} placeholder="— 点此添加卷梗概 —" />
</p>
```

Chapter row label and summary (but NOT the row click — stop propagation on EditableField):
```jsx
<div className="chapter-body" onClick={e => e.stopPropagation()}>
  <div className="chapter-title">
    <EditableField value={ch.label} onSave={(v) => patchChapter(volIdx, chIdx, { label: v })} />
  </div>
  <div className="chapter-summary">
    <EditableField multiline value={ch.summary} onSave={(v) => patchChapter(volIdx, chIdx, { summary: v })} placeholder="— 点此添加章摘要 —" />
  </div>
</div>
```

And the row click should open the chapter only if the click target is NOT inside `.chapter-body` — easier: split the row into a header click area + body non-click area, OR add a small "→" arrow on the right:

```jsx
<div className="chapter-row">
  <div className="chapter-num label-sc">{toRoman(chIdx + 1)}.</div>
  <div className="chapter-body" onClick={e => e.stopPropagation()}>
    ...
  </div>
  <div className={`chapter-status label-sc ${statusClass}`}
       onClick={() => onChapterOpen?.(ch)}
       style={{ cursor: 'pointer' }}>
    {status} ↗
  </div>
</div>
```

(The "→" or "↗" makes the navigation affordance explicit.)

- [ ] **Step 3: Smoke test inline editing**

Dev server. Open Outline tab. Click book title → becomes input → edit → Enter → saves + reflects. Same for epigraph, synopsis, volume label, volume synopsis, chapter label, chapter summary. Click a chapter's status/arrow → opens workbench. Click body content doesn't navigate.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/outline/EditableField.jsx \
  frontend/src/components/OutlineView.jsx \
  frontend/src/App.css
git commit -m "feat(outline): inline editing via EditableField"
```

---

## Task 6: Drag reorder (chapters within + across volumes)

**Files:**
- Modify: `frontend/src/components/OutlineView.jsx` — add DndContext + SortableContext + drag handles

- [ ] **Step 1: Add reorder-mode toggle state**

In OutlineView:

```jsx
const [reorderMode, setReorderMode] = useState(false)
// Top bar button:
<button className={`btn btn-sm ${reorderMode ? 'on' : ''}`} onClick={() => setReorderMode(!reorderMode)}>
  重排模式
</button>
```

- [ ] **Step 2: Wrap chapter rows with dnd-kit Sortable**

Import and use:

```jsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
```

Create a `SortableChapterRow` component inside OutlineView:

```jsx
function SortableChapterRow({ ch, index, volIdx, chIdx, reorderMode, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: ch.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div ref={setNodeRef} style={style} className="chapter-row">
      {reorderMode && (
        <div {...attributes} {...listeners} style={{ cursor: 'grab' }}>
          <GripVertical size={12} opacity={0.5} />
        </div>
      )}
      <div className="chapter-num label-sc">{/* roman index */}</div>
      {/* ... rest of row ... */}
    </div>
  )
}
```

Wrap volume's chapter list:

```jsx
<DndContext
  sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
>
  <SortableContext items={allChapterIds} strategy={verticalListSortingStrategy}>
    {outline.children.map((vol, volIdx) => (
      <section key={vol.id} className="outline-volume">
        {/* ... volume head ... */}
        {vol.children.map((ch, chIdx) => (
          <SortableChapterRow ... />
        ))}
      </section>
    ))}
  </SortableContext>
</DndContext>
```

Where `allChapterIds` is a flat array of all chapter IDs across all volumes.

`handleDragEnd` handles cross-volume moves:

```jsx
const handleDragEnd = (event) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  // Find source and target coordinates
  const src = locateChapter(outline, active.id)
  const tgt = locateChapter(outline, over.id)
  if (!src || !tgt) return
  const next = { ...outline, children: outline.children.map(v => ({ ...v, children: [...(v.children ?? [])] })) }
  const [moved] = next.children[src.volIdx].children.splice(src.chIdx, 1)
  next.children[tgt.volIdx].children.splice(tgt.chIdx, 0, moved)
  saveOutline(next)
}

function locateChapter(outline, chId) {
  for (let v = 0; v < outline.children.length; v++) {
    const idx = (outline.children[v].children ?? []).findIndex(c => c.id === chId)
    if (idx !== -1) return { volIdx: v, chIdx: idx }
  }
  return null
}
```

- [ ] **Step 3: Smoke test**

Toggle reorder mode. Drag a chapter up/down. Drag across volumes. Verify outline.json updates correctly (check `02_Outlines/outline.json` after each drag).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OutlineView.jsx
git commit -m "feat(outline): drag-to-reorder chapters via @dnd-kit"
```

---

## Task 7: Keyboard reorder (Alt+↑/↓ + Alt+Shift+←/→)

**Files:**
- Modify: `frontend/src/components/OutlineView.jsx` — focus management + keyboard handlers

- [ ] **Step 1: Add keyDown handler to chapter row**

Each chapter row should be focusable (tabIndex=0). Add to SortableChapterRow:

```jsx
<div
  ref={setNodeRef}
  style={style}
  className="chapter-row"
  tabIndex={0}
  onKeyDown={(e) => handleChapterKey(e, volIdx, chIdx)}
>
```

- [ ] **Step 2: Implement `handleChapterKey`**

```jsx
const handleChapterKey = (e, volIdx, chIdx) => {
  if (!e.altKey) return
  e.preventDefault()

  const next = { ...outline, children: outline.children.map(v => ({ ...v, children: [...(v.children ?? [])] })) }
  const currentVol = next.children[volIdx]
  const currentCh = currentVol.children[chIdx]

  if (e.shiftKey && e.key === 'ArrowRight') {
    // Move to next volume (end of its list)
    if (volIdx + 1 >= next.children.length) return
    currentVol.children.splice(chIdx, 1)
    next.children[volIdx + 1].children.push(currentCh)
    saveOutline(next)
    return
  }
  if (e.shiftKey && e.key === 'ArrowLeft') {
    if (volIdx === 0) return
    currentVol.children.splice(chIdx, 1)
    next.children[volIdx - 1].children.push(currentCh)
    saveOutline(next)
    return
  }
  if (e.key === 'ArrowUp') {
    if (chIdx === 0) return
    const arr = currentVol.children
    ;[arr[chIdx - 1], arr[chIdx]] = [arr[chIdx], arr[chIdx - 1]]
    saveOutline(next)
    return
  }
  if (e.key === 'ArrowDown') {
    const arr = currentVol.children
    if (chIdx + 1 >= arr.length) return
    ;[arr[chIdx + 1], arr[chIdx]] = [arr[chIdx], arr[chIdx + 1]]
    saveOutline(next)
    return
  }
}
```

- [ ] **Step 3: Smoke test**

Click a chapter row to focus it (or tab into it). Press Alt+↓ → moves down. Alt+↑ → up. Alt+Shift+→ → jumps to next volume. Verify outline.json updates.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OutlineView.jsx
git commit -m "feat(outline): keyboard reorder (Alt+↑/↓ + Alt+Shift+←/→)"
```

---

## Task 8: `RenumberConfirmModal` + integration

**Files:**
- Create: `frontend/src/components/outline/RenumberConfirmModal.jsx`
- Modify: `frontend/src/components/OutlineView.jsx` — wire renumber button

- [ ] **Step 1: Create modal**

Create `frontend/src/components/outline/RenumberConfirmModal.jsx`:

```jsx
export function RenumberConfirmModal({ open, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="display-heading">整理章节编号？</h3>
        <p className="epigraph">
          此操作会按 outline 顺序把章节 ID 重编为 ch01 / ch02 / ...
          并同步重命名：.md 草稿 / review / chapter_status / annotations / .draft_history。
          同时 plot_graph 的 references 会跟着变。
        </p>
        <p className="epigraph" style={{ color: 'var(--accent)' }}>
          不可撤销（但会备份 .bak）。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>确认整理</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire in OutlineView**

```jsx
import { RenumberConfirmModal } from './outline/RenumberConfirmModal'

const [renumberOpen, setRenumberOpen] = useState(false)

// Top bar button:
<button className="btn btn-sm" onClick={() => setRenumberOpen(true)} title="整理章节编号">
  <RefreshCw size={12} /> 整理编号
</button>

// Near end:
<RenumberConfirmModal
  open={renumberOpen}
  onCancel={() => setRenumberOpen(false)}
  onConfirm={async () => {
    try {
      const r = await fetch(`/api/v1/books/${currentBook.book_id}/outline/renumber`, { method: 'POST' })
      const data = await r.json()
      addToast?.(`已重编 ${data.renamed?.length ?? 0} 章`, 'success')
      // Reload outline
      const updated = await fetch(`/api/v1/books/${currentBook.book_id}/outline`).then(x => x.json())
      setOutline(updated)
    } catch (e) {
      addToast?.(`整理失败：${e.message}`, 'error')
    } finally {
      setRenumberOpen(false)
    }
  }}
/>
```

- [ ] **Step 3: Smoke test**

Create a book with chapters ch05, ch07 (non-contiguous). Reorder so they're in positions 1 and 2. Click 整理编号 → confirm → verify files renamed to ch01, ch02 + outline updates + toast shows success.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/outline/RenumberConfirmModal.jsx \
  frontend/src/components/OutlineView.jsx
git commit -m "feat(outline): renumber chapters with confirm modal"
```

---

## Task 9: Locked state when Agent writes outline

**Files:**
- Modify: `frontend/src/components/OutlineView.jsx` — add locked overlay

- [ ] **Step 1: Add locked state + overlay JSX**

```jsx
const [locked, setLocked] = useState(false)
// TODO: connect to SSE event stream when available. MVP: manual lock via direct
// refresh polling.

// Near end of JSX, inside .outline-view:
{locked && (
  <div className="outline-locked-overlay">
    <Loader size={32} className="anim-spin" />
    <div className="label-sc" style={{ marginTop: 10 }}>Author 正在修改大纲...</div>
  </div>
)}
```

CSS:
```css
.outline-locked-overlay {
  position: absolute; inset: 0;
  background: rgba(244, 237, 224, 0.7);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  z-index: 10;
}
[data-theme="dark"] .outline-locked-overlay { background: rgba(31, 23, 18, 0.7); }
.outline-view { position: relative; }
```

- [ ] **Step 2: Smoke test (manual)**

Dev server. Open outline. Manually set `locked=true` via React devtools → verify overlay renders over the page. Reset to false. OK.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OutlineView.jsx frontend/src/App.css
git commit -m "feat(outline): locked overlay for Agent write state"
```

---

## Task 10: Full smoke test + cleanup

**Files:**
- Modify: `frontend/src/components/OutlineTreeEditor.jsx` — delete or mark deprecated

- [ ] **Step 1: Full walkthrough**

Dev server. Open existing book with standard outline.json:

1. Outline tab loads → book title, epigraph (empty → placeholder), synopsis (empty → placeholder), volumes with roman numerals, chapters with status labels
2. Click book title → edit → enter → saves (inspect 02_Outlines/outline.json to confirm)
3. Add epigraph and synopsis
4. Add volume synopsis
5. Edit chapter summary inline
6. Click chapter status arrow → opens Chapter Workbench
7. Toggle 重排模式 → drag chapter between volumes → outline.json updates
8. Alt+↓ on a focused chapter → moves down
9. Alt+Shift+→ → moves to next volume
10. Click 整理编号 → modal → confirm → files renamed + plot_graph refs updated (if plot_graph exists)

- [ ] **Step 2: Verify Chapter Workbench still works after renumber**

Open the renamed chapter via sidebar. Confirm the file shows the correct content (was ch05, now ch01 but content preserved).

- [ ] **Step 3: Delete OutlineTreeEditor.jsx**

```bash
rm frontend/src/components/OutlineTreeEditor.jsx
```

Grep for remaining references:
```bash
grep -rn "OutlineTreeEditor" frontend/src/
```

Remove any straggling imports.

- [ ] **Step 4: Update CLAUDE.md**

Append to "API Routes" section:

```markdown
**outline.ts** — Outline-specific endpoints:
- `POST /api/v1/books/:bookId/outline/renumber` — cascade-rename chapter IDs to match outline order
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git rm frontend/src/components/OutlineTreeEditor.jsx
git commit -m "chore(outline): remove OutlineTreeEditor, update CLAUDE.md"
```

---

## Verification Checklist

- [ ] `save_outline` accepts `epigraph` on book and `synopsis` on book/volume
- [ ] `save_outline` rejects `epigraph` on non-book nodes
- [ ] Backward-compat: outlines without new fields save and load
- [ ] `renumberChapters` service renames related files + dirs + updates outline + plot_graph refs (4 tests pass)
- [ ] `POST /outline/renumber` endpoint returns mapping
- [ ] OutlineView renders document flow (book title display-hero, epigraph, drop-cap synopsis, volume heads with roman numerals, chapter rows)
- [ ] Chapter status derived correctly (Draft if .md exists, Done if user_decision=approved, dash otherwise)
- [ ] Inline editing saves immediately (book.label, book.epigraph, book.synopsis, volume.label, volume.synopsis, chapter.label, chapter.summary)
- [ ] Drag reorder works within and across volumes
- [ ] Keyboard reorder (Alt+↑/↓ + Alt+Shift+←/→) works
- [ ] Renumber confirm modal → successful cascade rename
- [ ] Locked overlay renders during Agent outline writes (manual verification acceptable)
- [ ] Free-form JSON fallback shows warning + raw JSON view
- [ ] OutlineTreeEditor.jsx deleted; no dangling imports

## Known Limitations (Out of Scope)

- **Corkboard view** (Phase 2)
- **Beats / characters structured fields** on chapter (spec decision: skip)
- **Agent-generated outline regeneration UI** — users do this via AuthorChat
- **Export to Word / PDF** — only .md export (and even .md export is a button placeholder in the top bar; not wired in this plan — out of scope, left as TODO in the button handler)
- **SSE lock state** — placeholder; full integration awaits persistent SSE broadcast channel
- **>100-chapter performance** — `content-visibility: auto` not applied in this plan; can be added later if needed

