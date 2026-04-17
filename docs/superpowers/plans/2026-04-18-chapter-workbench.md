# Chapter Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ChapterEditor.jsx` with a workbench that unifies reading, editing, annotations, editorial feedback, and approval control for a single chapter.

**Architecture:** Two-part implementation — (A) backend: new Fastify plugin `workbench.ts` with 8 endpoints covering annotation CRUD, chapter status, workbench lock, review resubmit, and batch annotation send; plus hook changes (review-prev-chapter reads user_decision; new block-while-user-editing hook). (B) frontend: new `ChapterWorkbench.jsx` component with Milkdown WYSIWYG editor, unified comment feed (user annotations + editorial issues), SSE subscription for Agent-write lockdown, approval flow with confirm modal, diff viewer modal.

**Tech Stack:** TypeScript + Fastify + Zod (backend); React 19 + Milkdown 7 + nanoid (frontend); depends on `design-system` plan's CSS tokens.

Spec reference: `docs/superpowers/specs/2026-04-18-chapter-workbench.md`

**Testing approach:** Backend uses vitest in `server/tests/` (existing pattern). Frontend components smoke-tested in browser per user standard. Hook changes get unit tests.

---

## Phase A · Backend

## Task 1: Zod schemas for annotations + chapter status

**Files:**
- Modify: `server/src/routes/schemas.ts` — add new schemas
- Create: `server/tests/workbench-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  annotationSchema,
  createAnnotationSchema,
  updateAnnotationSchema,
  chapterStatusSchema,
  sendAnnotationsBodySchema,
} from '../src/routes/schemas.js'

describe('annotation schemas', () => {
  it('accepts a valid annotation', () => {
    const ok = {
      id: 'ann_abc',
      quote: '林舟摸出怀表',
      anchor_start: 12,
      anchor_end: 19,
      comment: '转场太硬',
      source: 'user' as const,
      status: 'open' as const,
      created_at: '2026-04-18T00:00:00Z',
    }
    expect(annotationSchema.parse(ok)).toEqual(ok)
  })

  it('rejects annotation with invalid status', () => {
    expect(() => annotationSchema.parse({
      id: 'ann_abc', quote: 'x', anchor_start: 0, anchor_end: 1,
      comment: 'y', source: 'user', status: 'invalid',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('createAnnotationSchema omits id/created_at/status', () => {
    const body = { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' as const }
    expect(createAnnotationSchema.parse(body)).toEqual(body)
  })

  it('chapterStatusSchema accepts user_decision null', () => {
    expect(chapterStatusSchema.parse({
      chapter_id: 'ch01',
      user_decision: null,
    })).toBeTruthy()
  })

  it('chapterStatusSchema accepts approved with decided_at', () => {
    expect(chapterStatusSchema.parse({
      chapter_id: 'ch01',
      user_decision: 'approved',
      decided_at: '2026-04-18T00:00:00Z',
      note: 'ok',
    })).toBeTruthy()
  })

  it('sendAnnotationsBodySchema requires non-empty annotation_ids', () => {
    expect(() => sendAnnotationsBodySchema.parse({ annotation_ids: [] })).toThrow()
    expect(sendAnnotationsBodySchema.parse({ annotation_ids: ['ann_1'] })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd server && npx vitest run tests/workbench-schemas.test.ts`

Expected: FAIL with `Cannot find module` or similar import error on the schemas.

- [ ] **Step 3: Add schemas to `server/src/routes/schemas.ts`**

Append to the file:

```ts
import { z } from 'zod'

export const annotationSchema = z.object({
  id: z.string().min(1),
  quote: z.string(),
  anchor_start: z.number().int().nonnegative(),
  anchor_end: z.number().int().nonnegative(),
  comment: z.string(),
  source: z.enum(['user', 'adopted_review']),
  source_reviewer: z.string().optional(),
  status: z.enum(['open', 'sent', 'resolved', 'ignored']),
  sent_batch_id: z.string().optional(),
  created_at: z.string(),
  sent_at: z.string().optional(),
  resolved_at: z.string().optional(),
})
export type Annotation = z.infer<typeof annotationSchema>

export const createAnnotationSchema = annotationSchema.omit({
  id: true,
  status: true,
  created_at: true,
  sent_batch_id: true,
  sent_at: true,
  resolved_at: true,
})

export const updateAnnotationSchema = annotationSchema.partial().omit({ id: true, created_at: true })

export const chapterStatusSchema = z.object({
  chapter_id: z.string().regex(/^ch\d{1,4}$/i),
  user_decision: z.enum(['approved', 'rejected']).nullable(),
  decided_at: z.string().optional(),
  note: z.string().optional(),
})
export type ChapterStatus = z.infer<typeof chapterStatusSchema>

export const setStatusBodySchema = z.object({
  user_decision: z.enum(['approved', 'rejected']).nullable(),
  note: z.string().optional(),
})

export const sendAnnotationsBodySchema = z.object({
  annotation_ids: z.array(z.string()).min(1),
})
```

- [ ] **Step 4: Run tests — pass**

Run: `cd server && npx vitest run tests/workbench-schemas.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/schemas.ts server/tests/workbench-schemas.test.ts
git commit -m "feat(server): Zod schemas for annotations + chapter status"
```

---

## Task 2: Workbench route — annotation CRUD

**Files:**
- Create: `server/src/routes/workbench.ts`
- Create: `server/tests/workbench-annotations.test.ts`
- Modify: `server/src/index.ts` — register new plugin

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-annotations.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('annotation routes', () => {
  it('GET returns empty array when file missing', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual([])
  })

  it('POST creates annotation with generated id and created_at', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    expect(r.statusCode).toBe(201)
    const ann = r.json()
    expect(ann.id).toMatch(/^ann_/)
    expect(ann.status).toBe('open')
    expect(ann.created_at).toBeTruthy()
  })

  it('POST then GET returns the created annotation', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    const created = create.json()
    const list = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(list.json()).toHaveLength(1)
    expect(list.json()[0].id).toBe(created.id)
  })

  it('PATCH updates comment', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'old', source: 'user' },
    })
    const id = c.json().id
    const u = await app.inject({
      method: 'PATCH',
      url: `/api/v1/books/book1/chapters/ch01/annotations/${id}`,
      payload: { comment: 'new' },
    })
    expect(u.statusCode).toBe(200)
    expect(u.json().comment).toBe('new')
  })

  it('DELETE removes annotation', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    const id = c.json().id
    await app.inject({ method: 'DELETE', url: `/api/v1/books/book1/chapters/ch01/annotations/${id}` })
    const list = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(list.json()).toHaveLength(0)
  })

  it('rejects bookId with path traversal', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/books/..%2Fevil/chapters/ch01/annotations',
    })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})
```

- [ ] **Step 2: Run test — verify fail**

Run: `cd server && npx vitest run tests/workbench-annotations.test.ts`

Expected: FAIL because `workbench.ts` doesn't exist yet.

- [ ] **Step 3: Create `server/src/routes/workbench.ts` with annotation CRUD**

```ts
import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import { createAnnotationSchema, updateAnnotationSchema, type Annotation } from './schemas.js'
import { sanitizePathParam } from '../utils/path-sanitizer.js'
import { ensureDir, safeReadJson, writeJson } from '../utils/file-io.js'

interface WorkbenchOptions {
  dataDir: string
}

function annotationsFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  return path.join(dataDir, safeBook, '04_Drafts', `annotations_${safeCh}.json`)
}

function loadAnnotations(file: string): Annotation[] {
  return safeReadJson<Annotation[]>(file) ?? []
}

function nanoId(): string {
  return 'ann_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const workbenchRoutes: FastifyPluginAsync<WorkbenchOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = annotationsFile(dataDir, bookId, chId)
      return reply.send(loadAnnotations(file))
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.post('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    const body = createAnnotationSchema.parse(req.body)
    const file = annotationsFile(dataDir, bookId, chId)
    ensureDir(path.dirname(file))
    const list = loadAnnotations(file)
    const newAnn: Annotation = {
      ...body,
      id: nanoId(),
      status: 'open',
      created_at: new Date().toISOString(),
    }
    list.push(newAnn)
    writeJson(file, list)
    return reply.code(201).send(newAnn)
  })

  app.patch('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    const patch = updateAnnotationSchema.parse(req.body)
    const file = annotationsFile(dataDir, bookId, chId)
    const list = loadAnnotations(file)
    const idx = list.findIndex(a => a.id === annId)
    if (idx < 0) return reply.code(404).send({ error: 'Annotation not found' })
    list[idx] = { ...list[idx], ...patch }
    writeJson(file, list)
    return reply.send(list[idx])
  })

  app.delete('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    const file = annotationsFile(dataDir, bookId, chId)
    const list = loadAnnotations(file)
    const next = list.filter(a => a.id !== annId)
    writeJson(file, next)
    return reply.code(204).send()
  })
}
```

- [ ] **Step 4: Register plugin in `server/src/index.ts`**

Locate where other routes are registered (after `chatHistoryRoutes` or similar). Add:

```ts
import { workbenchRoutes } from './routes/workbench.js'
// ...
await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir })
```

- [ ] **Step 5: Run tests — pass**

```bash
cd server && npx vitest run tests/workbench-annotations.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/workbench.ts server/tests/workbench-annotations.test.ts server/src/index.ts
git commit -m "feat(server): workbench route — annotation CRUD"
```

---

## Task 3: Workbench route — chapter status GET/PUT

**Files:**
- Modify: `server/src/routes/workbench.ts` — add status endpoints
- Create: `server/tests/workbench-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-status.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('chapter status routes', () => {
  it('GET returns null decision when file missing', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/status' })
    expect(r.statusCode).toBe(200)
    expect(r.json().user_decision).toBeNull()
    expect(r.json().chapter_id).toBe('ch01')
  })

  it('PUT approved sets user_decision and decided_at', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved', note: 'LGTM' },
    })
    expect(r.statusCode).toBe(200)
    const data = r.json()
    expect(data.user_decision).toBe('approved')
    expect(data.decided_at).toBeTruthy()
    expect(data.note).toBe('LGTM')
  })

  it('PUT null clears decision', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved' },
    })
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: null },
    })
    expect(r.json().user_decision).toBeNull()
  })

  it('file is written to 04_Drafts/chapter_status_ch01.json', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved' },
    })
    const exists = fs.existsSync(path.join(tmpDir, 'book1', '04_Drafts', 'chapter_status_ch01.json'))
    expect(exists).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — fail**

Run: `cd server && npx vitest run tests/workbench-status.test.ts`

Expected: FAIL (routes don't exist).

- [ ] **Step 3: Add status routes to `workbench.ts`**

Add to the end of the plugin function (before closing brace):

```ts
import { setStatusBodySchema, type ChapterStatus } from './schemas.js'

function statusFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  return path.join(dataDir, safeBook, '04_Drafts', `chapter_status_${safeCh}.json`)
}

// In the plugin body, after annotation routes:

app.get('/books/:bookId/chapters/:chId/status', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const file = statusFile(dataDir, bookId, chId)
  const existing = safeReadJson<ChapterStatus>(file)
  if (existing) return reply.send(existing)
  return reply.send({ chapter_id: chId, user_decision: null })
})

app.put('/books/:bookId/chapters/:chId/status', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const body = setStatusBodySchema.parse(req.body)
  const file = statusFile(dataDir, bookId, chId)
  ensureDir(path.dirname(file))
  const status: ChapterStatus = {
    chapter_id: chId,
    user_decision: body.user_decision,
    decided_at: body.user_decision ? new Date().toISOString() : undefined,
    note: body.note,
  }
  writeJson(file, status)
  return reply.send(status)
})
```

Also add the necessary imports at the top of the file (merge with existing import line):

```ts
import {
  createAnnotationSchema,
  updateAnnotationSchema,
  setStatusBodySchema,
  type Annotation,
  type ChapterStatus,
} from './schemas.js'
```

- [ ] **Step 4: Run tests — pass**

```bash
cd server && npx vitest run tests/workbench-status.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/workbench.ts server/tests/workbench-status.test.ts
git commit -m "feat(server): workbench route — chapter approval status"
```

---

## Task 4: Workbench route — lock POST/DELETE

**Files:**
- Modify: `server/src/routes/workbench.ts` — lock endpoints
- Create: `server/tests/workbench-lock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-lock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbl-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('workbench lock', () => {
  it('POST creates a lock file with ISO timestamp content', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(201)
    const file = path.join(tmpDir, 'book1', '04_Drafts', 'workbench_lock_ch01')
    expect(fs.existsSync(file)).toBe(true)
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('DELETE removes the lock file', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/books/book1/chapters/ch01/workbench-lock' })
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(204)
    const file = path.join(tmpDir, 'book1', '04_Drafts', 'workbench_lock_ch01')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('DELETE on missing lock is idempotent (still 204)', async () => {
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(204)
  })
})
```

- [ ] **Step 2: Run test — fail**

```bash
cd server && npx vitest run tests/workbench-lock.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add lock routes to `workbench.ts`**

```ts
function lockFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  return path.join(dataDir, safeBook, '04_Drafts', `workbench_lock_${safeCh}`)
}

// In plugin body:

app.post('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const file = lockFile(dataDir, bookId, chId)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, new Date().toISOString(), 'utf8')
  return reply.code(201).send({ locked: true })
})

app.delete('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const file = lockFile(dataDir, bookId, chId)
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch {
    // ignore, idempotent
  }
  return reply.code(204).send()
})
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/workbench-lock.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/workbench.ts server/tests/workbench-lock.test.ts
git commit -m "feat(server): workbench route — editing lock"
```

---

## Task 5: Workbench route — resubmit-review

**Files:**
- Modify: `server/src/editorial/editorial.ts` — extract `runEditorialPipelineForChapter` internal fn
- Modify: `server/src/routes/workbench.ts` — add resubmit endpoint
- Create: `server/tests/workbench-resubmit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-resubmit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbr-'))
  const dir = path.join(tmpDir, 'book1', '04_Drafts')
  fs.mkdirSync(dir, { recursive: true })
  // seed a draft
  fs.writeFileSync(path.join(dir, 'ch01.md'), 'A'.repeat(900), 'utf8')
  // seed book_meta so lookups don't fail
  fs.mkdirSync(path.join(tmpDir, 'book1', '00_Config'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'book1', '00_Config', 'book_meta.json'),
    JSON.stringify({ book_id: 'book1', title: 't', genre: 'g', tone: 'n' }))

  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('resubmit-review', () => {
  it('returns 400 when draft file missing', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch99/resubmit-review',
    })
    expect(r.statusCode).toBe(400)
  })

  it('returns 202 and a job id when draft exists', async () => {
    // Mock the editorial pipeline module to avoid real LLM call
    vi.doMock('../src/editorial/editorial.js', async () => {
      const real = await vi.importActual<any>('../src/editorial/editorial.js')
      return {
        ...real,
        runEditorialPipelineForChapter: vi.fn().mockResolvedValue({
          overall_pass: true,
          feedbacks: [],
          merged_summary: 'ok',
        }),
      }
    })
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/resubmit-review',
    })
    expect([200, 202]).toContain(r.statusCode)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/workbench-resubmit.test.ts
```

Expected: FAIL (route missing).

- [ ] **Step 3: Extract `runEditorialPipelineForChapter` in `editorial.ts`**

In `server/src/editorial/editorial.ts`, locate the `submitToEditorialTool.execute` function. Factor out its core pipeline-run + persistence logic into an exported function:

```ts
export async function runEditorialPipelineForChapter(args: {
  bookDir: string
  chapterId: string
  draftText: string
  bookTone?: string
  bookGenre?: string
  povCharacter?: string
  setting?: string
  sceneTarget?: string
  logicChain?: string
  emotionalArc?: string
}): Promise<EditorialResult> {
  // body: same as current submitToEditorialTool.execute body that reads context,
  // runs pipeline.runPipeline, persistReview, etc. Return the EditorialResult.
  // (This is a refactor — existing tests of the tool continue to work.)
}
```

Then in `submitToEditorialTool.execute`, delegate to `runEditorialPipelineForChapter`.

- [ ] **Step 4: Add resubmit route to `workbench.ts`**

```ts
import { runEditorialPipelineForChapter } from '../editorial/editorial.js'

// In plugin body:

app.post('/books/:bookId/chapters/:chId/resubmit-review', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  const bookDir = path.join(dataDir, safeBook)
  const draftFile = path.join(bookDir, '04_Drafts', `${safeCh}.md`)
  if (!fs.existsSync(draftFile)) {
    return reply.code(400).send({ error: `Draft ${safeCh}.md not found.` })
  }
  const draftText = fs.readFileSync(draftFile, 'utf8')
  const meta = safeReadJson<any>(path.join(bookDir, '00_Config', 'book_meta.json')) ?? {}
  try {
    const result = await runEditorialPipelineForChapter({
      bookDir,
      chapterId: safeCh,
      draftText,
      bookTone: meta.tone,
      bookGenre: meta.genre,
    })
    return reply.code(200).send(result)
  } catch (e) {
    return reply.code(500).send({ error: String(e) })
  }
})
```

- [ ] **Step 5: Run tests — existing editorial + new test**

```bash
cd server && npx vitest run tests/editorial.test.ts tests/workbench-resubmit.test.ts
```

Expected: existing editorial tests still pass, new resubmit test passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/editorial/editorial.ts server/src/routes/workbench.ts server/tests/workbench-resubmit.test.ts
git commit -m "feat(server): workbench route — resubmit to editorial"
```

---

## Task 6: Workbench route — send-annotations (trigger Agent run)

**Files:**
- Modify: `server/src/routes/workbench.ts` — add send-annotations
- Modify: `server/src/routes/chat-history.ts` (if needed) — expose helper for injecting user message
- Create: `server/tests/workbench-send-annotations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/workbench-send-annotations.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbsa-'))
  const drafts = path.join(tmpDir, 'book1', '04_Drafts')
  fs.mkdirSync(drafts, { recursive: true })
  fs.writeFileSync(path.join(drafts, 'ch01.md'), 'DraftText', 'utf8')
  fs.writeFileSync(path.join(drafts, 'annotations_ch01.json'), JSON.stringify([
    { id: 'ann_1', quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'fix turn',
      source: 'user', status: 'open', created_at: '2026-04-18T00:00:00Z' },
    { id: 'ann_2', quote: 'y', anchor_start: 2, anchor_end: 3, comment: 'clarify',
      source: 'user', status: 'open', created_at: '2026-04-18T00:00:00Z' },
  ]))
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('send-annotations', () => {
  it('returns 400 if annotation_ids not found', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/send-annotations',
      payload: { annotation_ids: ['ann_nonexistent'] },
    })
    expect(r.statusCode).toBe(400)
  })

  it('marks annotations as sent with sent_batch_id', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/send-annotations',
      payload: { annotation_ids: ['ann_1', 'ann_2'] },
    })
    expect(r.statusCode).toBe(200)
    const data = r.json()
    expect(data.batch_id).toMatch(/^batch_/)
    expect(data.prompt).toContain('fix turn')
    expect(data.prompt).toContain('clarify')

    const updated = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'book1', '04_Drafts', 'annotations_ch01.json'), 'utf8'))
    expect(updated[0].status).toBe('sent')
    expect(updated[0].sent_batch_id).toBe(data.batch_id)
    expect(updated[0].sent_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/workbench-send-annotations.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add send-annotations route + helper**

In `workbench.ts`:

```ts
import { sendAnnotationsBodySchema } from './schemas.js'

function buildAnnotationPrompt(chId: string, draftText: string, annotations: Annotation[]): string {
  const lines = [
    `请根据以下批注修改第 ${chId} 章（原文在 04_Drafts/${chId}.md）。`,
    '',
  ]
  annotations.forEach((a, i) => {
    lines.push(`【批注 ${i + 1}】引用："${a.quote}"`)
    if (a.source === 'adopted_review' && a.source_reviewer) {
      lines.push(`  （采纳自 ${a.source_reviewer}）`)
    }
    lines.push(`  评论：${a.comment}`)
    lines.push('')
  })
  lines.push('请修改后用 save_draft 保存新版本，然后告知哪些批注已处理。')
  return lines.join('\n')
}

// In plugin body:

app.post('/books/:bookId/chapters/:chId/send-annotations', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const body = sendAnnotationsBodySchema.parse(req.body)
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  const annFile = annotationsFile(dataDir, bookId, chId)
  const all = loadAnnotations(annFile)
  const chosen = all.filter(a => body.annotation_ids.includes(a.id))
  if (chosen.length === 0) {
    return reply.code(400).send({ error: 'No matching annotations found' })
  }
  const draftFile = path.join(dataDir, safeBook, '04_Drafts', `${safeCh}.md`)
  const draftText = fs.existsSync(draftFile) ? fs.readFileSync(draftFile, 'utf8') : ''
  const batchId = 'batch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const promptText = buildAnnotationPrompt(chId, draftText, chosen)
  // Mark chosen annotations as sent
  const now = new Date().toISOString()
  const chosenIds = new Set(chosen.map(a => a.id))
  const updated = all.map(a => chosenIds.has(a.id)
    ? { ...a, status: 'sent' as const, sent_batch_id: batchId, sent_at: now }
    : a)
  writeJson(annFile, updated)
  return reply.send({ batch_id: batchId, prompt: promptText, count: chosen.length })
})
```

**Note:** Frontend is responsible for taking the returned `prompt` and POSTing to existing `/api/v1/author-chat/:bookId/send` (SSE route). The backend send-annotations does **not** invoke the Agent directly; it composes + marks + returns the prompt. Frontend orchestrates.

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/workbench-send-annotations.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/workbench.ts server/tests/workbench-send-annotations.test.ts
git commit -m "feat(server): workbench route — batch send annotations"
```

---

## Task 7: Hook change — review-prev-chapter honors user_decision

**Files:**
- Modify: `server/src/stats/tips/review-prev-chapter.ts`
- Modify: `server/tests/review-prev-chapter.test.ts` (if exists) — add test for user_decision override; else create it

- [ ] **Step 1: Locate the existing test or create it**

Check if a test exists:

```bash
ls server/tests | grep -i prev-chapter
```

If exists, open it. If not, create `server/tests/review-prev-chapter.test.ts` based on reviewing the hook code structure.

- [ ] **Step 2: Add a failing test for `user_decision` override**

Add to the test file (creating new if needed):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { reviewPrevChapter } from '../src/stats/tips/review-prev-chapter.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('reviewPrevChapter with user_decision', () => {
  it('allows ch02 if prev chapter_status user_decision=approved even without review', async () => {
    // No review_ch01.json, but chapter_status_ch01.json says approved
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'chapter_status_ch01.json'),
      JSON.stringify({ chapter_id: 'ch01', user_decision: 'approved' })
    )
    const hook = reviewPrevChapter(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch02.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()  // null = allow
  })

  it('blocks ch02 if user_decision=rejected', async () => {
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'chapter_status_ch01.json'),
      JSON.stringify({ chapter_id: 'ch01', user_decision: 'rejected' })
    )
    // Also put passing review — user_decision should win
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'review_ch01.json'),
      JSON.stringify({ chapter_id: 'ch01', overall_pass: true, feedbacks: [] })
    )
    const hook = reviewPrevChapter(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch02.md', content: 'x'.repeat(900) },
    })
    expect(result).not.toBeNull()
    expect(result).toContain('BLOCKED')
  })

  it('falls back to review.overall_pass when user_decision is null', async () => {
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'chapter_status_ch01.json'),
      JSON.stringify({ chapter_id: 'ch01', user_decision: null })
    )
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'review_ch01.json'),
      JSON.stringify({ chapter_id: 'ch01', overall_pass: true, feedbacks: [] })
    )
    const hook = reviewPrevChapter(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch02.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run — verify failure**

```bash
cd server && npx vitest run tests/review-prev-chapter.test.ts
```

Expected: failing (the override logic isn't implemented yet).

- [ ] **Step 4: Modify the hook to check chapter_status first**

Open `server/src/stats/tips/review-prev-chapter.ts`. In the `interceptToolCall` (or wherever the pass/fail is decided for prev chapter), add at the start:

```ts
import fs from 'fs'
import path from 'path'

// Inside the interceptToolCall function, before the existing review check:

const statusFile = path.join(bookDir, '04_Drafts', `chapter_status_${prevChId}.json`)
if (fs.existsSync(statusFile)) {
  try {
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
    if (status.user_decision === 'approved') {
      return null  // allow
    }
    if (status.user_decision === 'rejected') {
      return `[BLOCKED] 前一章 ${prevChId} 被用户手动拒绝，请修订后重新提交审核或取得用户通过。`
    }
    // user_decision === null → fall through to existing review check
  } catch {
    // bad json — fall through
  }
}

// ... existing review_{prevCh}.json logic ...
```

- [ ] **Step 5: Run — pass**

```bash
cd server && npx vitest run tests/review-prev-chapter.test.ts
```

Expected: 3 new tests pass; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/stats/tips/review-prev-chapter.ts server/tests/review-prev-chapter.test.ts
git commit -m "feat(hooks): review-prev-chapter honors user_decision override"
```

---

## Task 8: New hook — block-while-user-editing

**Files:**
- Create: `server/src/stats/tips/block-while-user-editing.ts`
- Modify: `server/src/agent/agent-loop.ts` (or wherever hooks are registered) — register the new hook
- Create: `server/tests/block-while-user-editing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/block-while-user-editing.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { blockWhileUserEditing } from '../src/stats/tips/block-while-user-editing.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bwe-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('blockWhileUserEditing', () => {
  it('allows save_draft when no lock file', async () => {
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()
  })

  it('blocks save_draft when lock file exists and recent', async () => {
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'workbench_lock_ch01'),
      new Date().toISOString()
    )
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toContain('User is currently editing')
  })

  it('treats stale lock (>10min) as expired and allows save', async () => {
    const oldTs = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'workbench_lock_ch01'),
      oldTs
    )
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()
  })

  it('ignores tools other than save_draft', async () => {
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'workbench_lock_ch01'), new Date().toISOString())
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_outline',
      args: {},
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/block-while-user-editing.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the hook**

Create `server/src/stats/tips/block-while-user-editing.ts`:

```ts
import fs from 'fs'
import path from 'path'

interface HookArgs { toolName: string; args: any }
interface Hook {
  interceptToolCall?: (args: HookArgs) => Promise<string | null>
}

const STALE_MS = 10 * 60 * 1000  // 10 minutes

export function blockWhileUserEditing(bookDir: string): Hook {
  return {
    async interceptToolCall({ toolName, args }: HookArgs): Promise<string | null> {
      if (toolName !== 'save_draft') return null
      const filePath = args?.file_path
      if (!filePath || typeof filePath !== 'string') return null
      const base = path.basename(filePath)
      const match = base.match(/^(ch\d{1,4})\.md$/i)
      if (!match) return null
      const chId = match[1]
      const lockFile = path.join(bookDir, '04_Drafts', `workbench_lock_${chId}`)
      if (!fs.existsSync(lockFile)) return null
      try {
        const content = fs.readFileSync(lockFile, 'utf8').trim()
        const ts = Date.parse(content)
        if (isNaN(ts)) return null
        if (Date.now() - ts > STALE_MS) {
          try { fs.unlinkSync(lockFile) } catch {}
          return null
        }
        return `Error: User is currently editing ${chId}. Please wait or ask the user to save/discard their changes before retrying.`
      } catch {
        return null
      }
    },
  }
}
```

- [ ] **Step 4: Register the hook in agent-loop**

Open `server/src/agent/agent-loop.ts`. Find where `reviewPrevChapter` hook is attached / where hooks list is built. Add alongside:

```ts
import { blockWhileUserEditing } from '../stats/tips/block-while-user-editing.js'

// In hook registration / chain assembly:
const hooks = [
  reviewPrevChapter(bookDir),
  blockWhileUserEditing(bookDir),
  // ...existing
]
```

If the existing pattern uses `interceptToolCall` composition differently, follow that pattern — the key invariant is that `block-while-user-editing` runs on every `save_draft` call.

- [ ] **Step 5: Run — pass**

```bash
cd server && npx vitest run tests/block-while-user-editing.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/stats/tips/block-while-user-editing.ts \
  server/src/agent/agent-loop.ts \
  server/tests/block-while-user-editing.test.ts
git commit -m "feat(hooks): block-while-user-editing blocks save_draft if user is editing"
```

---

## Phase B · Frontend

## Task 9: Install Milkdown + nanoid dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd frontend && npm install @milkdown/core@^7 @milkdown/react@^7 @milkdown/preset-commonmark@^7 @milkdown/plugin-history@^7 @milkdown/plugin-listener@^7 @milkdown/theme-nord@^7 nanoid@^5
```

- [ ] **Step 2: Smoke test — import paths resolve**

Create a one-off test file `frontend/src/utils/milkdown-probe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
describe('milkdown imports resolve', () => {
  it('loads core', async () => {
    const core = await import('@milkdown/core')
    expect(typeof core.Editor).toBe('function')
  })
  it('loads preset', async () => {
    const pre = await import('@milkdown/preset-commonmark')
    expect(pre.commonmark).toBeDefined()
  })
})
```

Run: `cd frontend && npx vitest run src/utils/milkdown-probe.test.ts`

Expected: 2 tests pass.

- [ ] **Step 3: Remove the probe test file**

```bash
rm frontend/src/utils/milkdown-probe.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add Milkdown + nanoid deps"
```

---

## Task 10: `ChapterWorkbench.jsx` shell + routing

**Files:**
- Create: `frontend/src/components/ChapterWorkbench.jsx` (shell without editor yet)
- Modify: `frontend/src/App.jsx` — route `chapter-*` tabs to the new component

- [ ] **Step 1: Create the shell**

Create `frontend/src/components/ChapterWorkbench.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, RefreshCw, Send } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

export function ChapterWorkbench({ bookId, chapterId, chapterLabel, addToast, dataVersion }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)  // Agent is writing this chapter
  const [review, setReview] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [status, setStatus] = useState({ user_decision: null })

  const chNum = parseInt(chapterId.replace(/^ch/i, ''), 10) || 0

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [draftR, reviewR, annR, statusR] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(r => r.json()).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/review`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`).then(r => r.json()).catch(() => []),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).then(r => r.json()).catch(() => ({ user_decision: null })),
        ])
        if (cancelled) return
        setContent(draftR?.content ?? '')
        setReview(reviewR)
        setAnnotations(annR)
        setStatus(statusR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [bookId, chapterId, dataVersion])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={24} className="anim-spin" />
      </div>
    )
  }

  return (
    <div className="workbench" data-locked={locked}>
      {/* Left rail */}
      <aside className="workbench-rail">
        <span className="rail-label">Ch. {toRoman(chNum)}</span>
      </aside>

      {/* Main area */}
      <div className="workbench-main">
        {/* Top bar */}
        <div className="workbench-topbar">
          <div className="workbench-title">
            <span className="label-sc" style={{ color: 'var(--accent)' }}>Ch. {toRoman(chNum)}</span>
            <span className="display-heading">{chapterLabel}</span>
            {locked && <span className="workbench-writing-badge"><Loader size={12} className="anim-spin" /> Agent 写作中</span>}
          </div>
          <div className="workbench-actions">
            {/* Placeholder buttons — wired in Task 17 */}
            <button className="btn btn-sm"><Send size={12} /> 发送批注</button>
            <button className="btn btn-sm"><RefreshCw size={12} /> 再次送审</button>
            <button className="btn btn-sm"><Check size={12} /> 用户通过</button>
          </div>
        </div>

        {/* Editor placeholder (Task 11) */}
        <div className="workbench-editor">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)' }}>
            {content || <em style={{ color: 'var(--ink-muted)' }}>（尚无草稿）</em>}
          </pre>
        </div>

        {/* Status bar */}
        <div className="workbench-statusbar">
          <span className="label-sc">{content.length} Words</span>
          <span className="label-sc">{status.user_decision ?? 'Draft'}</span>
        </div>
      </div>

      {/* Right feed placeholder (Task 12) */}
      <aside className="workbench-feed">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>── Marginalia ──</div>
        {review && review.feedbacks?.map((fb, i) => (
          <div key={i} style={{ marginTop: 8, fontSize: 11 }}>
            <strong>{fb.reviewer}</strong>: {fb.quick_comment}
          </div>
        ))}
        {annotations.map(a => (
          <div key={a.id} style={{ marginTop: 8, fontSize: 11 }}>
            <strong>我:</strong> {a.comment}
          </div>
        ))}
      </aside>
    </div>
  )
}
```

- [ ] **Step 2: Add minimal CSS for the workbench shell**

Append to `frontend/src/App.css`:

```css
.workbench {
  display: grid;
  grid-template-columns: 40px 1fr 230px;
  height: 100%;
  background: var(--bg);
}
.workbench-rail {
  padding: 16px 4px;
  border-right: 1px solid var(--border-subtle);
}
.workbench-main {
  display: flex; flex-direction: column;
  min-width: 0;
}
.workbench-topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-strong);
}
.workbench-title { display: flex; gap: 12px; align-items: baseline; }
.workbench-writing-badge {
  font-family: var(--font-label);
  font-size: 10px; color: var(--accent);
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 8px;
}
.workbench-actions { display: flex; gap: 6px; }
.workbench-editor {
  flex: 1; padding: 20px 28px; overflow-y: auto;
}
.workbench-statusbar {
  display: flex; justify-content: space-between;
  padding: 8px 18px; border-top: 1px solid var(--border-subtle);
  color: var(--ink-secondary);
}
.workbench-feed {
  padding: 14px 14px;
  border-left: 1px solid var(--border-subtle);
  overflow-y: auto;
}
.workbench[data-locked="true"] .workbench-editor { opacity: 0.35; pointer-events: none; }
@keyframes spin { to { transform: rotate(360deg); } }
.anim-spin { animation: spin 1.2s linear infinite; }
```

- [ ] **Step 3: Replace `ChapterEditor` in `App.jsx` with `ChapterWorkbench`**

In `frontend/src/App.jsx`, swap the import and the `renderEditor` chapter branch:

```jsx
import { ChapterWorkbench } from './components/ChapterWorkbench'

// ... in renderEditor():
if (activeTab.startsWith('chapter-') && activeChapter) {
  return <ChapterWorkbench bookId={currentBook?.book_id} chapterId={activeChapter.id} chapterLabel={activeChapter.label} addToast={addToast} dataVersion={dataVersion} />
}
```

Remove the old `import { ChapterEditor } ...` line (ChapterEditor.jsx file may remain in the repo but unused; delete in a later cleanup task).

- [ ] **Step 4: Smoke test**

```bash
cd frontend && npm run dev
```

Navigate to a book → click any chapter. Expect:
- Workbench shell renders: rail with "Ch. I", topbar with title and 3 placeholder buttons, pre-formatted draft content, feed on right with review (if any) + annotations list, statusbar at bottom
- No React errors in console
- Existing ChapterEditor no longer appears

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChapterWorkbench.jsx frontend/src/App.css frontend/src/App.jsx
git commit -m "feat(frontend): ChapterWorkbench shell replaces ChapterEditor"
```

---

## Task 11: Integrate Milkdown editor

**Files:**
- Create: `frontend/src/components/workbench/MilkdownEditor.jsx`
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — use new editor

- [ ] **Step 1: Create the Milkdown wrapper**

Create `frontend/src/components/workbench/MilkdownEditor.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { commonmark } from '@milkdown/preset-commonmark'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'

function EditorView({ initial, readOnly, onChange }) {
  const initialRef = useRef(initial)
  initialRef.current = initial

  useEditor(root => {
    const editor = Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialRef.current ?? '')
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          onChange?.(markdown)
        })
      })
      .use(commonmark)
      .use(history)
      .use(listener)
    return editor
  }, [])

  // Read-only toggle — Milkdown v7: set editable via editor view
  useEffect(() => {
    // Read-only behavior handled by parent via pointer-events CSS (see workbench shell)
    // If Milkdown provides a dedicated readOnly API later, switch to it
  }, [readOnly])

  return <Milkdown />
}

export function MilkdownEditor({ initial, readOnly, onChange }) {
  return (
    <MilkdownProvider>
      <EditorView initial={initial} readOnly={readOnly} onChange={onChange} />
    </MilkdownProvider>
  )
}
```

- [ ] **Step 2: Wire into ChapterWorkbench**

In `ChapterWorkbench.jsx`:

1. Import: `import { MilkdownEditor } from './workbench/MilkdownEditor'`
2. Replace the `<pre>` placeholder in `.workbench-editor` with:

```jsx
<div className="workbench-editor">
  <MilkdownEditor
    key={chapterId}  // force remount when chapter changes
    initial={content}
    readOnly={locked}
    onChange={(md) => { setContent(md); setDirty(true) }}
  />
</div>
```

- [ ] **Step 3: Add save handler (Ctrl+S)**

Add inside `ChapterWorkbench`:

```jsx
const handleSave = useCallback(async () => {
  if (!dirty) return
  try {
    const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (r.ok) {
      setDirty(false)
      addToast?.('已保存', 'success')
    } else {
      addToast?.('保存失败', 'error')
    }
  } catch {
    addToast?.('保存失败', 'error')
  }
}, [dirty, content, bookId, chapterId, addToast])

useEffect(() => {
  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [handleSave])
```

- [ ] **Step 4: Add backend PUT draft route**

Open `server/src/routes/data.ts` (chapter read route is there). Add:

```ts
app.put('/books/:bookId/chapters/:chId/draft', async (req, reply) => {
  const { bookId, chId } = req.params as { bookId: string; chId: string }
  const safeBook = sanitizePathParam(bookId)
  const safeCh = sanitizePathParam(chId)
  const body = req.body as { content: string }
  if (typeof body?.content !== 'string') {
    return reply.code(400).send({ error: 'content required' })
  }
  const bookDir = path.join(dataDir, safeBook)
  const draftFile = path.join(bookDir, '04_Drafts', `${safeCh}.md`)
  ensureDir(path.dirname(draftFile))
  // Reuse archivePriorDraft + createBackup for safety
  const { archivePriorDraft } = await import('../tools/draft-history.js')
  const { createBackup } = await import('../tools/safety.js')
  archivePriorDraft(bookDir, draftFile)
  createBackup(draftFile)
  fs.writeFileSync(draftFile, body.content, 'utf8')
  return reply.send({ ok: true, bytes: body.content.length })
})
```

- [ ] **Step 5: Smoke test**

```bash
cd frontend && npm run dev
cd server && npm run dev
```

Open a chapter workbench. Type in the Milkdown editor. Hit Ctrl+S. Expect:
- Toast "已保存"
- `books/<bookId>/04_Drafts/<chId>.md` file content reflects the typed text
- `.bak` file created via createBackup

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workbench/MilkdownEditor.jsx \
  frontend/src/components/ChapterWorkbench.jsx \
  server/src/routes/data.ts
git commit -m "feat(workbench): Milkdown editor + manual save via Ctrl+S"
```

---

## Task 12: CommentFeed component with filter tabs

**Files:**
- Create: `frontend/src/components/workbench/CommentFeed.jsx`
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — replace inline feed with component

- [ ] **Step 1: Create CommentFeed**

Create `frontend/src/components/workbench/CommentFeed.jsx`:

```jsx
import { useState, useMemo } from 'react'

const REVIEWER_COLOR = {
  '设定审稿': 'var(--reviewer-lore)',
  '节奏审稿': 'var(--reviewer-pacing)',
  '文风审稿': 'var(--reviewer-ai-tone)',
  '角色审稿': 'var(--reviewer-character)',
  '因果审稿': 'var(--reviewer-causality)',
}

export function CommentFeed({ review, annotations, onJump, onAdopt, onIgnore, onDelete, onSendBatch }) {
  const [filter, setFilter] = useState('all')  // all | open | high | mine

  const items = useMemo(() => {
    const reviewItems = (review?.feedbacks ?? []).flatMap(fb =>
      (fb.issues ?? []).map(iss => ({
        kind: 'review',
        id: `${fb.reviewer}:${iss.quote ?? ''}:${iss.fix_instruction ?? ''}`,
        reviewer: fb.reviewer,
        severity: iss.severity,
        quote: iss.quote,
        text: iss.fix_instruction ?? iss.type,
        color: REVIEWER_COLOR[fb.reviewer] ?? 'var(--ink-secondary)',
      }))
    )
    const userItems = annotations.map(a => ({
      kind: 'annotation',
      id: a.id,
      reviewer: a.source === 'adopted_review' ? `采纳·${a.source_reviewer ?? ''}` : '我',
      severity: null,
      quote: a.quote,
      text: a.comment,
      status: a.status,
      color: 'var(--reviewer-user)',
    }))
    return [...reviewItems, ...userItems]
  }, [review, annotations])

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filter === 'all') return true
      if (filter === 'open') return it.kind === 'annotation' && it.status === 'open'
      if (filter === 'high') return it.severity && it.severity >= 4
      if (filter === 'mine') return it.kind === 'annotation'
      return true
    }).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
  }, [items, filter])

  const openAnnotationCount = annotations.filter(a => a.status === 'open').length

  return (
    <div className="comment-feed">
      <div className="label-sc" style={{ color: 'var(--accent)', marginBottom: 8 }}>── Marginalia ──</div>

      <div className="comment-filter">
        {['all', 'open', 'high', 'mine'].map(k => (
          <button
            key={k}
            className={`filter-chip ${filter === k ? 'on' : ''}`}
            onClick={() => setFilter(k)}
          >{k === 'all' ? '全部' : k === 'open' ? '未处理' : k === 'high' ? '≥4' : '我的'}</button>
        ))}
      </div>

      {openAnnotationCount > 0 && (
        <button className="btn btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={onSendBatch}>
          📤 发送 {openAnnotationCount} 条批注给 Author
        </button>
      )}

      {filtered.map(it => (
        <div key={it.id} className="comment-card" style={{ borderLeft: `2px solid ${it.color}` }}>
          <div className="comment-author" style={{ color: it.color }}>
            {it.reviewer}
            {it.severity && <span className="comment-sev">sev {it.severity}</span>}
            {it.status && <span className="comment-status">· {it.status}</span>}
          </div>
          {it.quote && <div className="comment-quote">"{it.quote}"</div>}
          <div className="comment-text">{it.text}</div>
          <div className="comment-actions">
            {it.quote && <button onClick={() => onJump?.(it.quote)}>跳原文</button>}
            {it.kind === 'review' && <button onClick={() => onAdopt?.(it)}>采纳</button>}
            {it.kind === 'review' && <button onClick={() => onIgnore?.(it.id)}>忽略</button>}
            {it.kind === 'annotation' && <button onClick={() => onDelete?.(it.id)}>删除</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add CommentFeed CSS to App.css**

```css
.comment-feed { display: flex; flex-direction: column; gap: 6px; }
.comment-filter { display: flex; gap: 4px; margin-bottom: 8px; }
.filter-chip {
  padding: 2px 8px; border-radius: 10px; border: none;
  background: var(--bg-subtle); color: var(--ink-secondary);
  font-family: var(--font-label); font-size: 9px;
  letter-spacing: 0.1em; cursor: pointer;
}
.filter-chip.on { background: var(--accent); color: #fff; }
.comment-card {
  background: var(--bg-elevated); padding: 8px 10px; margin-bottom: 6px;
  font-size: 10.5px;
}
.comment-author {
  font-family: var(--font-display); font-style: italic; font-size: 10.5px;
  margin-bottom: 3px;
}
.comment-sev {
  font-family: var(--font-label); font-size: 8px; margin-left: 6px;
  background: var(--danger); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.comment-status { font-family: var(--font-label); font-size: 9px; margin-left: 6px; opacity: 0.6; }
.comment-quote {
  font-style: italic; color: var(--ink-muted);
  font-size: 10px; border-left: 2px solid var(--border-subtle);
  padding-left: 6px; margin: 3px 0;
}
.comment-text { line-height: 1.5; color: var(--ink); }
.comment-actions { margin-top: 4px; display: flex; gap: 4px; }
.comment-actions button {
  font-size: 9px; padding: 2px 6px; border: 1px solid var(--border-subtle);
  background: var(--bg); color: var(--ink-secondary); cursor: pointer;
}
```

- [ ] **Step 3: Use CommentFeed in ChapterWorkbench**

Replace the inline feed JSX with:

```jsx
<aside className="workbench-feed">
  <CommentFeed
    review={review}
    annotations={annotations}
    onJump={(quote) => {/* Task 13 */}}
    onAdopt={(item) => {/* Task 13 */}}
    onIgnore={(id) => {/* Task 13 */}}
    onDelete={async (annId) => {
      await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations/${annId}`, { method: 'DELETE' })
      setAnnotations(prev => prev.filter(a => a.id !== annId))
    }}
    onSendBatch={() => {/* Task 17 */}}
  />
</aside>
```

Import: `import { CommentFeed } from './workbench/CommentFeed'`

- [ ] **Step 4: Smoke test in browser**

Open a chapter with existing annotations + a review result. Verify:
- Feed renders all items mixed chronologically
- Filter chips switch correctly
- Severity badge shows for review issues
- "我的" filter shows only user annotations
- Delete button on own annotation works (removes from UI + persists to backend)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workbench/CommentFeed.jsx \
  frontend/src/components/ChapterWorkbench.jsx \
  frontend/src/App.css
git commit -m "feat(workbench): unified comment feed with filter + delete"
```

---

## Task 13: AnnotationPopover — selection-driven batch creation

**Files:**
- Create: `frontend/src/components/workbench/AnnotationPopover.jsx`
- Modify: `frontend/src/components/workbench/MilkdownEditor.jsx` — emit selection events
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — mount the popover + wire annotation create

- [ ] **Step 1: Create AnnotationPopover**

Create `frontend/src/components/workbench/AnnotationPopover.jsx`:

```jsx
import { useState } from 'react'
import { X, Check } from 'lucide-react'

export function AnnotationPopover({ anchor, selectedText, onCancel, onSubmit }) {
  const [comment, setComment] = useState('')
  if (!anchor) return null

  return (
    <div className="annotation-popover" style={{
      position: 'absolute',
      top: anchor.y, left: anchor.x,
      zIndex: 100,
    }}>
      <div className="popover-quote">"{selectedText}"</div>
      <textarea
        className="popover-textarea"
        placeholder="批注..."
        value={comment}
        onChange={e => setComment(e.target.value)}
        autoFocus
      />
      <div className="popover-actions">
        <button onClick={onCancel}><X size={12} /></button>
        <button
          className="primary"
          disabled={!comment.trim()}
          onClick={() => onSubmit(comment)}
        ><Check size={12} /> 保存</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add popover CSS to App.css**

```css
.annotation-popover {
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  padding: 10px; width: 240px;
  box-shadow: 2px 2px 0 var(--accent-soft);
  font-family: var(--font-body);
}
.popover-quote {
  font-style: italic; color: var(--ink-muted);
  font-size: 10px; margin-bottom: 6px;
  border-left: 2px solid var(--accent); padding-left: 6px;
}
.popover-textarea {
  width: 100%; height: 60px; resize: vertical;
  background: var(--bg); color: var(--ink);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-body); font-size: 11px;
  padding: 4px 6px;
}
.popover-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.popover-actions button {
  font-size: 10px; padding: 3px 8px;
  background: var(--bg); color: var(--ink-secondary);
  border: 1px solid var(--border-subtle); cursor: pointer;
}
.popover-actions button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.popover-actions button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Selection detection — pragmatic approach**

Add a `useEffect` in ChapterWorkbench that listens to `selectionchange` on the document and checks whether the selection is inside `.workbench-editor`:

```jsx
const [selection, setSelection] = useState(null)  // {text, start, end, anchor:{x,y}}
useEffect(() => {
  function onSelChange() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setSelection(null); return }
    const range = sel.getRangeAt(0)
    const editorEl = document.querySelector('.workbench-editor')
    if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) { setSelection(null); return }
    const rect = range.getBoundingClientRect()
    const editorRect = editorEl.getBoundingClientRect()
    setSelection({
      text: sel.toString(),
      start: 0,  // Task note: character offset to markdown source — best-effort; see Risk 1 in spec
      end: 0,
      anchor: { x: rect.left - editorRect.left, y: rect.bottom - editorRect.top + 4 },
    })
  }
  document.addEventListener('selectionchange', onSelChange)
  return () => document.removeEventListener('selectionchange', onSelChange)
}, [])
```

- [ ] **Step 4: Mount the popover**

Below the editor in ChapterWorkbench JSX:

```jsx
{selection && (
  <AnnotationPopover
    anchor={selection.anchor}
    selectedText={selection.text}
    onCancel={() => setSelection(null)}
    onSubmit={async (comment) => {
      const body = {
        quote: selection.text,
        anchor_start: selection.start,
        anchor_end: selection.end,
        comment,
        source: 'user',
      }
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) {
        const created = await r.json()
        setAnnotations(prev => [...prev, created])
        setSelection(null)
        addToast?.('批注已保存', 'success')
      }
    }}
  />
)}
```

Wrap `.workbench-editor` in a relatively-positioned container so the popover's absolute positioning anchors within it.

- [ ] **Step 5: Smoke test**

Dev server. Open a chapter, select some text. Popover appears near selection. Type a comment, click 保存. New annotation appears in right feed. Cancel works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workbench/AnnotationPopover.jsx \
  frontend/src/components/ChapterWorkbench.jsx \
  frontend/src/App.css
git commit -m "feat(workbench): annotation popover on text selection"
```

---

## Task 14: `useWorkbenchSSE` — subscribe to Agent save_draft events

**Files:**
- Create: `frontend/src/hooks/useWorkbenchSSE.js`
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — use the hook to drive locked state

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useWorkbenchSSE.js`:

```js
import { useEffect } from 'react'

/**
 * Subscribes to a persistent SSE stream of Agent tool events.
 * Backend must expose GET /api/v1/author-chat/:bookId/events (see Risk: if the
 * backend sends tool events only during active chat streams, we don't have a
 * persistent event channel — then this hook becomes a no-op and locked-state
 * is driven by polling the workbench_lock file. Backend task to add persistent
 * stream is out of scope for this plan; poll fallback is used.).
 */
export function useWorkbenchSSE({ bookId, chapterId, onChapterWriteStart, onChapterWriteDone, onOtherChapterWrite }) {
  useEffect(() => {
    if (!bookId || !chapterId) return
    // Poll fallback: check workbench_lock file every 1.5s to detect Agent activity.
    // TODO: Wire to real SSE event stream when backend exposes it.
    let timer
    let lastLockedCh = null
    async function poll() {
      try {
        // Query all chapters in this book with an active workbench_lock OR a recent
        // save_draft SSE event. For MVP, we poll just this chapter's lock state and
        // also watch the chapter file mtime.
        const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`, { method: 'HEAD' })
        // HEAD is insufficient info here — this is a placeholder. Real integration comes via
        // a SSE broadcast route added when this project integrates realtime. For MVP wire
        // locked-state manually from send-annotations or resubmit-review buttons.
      } catch {}
      timer = setTimeout(poll, 1500)
    }
    poll()
    return () => clearTimeout(timer)
  }, [bookId, chapterId, onChapterWriteStart, onChapterWriteDone, onOtherChapterWrite])
}
```

**Note:** This hook is an MVP stub. A full implementation requires either a persistent SSE broadcast endpoint (which is not in the existing codebase as of 2026-04-18) or per-chat-stream event forwarding. For the initial workbench, locked-state is driven by **direct state updates** when the frontend invokes the Agent via `send-annotations` / `resubmit-review` buttons (we know we started the Agent, so we manually flip `locked`).

- [ ] **Step 2: Flip `locked` manually when the frontend invokes the Agent**

In ChapterWorkbench, when calling `send-annotations` → POSTing to author-chat → `setLocked(true)`; listen for `done` event on the SSE response → `setLocked(false)`. This is wired in Task 17.

- [ ] **Step 3: Wire the hook (minimal, mostly plumbing)**

In ChapterWorkbench:

```jsx
import { useWorkbenchSSE } from '../hooks/useWorkbenchSSE'

// inside component
useWorkbenchSSE({
  bookId,
  chapterId,
  onChapterWriteStart: () => setLocked(true),
  onChapterWriteDone: () => {
    setLocked(false)
    // reload draft
    fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`)
      .then(r => r.json())
      .then(d => setContent(d?.content ?? ''))
  },
  onOtherChapterWrite: (otherChId) => {
    addToast?.(`Author 正在写 ${otherChId} → [点此跳转]`, 'info')
  },
})
```

- [ ] **Step 4: Smoke test — hook doesn't crash**

Dev server. Open chapter workbench. Confirm no console errors. Hook is a placeholder/no-op for MVP.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useWorkbenchSSE.js frontend/src/components/ChapterWorkbench.jsx
git commit -m "feat(workbench): SSE hook stub for Agent write events"
```

---

## Task 15: `ApprovalConfirmModal` component

**Files:**
- Create: `frontend/src/components/workbench/ApprovalConfirmModal.jsx`

- [ ] **Step 1: Create the modal**

Create `frontend/src/components/workbench/ApprovalConfirmModal.jsx`:

```jsx
export function ApprovalConfirmModal({ open, unresolvedCount, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal approval-modal" onClick={e => e.stopPropagation()}>
        <h3 className="display-heading">确定通过？</h3>
        <p className="epigraph">
          还有 <strong style={{ color: 'var(--accent)' }}>{unresolvedCount}</strong> 条未处理批注。
          通过后这些批注将保留但不再参与判断。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>确定通过</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ensure modal overlay CSS exists**

If `.modal-overlay` / `.modal` classes aren't defined, add to App.css:

```css
.modal-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.4);
  display: flex; justify-content: center; align-items: center;
}
.modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  padding: 22px 28px; min-width: 360px; max-width: 480px;
  box-shadow: 4px 4px 0 var(--accent-soft);
}
.approval-modal h3 { margin: 0 0 10px; }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
```

- [ ] **Step 3: Commit (no smoke test here — wired in Task 17)**

```bash
git add frontend/src/components/workbench/ApprovalConfirmModal.jsx frontend/src/App.css
git commit -m "feat(workbench): approval confirm modal"
```

---

## Task 16: `DiffModal` — view Agent's just-made change

**Files:**
- Create: `frontend/src/components/workbench/DiffModal.jsx`
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — "Agent 刚改了此章" 横幅 + 触发器

- [ ] **Step 1: Create DiffModal using a simple line-diff**

Create `frontend/src/components/workbench/DiffModal.jsx`:

```jsx
export function DiffModal({ open, oldText, newText, onClose }) {
  if (!open) return null
  // Minimal side-by-side view split by lines; not a real diff alg to avoid adding deps.
  const oldLines = (oldText ?? '').split('\n')
  const newLines = (newText ?? '').split('\n')
  const max = Math.max(oldLines.length, newLines.length)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal diff-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: 960, maxHeight: '80vh', overflow: 'auto' }}>
        <h3 className="display-heading">Agent 的改动</h3>
        <div className="epigraph">左：上一版（备份） · 右：新版</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <pre style={{ background: 'var(--bg)', padding: 10, whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>
            {oldLines.map((l, i) => (
              <div key={i} style={{ background: l !== newLines[i] ? 'rgba(138,46,26,0.08)' : 'transparent' }}>{l}</div>
            ))}
          </pre>
          <pre style={{ background: 'var(--bg)', padding: 10, whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>
            {newLines.map((l, i) => (
              <div key={i} style={{ background: l !== oldLines[i] ? 'rgba(45,90,61,0.1)' : 'transparent' }}>{l}</div>
            ))}
          </pre>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add "Agent 刚改了此章" banner in ChapterWorkbench**

Inside ChapterWorkbench's JSX, above the editor:

```jsx
{recentAgentEdit && (
  <div className="workbench-banner">
    Agent 刚改了此章（第 {recentAgentEdit.rev} 版） ·
    <button onClick={() => setDiffOpen(true)} style={{ marginLeft: 8 }}>查看修改</button>
    <button onClick={() => setRecentAgentEdit(null)} style={{ marginLeft: 8 }}>忽略</button>
  </div>
)}
<DiffModal
  open={diffOpen}
  oldText={recentAgentEdit?.oldText}
  newText={content}
  onClose={() => setDiffOpen(false)}
/>
```

Add state:
```jsx
const [recentAgentEdit, setRecentAgentEdit] = useState(null)  // { rev, oldText }
const [diffOpen, setDiffOpen] = useState(false)
```

Banner CSS:
```css
.workbench-banner {
  background: var(--accent-soft);
  color: var(--ink);
  padding: 6px 12px;
  font-size: 11px;
  border-bottom: 1px solid var(--border-subtle);
}
.workbench-banner button {
  background: none; border: 1px solid var(--border-subtle);
  padding: 2px 8px; font-size: 10px; cursor: pointer;
}
```

- [ ] **Step 3: Populate `recentAgentEdit` in the SSE `onChapterWriteDone` callback**

In the `useWorkbenchSSE({ onChapterWriteDone })` callback, before reloading the draft, save the current `content` as `oldText`:

```jsx
onChapterWriteDone: async () => {
  const prevContent = content
  setLocked(false)
  const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(x => x.json())
  const newContent = r?.content ?? ''
  setContent(newContent)
  if (prevContent && prevContent !== newContent) {
    // We don't have a precise revision counter here; use timestamp fallback
    setRecentAgentEdit({ rev: Date.now() % 1000, oldText: prevContent })
  }
},
```

- [ ] **Step 4: Smoke test (manual; skippable until real SSE is wired)**

Manually simulate by invoking a save_draft from the backend tool in a test or from Agent chat. Confirm banner + diff modal work.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workbench/DiffModal.jsx \
  frontend/src/components/ChapterWorkbench.jsx \
  frontend/src/App.css
git commit -m "feat(workbench): diff modal + Agent-edited banner"
```

---

## Task 17: Wire top-bar buttons (send / resubmit / approve)

**Files:**
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — handlers for 3 buttons

- [ ] **Step 1: Replace placeholder buttons with working handlers**

In ChapterWorkbench, replace the 3 placeholder buttons in `.workbench-actions` with:

```jsx
<button
  className="btn btn-sm"
  disabled={openAnnotationCount === 0 || locked}
  onClick={handleSendBatch}
><Send size={12} /> 📤 {openAnnotationCount > 0 ? `发送 ${openAnnotationCount} 条批注` : '无批注'}</button>

<button className="btn btn-sm" disabled={locked} onClick={handleResubmit}>
  <RefreshCw size={12} /> 再次送审
</button>

<button className="btn btn-sm" disabled={locked} onClick={handleApproveClick}>
  <Check size={12} /> {status.user_decision === 'approved' ? '已通过' : '用户通过'}
</button>
```

And add state + handlers:

```jsx
const [approvalOpen, setApprovalOpen] = useState(false)
const openAnnotationCount = useMemo(
  () => annotations.filter(a => a.status === 'open').length,
  [annotations]
)

const handleSendBatch = useCallback(async () => {
  const openIds = annotations.filter(a => a.status === 'open').map(a => a.id)
  if (openIds.length === 0) return
  try {
    const prep = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/send-annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotation_ids: openIds }),
    }).then(r => r.json())
    if (!prep.prompt) throw new Error('no prompt')
    // Send composed prompt via SSE-chat endpoint
    setLocked(true)
    const esResp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message: prep.prompt }),
    })
    // Consume SSE stream; when done, reload annotations + draft + unlock
    const reader = esResp.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      // parse SSE events minimally — look for event: done
      if (buf.includes('event: done')) break
    }
    // Reload everything
    const [dR, aR, stR] = await Promise.all([
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(r => r.json()),
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`).then(r => r.json()),
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).then(r => r.json()),
    ])
    setContent(dR?.content ?? '')
    setAnnotations(aR)
    setStatus(stR)
    setLocked(false)
    addToast?.('Agent 已处理批注', 'success')
  } catch (e) {
    setLocked(false)
    addToast?.(`发送失败：${e.message}`, 'error')
  }
}, [annotations, bookId, chapterId, addToast])

const handleResubmit = useCallback(async () => {
  setLocked(true)
  try {
    const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/resubmit-review`, {
      method: 'POST',
    })
    if (!r.ok) throw new Error('resubmit failed')
    const result = await r.json()
    setReview(result)
    addToast?.('审稿已刷新', 'success')
  } catch (e) {
    addToast?.(`再送审失败：${e.message}`, 'error')
  } finally {
    setLocked(false)
  }
}, [bookId, chapterId, addToast])

const handleApproveClick = useCallback(() => {
  if (openAnnotationCount > 0) {
    setApprovalOpen(true)
  } else {
    doApprove()
  }
}, [openAnnotationCount])

const doApprove = useCallback(async () => {
  try {
    const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_decision: 'approved' }),
    })
    const data = await r.json()
    setStatus(data)
    setApprovalOpen(false)
    addToast?.('章节已通过', 'success')
  } catch (e) {
    addToast?.(`保存失败：${e.message}`, 'error')
  }
}, [bookId, chapterId, addToast])
```

- [ ] **Step 2: Mount ApprovalConfirmModal**

Below the DiffModal in JSX:

```jsx
<ApprovalConfirmModal
  open={approvalOpen}
  unresolvedCount={openAnnotationCount}
  onCancel={() => setApprovalOpen(false)}
  onConfirm={doApprove}
/>
```

Import: `import { ApprovalConfirmModal } from './workbench/ApprovalConfirmModal'`

- [ ] **Step 3: Also wire CommentFeed's onSendBatch / onAdopt / onIgnore / onJump**

- `onSendBatch` → calls `handleSendBatch`
- `onAdopt` → POST a new annotation with `source: 'adopted_review'` + `source_reviewer: item.reviewer` + quote/comment from the review issue
- `onIgnore` → modify local state only (no server persistence for reviews; they live in `review_{chId}.json` which is Agent-owned)
- `onJump` → `document.querySelector('.workbench-editor').querySelector(... match quote ...)` fallback: `window.find(quote)` (non-standard but works in most browsers) or console warn

```jsx
onAdopt: async (item) => {
  const body = {
    quote: item.quote ?? '',
    anchor_start: 0, anchor_end: 0,
    comment: item.text,
    source: 'adopted_review',
    source_reviewer: item.reviewer,
  }
  const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (r.ok) {
    const created = await r.json()
    setAnnotations(prev => [...prev, created])
    addToast?.('已采纳为批注', 'success')
  }
},
```

- [ ] **Step 4: Smoke test — full loop**

Dev server. Scenario:
1. Open a chapter with no annotations
2. Select text → create an annotation
3. Click "📤 发送" → Agent chat triggers; page locks with spin
4. Agent writes new draft → locked releases; diff banner appears
5. Click "查看修改" → DiffModal shows old/new
6. Click "再次送审" → review refreshes in feed
7. Click "用户通过" with no open annotations → chapter marked approved
8. Re-add an annotation → click "用户通过" → confirm modal appears

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChapterWorkbench.jsx
git commit -m "feat(workbench): wire top-bar send/resubmit/approve flows"
```

---

## Task 18: Locked-writing state polish + lock file lifecycle

**Files:**
- Modify: `frontend/src/components/ChapterWorkbench.jsx` — write lock file on dirty; delete on clean

- [ ] **Step 1: Add workbench_lock lifecycle tied to `dirty` state**

In ChapterWorkbench:

```jsx
// When user starts editing (dirty goes true → true-edge), POST lock
// When user saves or unmounts → DELETE lock
useEffect(() => {
  if (dirty) {
    fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'POST' })
  }
}, [dirty, bookId, chapterId])

// Periodic refresh of lock timestamp while dirty (every 5 min to prevent stale)
useEffect(() => {
  if (!dirty) return
  const timer = setInterval(() => {
    fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'POST' })
  }, 5 * 60 * 1000)
  return () => clearInterval(timer)
}, [dirty, bookId, chapterId])

// On unmount or save (dirty → false transition), DELETE
useEffect(() => {
  return () => {
    fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'DELETE' })
  }
}, [bookId, chapterId])

// After save (dirty → false), also delete the lock
// Adjust handleSave to:
//   if (r.ok) { setDirty(false); fetch(...lock, { method: 'DELETE' }); ... }
```

- [ ] **Step 2: Add visual "dirty" indicator in title**

Change the title rendering:

```jsx
<span className="display-heading">
  {chapterLabel}{dirty && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>●</span>}
</span>
```

- [ ] **Step 3: Smoke test**

Open chapter. Start typing. Verify `books/<id>/04_Drafts/workbench_lock_ch01` appears. Save with Ctrl+S. Verify it disappears. Switch tabs — should also delete.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChapterWorkbench.jsx
git commit -m "feat(workbench): workbench lock lifecycle"
```

---

## Task 19: Full integration smoke test + CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` — mention workbench architecture
- Modify: `frontend/src/components/ChapterEditor.jsx` — delete (replaced)

- [ ] **Step 1: Full scenario walkthrough**

Start both servers:
```bash
cd server && npm run dev
cd frontend && npm run dev
```

Walk through:
1. **Basic open**: click a chapter → workbench loads with Milkdown editor, right feed, status bar
2. **Typing + save**: edit → `●` appears → Ctrl+S → saves + toast
3. **Annotation**: select text → popover → save → appears in feed
4. **Review display**: chapter with existing `review_ch01.json` → 5 reviewer issues appear in feed with correct colors
5. **Filter chips**: toggle between all / open / ≥4 / mine
6. **Adopt review issue**: click 采纳 on a review issue → new annotation appears marked source=adopted_review
7. **Send batch**: click 📤 → page locks → Agent runs → new draft loaded → banner with 查看修改
8. **Diff modal**: click 查看修改 → side-by-side appears with red/green line changes
9. **Resubmit**: click 再次送审 → spin → feed refreshes with new reviewer output
10. **Approve without annotations**: clear all annotations → click 用户通过 → status changes to approved → "用户通过" becomes "已通过" (disabled gracefully)
11. **Approve with annotations**: add one open annotation → click 用户通过 → confirm modal → confirm → approves
12. **Hook check**: try to have Agent write ch02 in author-chat; with ch01 approved via user_decision, Agent should succeed (no BLOCKED)
13. **Hook check rejected**: set user_decision=rejected via direct API call; Agent attempting ch02 → BLOCKED

- [ ] **Step 2: Delete the old ChapterEditor**

```bash
rm frontend/src/components/ChapterEditor.jsx
```

Grep for any remaining `ChapterEditor` references:

```bash
grep -rn "ChapterEditor" frontend/src/
```

If any remain, remove them.

- [ ] **Step 3: Update CLAUDE.md**

Append to the "API Routes" section:

```markdown
**workbench.ts** — Chapter workbench endpoints:
- `GET / POST / PATCH / DELETE /api/v1/books/:bookId/chapters/:chId/annotations` — annotation CRUD
- `GET / PUT /api/v1/books/:bookId/chapters/:chId/status` — user approval state
- `POST / DELETE /api/v1/books/:bookId/chapters/:chId/workbench-lock` — edit lock
- `POST /api/v1/books/:bookId/chapters/:chId/resubmit-review` — direct editorial re-run
- `POST /api/v1/books/:bookId/chapters/:chId/send-annotations` — compose prompt + mark annotations sent
```

And under "Critical Rules":

```markdown
- **User approval override**: `chapter_status_{chId}.json.user_decision` takes precedence over `review_{chId}.json.overall_pass` in the `review-prev-chapter` hook
- **Workbench lock**: while `workbench_lock_{chId}` exists (and is fresh < 10min), Agent's `save_draft` for that chapter is blocked
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git rm frontend/src/components/ChapterEditor.jsx
git commit -m "chore(workbench): remove ChapterEditor, update CLAUDE.md"
```

---

## Verification Checklist

- [ ] All 8 workbench backend endpoints respond with correct status codes
- [ ] `workbench-schemas.test.ts` + 4 other workbench tests pass
- [ ] `review-prev-chapter` honors user_decision (3 scenarios tested)
- [ ] `block-while-user-editing` blocks save_draft on active lock; allows when stale (4 scenarios tested)
- [ ] Milkdown editor loads, reflects draft, emits markdown on change, saves via Ctrl+S
- [ ] Annotation popover creates annotations, appear in feed
- [ ] CommentFeed filters + actions work (jump, adopt, ignore, delete)
- [ ] Top bar: 📤 send / resubmit / approve all work end-to-end
- [ ] ApprovalConfirmModal appears only when open annotations > 0
- [ ] DiffModal shows side-by-side diff after Agent edits
- [ ] workbench_lock file created when editing, removed on save/unmount
- [ ] Hook blocks Agent save_draft when workbench_lock is fresh
- [ ] Hook allows Agent save_draft when user_decision=approved even without editorial pass
- [ ] ChapterEditor.jsx deleted; no dangling imports

## Known Limitations (Out of Scope)

- **Real SSE event channel for Agent writes from other sources** (e.g., Feishu bot) — current lock state is driven manually by frontend-initiated Agent runs. Agent writes triggered outside the workbench frontend won't auto-lock/unlock the UI until a persistent SSE broadcast route is added
- **Character-precise annotation anchors** — quote text is saved but `anchor_start/end` are set to 0 in MVP. Plan: revisit once Milkdown offset mapping is needed for highlight rendering
- **Annotation auto-resolution from Agent reply** — after Agent processes a batch, annotations stay status=sent; user manually marks resolved. Phase 2 work: parse Agent's response for "处理了批注 N" signals
- **Diff algorithm** — MVP uses line-by-line comparison, not a true LCS diff. Good enough to visualize changes in 99% of cases
- **Multi-tab conflict** — if user opens same chapter in two tabs, the second overwrites the first's lock on unmount. Not addressed


