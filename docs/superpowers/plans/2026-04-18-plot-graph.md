# Plot Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redefine the plot tree as a causality-and-foreshadowing DAG, bind it to the Agent's write loop (editorial reviewer + prompt-builder), and add a timeline-based visualization replacing the old tree renderer.

**Architecture:** The old `plot_tree.json` is replaced by `plot_graph.json` (schema version 2) with separate `nodes` map and `edges` array. Old file is not migrated (dev stage). Backend: new `plot-graph.ts` service (load/save + DAG ops + unresolvedSetups query), new `routes/plot-graph.ts`, refactored tools (`add_plot_node` type enum narrowed + new `add_edge` / `remove_edge` / `query_unresolved_setups` tools). Editorial pipeline injects chapter subgraph into causality reviewer's prompt. Prompt-builder adds a "plot ledger" section listing unresolved setups. Frontend: `PlotGraphView.jsx` with a custom SVG timeline canvas (column per chapter, nodes in columns, edges as bezier curves, foreshadowing arcs above top).

**Tech Stack:** TypeScript + Fastify + Zod + existing Vercel AI SDK (backend); React 19 + existing deps (no new frontend libraries for the DAG canvas — hand-rolled SVG is sufficient).

Spec reference: `docs/superpowers/specs/2026-04-18-plot-graph.md`

**Testing approach:** Backend has extensive vitest coverage (schemas, DAG cycle detection, pays-off validation, unresolvedSetups, tool executions, editorial context injection, prompt injection). Frontend smoke-tested in browser.

---

## Phase A · Backend

## Task 1: Plot graph Zod schemas

**Files:**
- Modify: `server/src/routes/schemas.ts` — add schemas
- Create: `server/tests/plot-graph-schemas.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/plot-graph-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  plotNodeSchema,
  plotEdgeSchema,
  addPlotNodeBodySchema,
  addEdgeBodySchema,
} from '../src/routes/schemas.js'

describe('plot graph schemas', () => {
  it('accepts a valid event node', () => {
    expect(plotNodeSchema.parse({
      id: 'evt_1', type: 'event', title: 't', description: '',
      references: ['ch01'], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toBeTruthy()
  })

  it('rejects chapter type', () => {
    expect(() => plotNodeSchema.parse({
      id: 'evt_1', type: 'chapter', title: 't', description: '',
      references: [], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('rejects arc type', () => {
    expect(() => plotNodeSchema.parse({
      id: 'evt_1', type: 'arc', title: 't', description: '',
      references: [], characters: [], status: 'draft',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('accepts all 6 valid node types', () => {
    const types = ['event', 'setup', 'payoff', 'decision', 'turning_point', 'convergence']
    for (const t of types) {
      expect(plotNodeSchema.parse({
        id: 'n', type: t, title: 't', description: '',
        references: [], characters: [], status: 'draft',
        created_at: '2026',
      })).toBeTruthy()
    }
  })

  it('plotEdgeSchema accepts all 6 edge types', () => {
    const types = ['causes', 'triggers', 'enables', 'blocks', 'pays-off', 'parallel']
    for (const t of types) {
      expect(plotEdgeSchema.parse({
        id: 'e', from: 'a', to: 'b', type: t,
      })).toBeTruthy()
    }
  })

  it('addPlotNodeBodySchema parses valid body', () => {
    const body = {
      type: 'setup', title: '怀表',
      description: '北斗七星', references: ['ch01'],
      characters: ['林舟'],
    }
    expect(addPlotNodeBodySchema.parse(body)).toBeTruthy()
  })

  it('addEdgeBodySchema requires from/to different', () => {
    expect(() => addEdgeBodySchema.parse({
      from: 'a', to: 'a', type: 'causes',
    })).toThrow(/self/i)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/plot-graph-schemas.test.ts
```

Expected: FAIL (schemas not exported).

- [ ] **Step 3: Add schemas to `server/src/routes/schemas.ts`**

Append:

```ts
export const NODE_TYPES = ['event', 'setup', 'payoff', 'decision', 'turning_point', 'convergence'] as const
export const EDGE_TYPES = ['causes', 'triggers', 'enables', 'blocks', 'pays-off', 'parallel'] as const
export const NODE_STATUSES = ['draft', 'confirmed', 'pruned', 'alternative'] as const

export const plotNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  title: z.string(),
  description: z.string(),
  references: z.array(z.string()),
  characters: z.array(z.string()),
  status: z.enum(NODE_STATUSES),
  pruned_reason: z.string().optional(),
  created_at: z.string(),
})
export type PlotNode = z.infer<typeof plotNodeSchema>

export const plotEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  note: z.string().optional(),
})
export type PlotEdge = z.infer<typeof plotEdgeSchema>

export const addPlotNodeBodySchema = z.object({
  type: z.enum(NODE_TYPES),
  title: z.string().min(1),
  description: z.string().default(''),
  references: z.array(z.string()).default([]),
  characters: z.array(z.string()).default([]),
  status: z.enum(NODE_STATUSES).default('draft'),
})

export const addEdgeBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  note: z.string().optional(),
}).refine(v => v.from !== v.to, { message: 'self-loop not allowed (from === to)' })

export const updatePlotNodeBodySchema = plotNodeSchema.partial().omit({ id: true, created_at: true })
```

- [ ] **Step 4: Run tests — pass**

```bash
cd server && npx vitest run tests/plot-graph-schemas.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/schemas.ts server/tests/plot-graph-schemas.test.ts
git commit -m "feat(server): Zod schemas for plot graph nodes + edges"
```

---

## Task 2: Plot graph service — load/save + DAG ops + unresolvedSetups

**Files:**
- Create: `server/src/services/plot-graph.ts`
- Create: `server/tests/plot-graph-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/plot-graph-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  loadPlotGraph,
  savePlotGraph,
  addNode,
  updateNode,
  deleteNode,
  addEdge,
  removeEdge,
  unresolvedSetups,
  wouldCreateCycle,
} from '../src/services/plot-graph.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(bookDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('plot-graph service', () => {
  it('loadPlotGraph returns null when file missing', () => {
    expect(loadPlotGraph(bookDir)).toBeNull()
  })

  it('addNode creates a new node + persists', () => {
    const n = addNode(bookDir, {
      type: 'setup', title: '怀表',
      description: '', references: ['ch01'], characters: [], status: 'draft',
    })
    expect(n.id).toMatch(/^setup_/)
    const graph = loadPlotGraph(bookDir)!
    expect(graph.nodes[n.id]).toBeTruthy()
  })

  it('addEdge creates edge', () => {
    const a = addNode(bookDir, { type: 'event', title: 'A', description: '', references: [], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'event', title: 'B', description: '', references: [], characters: [], status: 'draft' })
    const e = addEdge(bookDir, { from: a.id, to: b.id, type: 'causes' })
    expect(e.id).toMatch(/^edg_/)
    const graph = loadPlotGraph(bookDir)!
    expect(graph.edges).toHaveLength(1)
  })

  it('addEdge rejects cycle', () => {
    const a = addNode(bookDir, { type: 'event', title: 'A', description: '', references: [], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'event', title: 'B', description: '', references: [], characters: [], status: 'draft' })
    const c = addNode(bookDir, { type: 'event', title: 'C', description: '', references: [], characters: [], status: 'draft' })
    addEdge(bookDir, { from: a.id, to: b.id, type: 'causes' })
    addEdge(bookDir, { from: b.id, to: c.id, type: 'causes' })
    expect(() => addEdge(bookDir, { from: c.id, to: a.id, type: 'causes' }))
      .toThrow(/cycle/i)
  })

  it('addEdge with pays-off requires target to be setup', () => {
    const a = addNode(bookDir, { type: 'payoff', title: 'P', description: '', references: [], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'event', title: 'E', description: '', references: [], characters: [], status: 'draft' })
    expect(() => addEdge(bookDir, { from: a.id, to: b.id, type: 'pays-off' }))
      .toThrow(/setup/i)
  })

  it('addEdge rejects duplicate (same from/to/type)', () => {
    const a = addNode(bookDir, { type: 'event', title: 'A', description: '', references: [], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'event', title: 'B', description: '', references: [], characters: [], status: 'draft' })
    addEdge(bookDir, { from: a.id, to: b.id, type: 'causes' })
    expect(() => addEdge(bookDir, { from: a.id, to: b.id, type: 'causes' }))
      .toThrow(/duplicate/i)
  })

  it('deleteNode cascade-removes related edges', () => {
    const a = addNode(bookDir, { type: 'event', title: 'A', description: '', references: [], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'event', title: 'B', description: '', references: [], characters: [], status: 'draft' })
    addEdge(bookDir, { from: a.id, to: b.id, type: 'causes' })
    deleteNode(bookDir, a.id)
    const graph = loadPlotGraph(bookDir)!
    expect(graph.edges).toHaveLength(0)
  })

  it('unresolvedSetups lists setup nodes without pays-off edge', () => {
    const s1 = addNode(bookDir, { type: 'setup', title: 's1', description: '', references: ['ch01'], characters: [], status: 'draft' })
    const s2 = addNode(bookDir, { type: 'setup', title: 's2', description: '', references: ['ch02'], characters: [], status: 'draft' })
    const p = addNode(bookDir, { type: 'payoff', title: 'p', description: '', references: ['ch05'], characters: [], status: 'draft' })
    addEdge(bookDir, { from: p.id, to: s1.id, type: 'pays-off' })
    const unresolved = unresolvedSetups(bookDir)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].id).toBe(s2.id)
  })

  it('unresolvedSetups skips pruned setups', () => {
    const s1 = addNode(bookDir, { type: 'setup', title: 's1', description: '', references: ['ch01'], characters: [], status: 'draft' })
    updateNode(bookDir, s1.id, { status: 'pruned', pruned_reason: 'discarded' })
    const unresolved = unresolvedSetups(bookDir)
    expect(unresolved).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/plot-graph-service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create the service**

Create `server/src/services/plot-graph.ts`:

```ts
import path from 'path'
import {
  plotNodeSchema,
  plotEdgeSchema,
  addPlotNodeBodySchema,
  addEdgeBodySchema,
  updatePlotNodeBodySchema,
  type PlotNode,
  type PlotEdge,
  NODE_STATUSES,
} from '../routes/schemas.js'
import { safeReadJson, writeJson } from '../utils/file-io.js'
import { createBackup } from '../tools/safety.js'
import { z } from 'zod'

export interface PlotGraph {
  book_id: string
  nodes: Record<string, PlotNode>
  edges: PlotEdge[]
  version: 2
}

function graphFile(bookDir: string): string {
  return path.join(bookDir, 'plot_graph.json')
}

export function loadPlotGraph(bookDir: string): PlotGraph | null {
  return safeReadJson<PlotGraph>(graphFile(bookDir))
}

function bookIdFromDir(bookDir: string): string {
  return path.basename(bookDir)
}

export function savePlotGraph(bookDir: string, graph: PlotGraph): void {
  const file = graphFile(bookDir)
  createBackup(file)
  writeJson(file, graph)
}

function newGraph(bookDir: string): PlotGraph {
  return { book_id: bookIdFromDir(bookDir), nodes: {}, edges: [], version: 2 }
}

function genNodeId(type: string): string {
  return `${type}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

function genEdgeId(): string {
  return `edg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export function addNode(
  bookDir: string,
  body: z.infer<typeof addPlotNodeBodySchema>,
): PlotNode {
  const graph = loadPlotGraph(bookDir) ?? newGraph(bookDir)
  const parsed = addPlotNodeBodySchema.parse(body)
  const id = genNodeId(parsed.type)
  const node: PlotNode = {
    id,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description,
    references: parsed.references,
    characters: parsed.characters,
    status: parsed.status,
    created_at: new Date().toISOString(),
  }
  graph.nodes[id] = node
  savePlotGraph(bookDir, graph)
  return node
}

export function updateNode(
  bookDir: string,
  nodeId: string,
  patch: z.infer<typeof updatePlotNodeBodySchema>,
): PlotNode {
  const graph = loadPlotGraph(bookDir) ?? newGraph(bookDir)
  const cur = graph.nodes[nodeId]
  if (!cur) throw new Error(`Node not found: ${nodeId}`)
  graph.nodes[nodeId] = { ...cur, ...patch }
  savePlotGraph(bookDir, graph)
  return graph.nodes[nodeId]
}

export function deleteNode(bookDir: string, nodeId: string): void {
  const graph = loadPlotGraph(bookDir)
  if (!graph) return
  delete graph.nodes[nodeId]
  graph.edges = graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId)
  savePlotGraph(bookDir, graph)
}

export function wouldCreateCycle(graph: PlotGraph, from: string, to: string): boolean {
  // Check reachability: can we reach `from` starting from `to`? If yes, adding from→to closes cycle.
  const adj: Record<string, string[]> = {}
  for (const e of graph.edges) {
    if (!adj[e.from]) adj[e.from] = []
    adj[e.from].push(e.to)
  }
  const visited = new Set<string>()
  const stack = [to]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === from) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const nx of adj[cur] ?? []) stack.push(nx)
  }
  return false
}

export function addEdge(
  bookDir: string,
  body: z.infer<typeof addEdgeBodySchema>,
): PlotEdge {
  const graph = loadPlotGraph(bookDir) ?? newGraph(bookDir)
  const parsed = addEdgeBodySchema.parse(body)
  const { from, to, type, note } = parsed

  // Validate nodes exist
  if (!graph.nodes[from]) throw new Error(`Source node not found: ${from}`)
  if (!graph.nodes[to]) throw new Error(`Target node not found: ${to}`)

  // Validate pays-off target is setup
  if (type === 'pays-off' && graph.nodes[to].type !== 'setup') {
    throw new Error(`Edge type 'pays-off' requires target to be a 'setup' node; got ${graph.nodes[to].type}`)
  }

  // Reject duplicates
  if (graph.edges.some(e => e.from === from && e.to === to && e.type === type)) {
    throw new Error(`duplicate edge: ${from}→${to} (${type}) already exists`)
  }

  // Reject cycles
  if (wouldCreateCycle(graph, from, to)) {
    throw new Error(`addEdge would create a cycle in DAG: ${from}→${to}`)
  }

  const edge: PlotEdge = { id: genEdgeId(), from, to, type, note }
  graph.edges.push(edge)
  savePlotGraph(bookDir, graph)
  return edge
}

export function removeEdge(bookDir: string, edgeId: string): void {
  const graph = loadPlotGraph(bookDir)
  if (!graph) return
  graph.edges = graph.edges.filter(e => e.id !== edgeId)
  savePlotGraph(bookDir, graph)
}

export function unresolvedSetups(bookDir: string): PlotNode[] {
  const graph = loadPlotGraph(bookDir)
  if (!graph) return []
  const setups = Object.values(graph.nodes).filter(n => n.type === 'setup' && n.status !== 'pruned')
  const paidOff = new Set(graph.edges.filter(e => e.type === 'pays-off').map(e => e.to))
  return setups.filter(s => !paidOff.has(s.id))
}

export function chapterSubgraph(bookDir: string, chapterId: string): {
  nodes: PlotNode[]
  incoming_edges: PlotEdge[]
  outgoing_edges: PlotEdge[]
} {
  const graph = loadPlotGraph(bookDir)
  if (!graph) return { nodes: [], incoming_edges: [], outgoing_edges: [] }
  const nodes = Object.values(graph.nodes).filter(n => n.references.includes(chapterId))
  const ids = new Set(nodes.map(n => n.id))
  const incoming_edges = graph.edges.filter(e => ids.has(e.to))
  const outgoing_edges = graph.edges.filter(e => ids.has(e.from))
  return { nodes, incoming_edges, outgoing_edges }
}
```

- [ ] **Step 4: Run — pass**

```bash
cd server && npx vitest run tests/plot-graph-service.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/plot-graph.ts server/tests/plot-graph-service.test.ts
git commit -m "feat(server): plot-graph service (CRUD + DAG cycle + unresolved setups)"
```

---

## Task 3: HTTP routes for plot-graph

**Files:**
- Create: `server/src/routes/plot-graph.ts`
- Modify: `server/src/index.ts` — register plugin
- Create: `server/tests/plot-graph-routes.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/plot-graph-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { plotGraphRoutes } from '../src/routes/plot-graph.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgr-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
  app = Fastify()
  await app.register(plotGraphRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('plot-graph routes', () => {
  it('GET on empty graph returns empty', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/plot-graph' })
    expect(r.statusCode).toBe(200)
    const g = r.json()
    expect(g.nodes).toEqual({})
    expect(g.edges).toEqual([])
  })

  it('POST node returns 201 with id', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: {
        type: 'setup', title: '怀表',
        description: '', references: ['ch01'],
        characters: [], status: 'draft',
      },
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().id).toMatch(/^setup_/)
  })

  it('POST edge validates pays-off target', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'payoff', title: 'P', description: '', references: [], characters: [], status: 'draft' },
    })
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'event', title: 'E', description: '', references: [], characters: [], status: 'draft' },
    })
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/edges',
      payload: { from: a.json().id, to: b.json().id, type: 'pays-off' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/setup/i)
  })

  it('GET unresolved-setups lists only setup nodes without pays-off', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'setup', title: 's1', description: '', references: ['ch01'], characters: [], status: 'draft' },
    })
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/plot-graph/unresolved-setups' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(1)
    expect(r.json()[0].title).toBe('s1')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/plot-graph-routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create the route plugin**

Create `server/src/routes/plot-graph.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import { sanitizePathParam } from '../utils/path-sanitizer.js'
import {
  loadPlotGraph,
  addNode,
  updateNode,
  deleteNode,
  addEdge,
  removeEdge,
  unresolvedSetups,
} from '../services/plot-graph.js'
import {
  addPlotNodeBodySchema,
  addEdgeBodySchema,
  updatePlotNodeBodySchema,
} from './schemas.js'

interface Options { dataDir: string }

export const plotGraphRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/plot-graph', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    const graph = loadPlotGraph(bookDir) ?? { book_id: sanitizePathParam(bookId), nodes: {}, edges: [], version: 2 }
    return reply.send(graph)
  })

  app.post('/books/:bookId/plot-graph/nodes', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    try {
      const body = addPlotNodeBodySchema.parse(req.body)
      const node = addNode(bookDir, body)
      return reply.code(201).send(node)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.patch('/books/:bookId/plot-graph/nodes/:nodeId', async (req, reply) => {
    const { bookId, nodeId } = req.params as { bookId: string; nodeId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    try {
      const patch = updatePlotNodeBodySchema.parse(req.body)
      const node = updateNode(bookDir, nodeId, patch)
      return reply.send(node)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.delete('/books/:bookId/plot-graph/nodes/:nodeId', async (req, reply) => {
    const { bookId, nodeId } = req.params as { bookId: string; nodeId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    deleteNode(bookDir, nodeId)
    return reply.code(204).send()
  })

  app.post('/books/:bookId/plot-graph/edges', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    try {
      const body = addEdgeBodySchema.parse(req.body)
      const edge = addEdge(bookDir, body)
      return reply.code(201).send(edge)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.delete('/books/:bookId/plot-graph/edges/:edgeId', async (req, reply) => {
    const { bookId, edgeId } = req.params as { bookId: string; edgeId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    removeEdge(bookDir, edgeId)
    return reply.code(204).send()
  })

  app.get('/books/:bookId/plot-graph/unresolved-setups', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const bookDir = path.join(dataDir, sanitizePathParam(bookId))
    return reply.send(unresolvedSetups(bookDir))
  })
}
```

- [ ] **Step 4: Register in `server/src/index.ts`**

```ts
import { plotGraphRoutes } from './routes/plot-graph.js'
// ...
await app.register(plotGraphRoutes, { prefix: '/api/v1', dataDir })
```

- [ ] **Step 5: Run tests — pass**

```bash
cd server && npx vitest run tests/plot-graph-routes.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/plot-graph.ts server/src/index.ts server/tests/plot-graph-routes.test.ts
git commit -m "feat(server): plot-graph HTTP routes"
```

---

## Task 4: Refactor `plot-tree.ts` tools → `plot-graph.ts` (Agent-facing)

**Files:**
- Create: `server/src/tools/plot-graph.ts`
- Delete: `server/src/tools/plot-tree.ts`
- Modify: `server/src/tools/index.ts` — swap imports
- Create: `server/tests/plot-graph-tools.test.ts`

- [ ] **Step 1: Write failing tests for the new tools**

Create `server/tests/plot-graph-tools.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  readGraphTool,
  addPlotNodeTool,
  addEdgeTool,
  removeEdgeTool,
  queryUnresolvedSetupsTool,
  confirmPathTool,
  pruneBranchTool,
  mergeBranchesTool,
} from '../src/tools/plot-graph.js'

let tmpDir: string
function mkCtx(): any {
  return { dataDir: tmpDir, bookId: 'book1', mode: 'write' as const }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgt-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('plot-graph tools', () => {
  it('add_plot_node rejects chapter type', async () => {
    const r = await addPlotNodeTool.execute({
      node_type: 'chapter' as any, title: 'x',
    }, mkCtx())
    expect(r).toMatch(/invalid|chapter/i)
  })

  it('add_plot_node accepts setup type and persists', async () => {
    const r = await addPlotNodeTool.execute({
      node_type: 'setup', title: '怀表',
      description: '北斗七星', characters: '林舟',
      references: 'ch01',
    }, mkCtx())
    expect(r).toMatch(/created/i)
    const pg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'book1', 'plot_graph.json'), 'utf8'))
    const first = Object.values<any>(pg.nodes)[0]
    expect(first.type).toBe('setup')
    expect(first.references).toEqual(['ch01'])
    expect(first.characters).toEqual(['林舟'])
  })

  it('add_edge creates an edge', async () => {
    await addPlotNodeTool.execute({ node_type: 'event', title: 'A' }, mkCtx())
    await addPlotNodeTool.execute({ node_type: 'event', title: 'B' }, mkCtx())
    const pg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'book1', 'plot_graph.json'), 'utf8'))
    const [a, b] = Object.keys(pg.nodes)
    const r = await addEdgeTool.execute({ from: a, to: b, type: 'causes' }, mkCtx())
    expect(r).toMatch(/edge created/i)
  })

  it('query_unresolved_setups returns unresolved list', async () => {
    await addPlotNodeTool.execute({
      node_type: 'setup', title: 's1', references: 'ch01',
    }, mkCtx())
    const r = await queryUnresolvedSetupsTool.execute({}, mkCtx())
    const parsed = JSON.parse(r)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('s1')
  })

  it('read_graph returns full serialized graph', async () => {
    await addPlotNodeTool.execute({ node_type: 'event', title: 'A' }, mkCtx())
    const r = await readGraphTool.execute({}, mkCtx())
    expect(r).toContain('"nodes"')
    expect(r).toContain('"A"')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/plot-graph-tools.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create `server/src/tools/plot-graph.ts`**

```ts
import { z } from 'zod'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'
import {
  loadPlotGraph,
  addNode,
  addEdge,
  removeEdge,
  unresolvedSetups,
  updateNode,
} from '../services/plot-graph.js'
import { NODE_TYPES, EDGE_TYPES } from '../routes/schemas.js'

const bookDirOf = (ctx: { dataDir: string; bookId: string }) =>
  path.join(ctx.dataDir, ctx.bookId)

export const readGraphTool: ToolDefinition = {
  name: 'read_graph',
  description: '读取完整剧情图谱（节点+边）。',
  parameters: z.object({}),
  permissionLevel: 'read',
  category: '剧情图',
  execute: async (_args, ctx) => {
    const graph = loadPlotGraph(bookDirOf(ctx))
    if (!graph) return 'No plot graph exists yet. Use add_plot_node to start building one.'
    return JSON.stringify(graph, null, 2)
  },
}

export const addPlotNodeTool: ToolDefinition = {
  name: 'add_plot_node',
  description: [
    '向剧情图谱添加节点。节点类型不再接受 chapter 或 arc —— 章节规划应该在 outline。',
    '节点可以 reference 多个章节（可跨章），通过 references 逗号分隔。',
    '如需与其他节点建立因果关系，随后用 add_edge。',
  ].join('\n'),
  parameters: z.object({
    node_type: z.enum(NODE_TYPES)
      .describe('节点类型：event(事件) / setup(伏笔) / payoff(回收) / decision(抉择) / turning_point(转折) / convergence(汇合)'),
    title: z.string().describe('节点标题（15 字内最佳）'),
    description: z.string().optional().describe('节点描述（一两句话）'),
    references: z.string().optional().describe('涉及的章节 id，逗号分隔（如 "ch01,ch02"）'),
    characters: z.string().optional().describe('涉及角色，逗号分隔'),
  }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async (args, ctx) => {
    try {
      const refs = (args.references || '').split(',').map(s => s.trim()).filter(Boolean)
      const chars = (args.characters || '').split(',').map(s => s.trim()).filter(Boolean)
      const node = addNode(bookDirOf(ctx), {
        type: args.node_type,
        title: args.title,
        description: args.description ?? '',
        references: refs,
        characters: chars,
        status: 'draft',
      })
      return `Node created: ${node.id} (type=${node.type}, title="${node.title}")`
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  },
}

export const addEdgeTool: ToolDefinition = {
  name: 'add_edge',
  description: [
    '在剧情图谱中添加因果/时序边。',
    '注意：pays-off 边的 to 必须是 setup 类型；自环和重复边会被拒绝；会引入环的边会被拒绝。',
  ].join('\n'),
  parameters: z.object({
    from: z.string().describe('源节点 id'),
    to: z.string().describe('目标节点 id'),
    type: z.enum(EDGE_TYPES)
      .describe('causes(导致) / triggers(触发) / enables(使可能) / blocks(阻止) / pays-off(伏笔回收) / parallel(并行)'),
    note: z.string().optional(),
  }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async (args, ctx) => {
    try {
      const edge = addEdge(bookDirOf(ctx), args)
      return `Edge created: ${edge.id} (${args.from} --${args.type}--> ${args.to})`
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  },
}

export const removeEdgeTool: ToolDefinition = {
  name: 'remove_edge',
  description: '从剧情图谱移除边。',
  parameters: z.object({ edge_id: z.string() }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async ({ edge_id }, ctx) => {
    removeEdge(bookDirOf(ctx), edge_id)
    return `Edge ${edge_id} removed.`
  },
}

export const queryUnresolvedSetupsTool: ToolDefinition = {
  name: 'query_unresolved_setups',
  description: [
    '查询所有未回收的 setup 节点。返回 JSON 数组，每条包含 id / title / description / 埋设章节 / 距今跨度（按 current_chapter 计算）。',
    '写新章前主动调用，避免伏笔被遗忘。',
  ].join('\n'),
  parameters: z.object({
    current_chapter: z.string().optional().describe('当前/即将写的章节 id，如 "ch07"'),
  }),
  permissionLevel: 'read',
  category: '剧情图',
  execute: async ({ current_chapter }, ctx) => {
    const unresolved = unresolvedSetups(bookDirOf(ctx))
    const curNum = current_chapter
      ? parseInt(current_chapter.replace(/^ch/i, ''), 10)
      : NaN
    const withSpan = unresolved.map(s => {
      const earliestCh = [...s.references].sort()[0]
      const span = earliestCh && !isNaN(curNum)
        ? curNum - (parseInt(earliestCh.replace(/^ch/i, ''), 10) || 0)
        : null
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        setup_chapter: earliestCh ?? null,
        span_chapters: span,
      }
    })
    return JSON.stringify(withSpan, null, 2)
  },
}

export const confirmPathTool: ToolDefinition = {
  name: 'confirm_path',
  description: '确认剧情节点为正式路线（status=confirmed）。',
  parameters: z.object({ node_id: z.string() }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async ({ node_id }, ctx) => {
    try {
      updateNode(bookDirOf(ctx), node_id, { status: 'confirmed' })
      return `Node ${node_id} confirmed.`
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  },
}

export const pruneBranchTool: ToolDefinition = {
  name: 'prune_branch',
  description: '剪枝：标记剧情分支为放弃（status=pruned）。',
  parameters: z.object({
    node_id: z.string(),
    reason: z.string().optional(),
  }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async ({ node_id, reason }, ctx) => {
    try {
      updateNode(bookDirOf(ctx), node_id, { status: 'pruned', pruned_reason: reason })
      return `Node ${node_id} pruned.`
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  },
}

export const mergeBranchesTool: ToolDefinition = {
  name: 'merge_branches',
  description: '创建汇合节点（convergence 类型），不再自带 "merges" 数组 — 用 add_edge 建立每条分支到汇合点的 causes/triggers 边。',
  parameters: z.object({
    convergence_title: z.string(),
    description: z.string().optional(),
  }),
  permissionLevel: 'write',
  category: '剧情图',
  execute: async ({ convergence_title, description }, ctx) => {
    try {
      const node = addNode(bookDirOf(ctx), {
        type: 'convergence',
        title: convergence_title,
        description: description ?? '',
        references: [],
        characters: [],
        status: 'confirmed',
      })
      return `Convergence node created: ${node.id}. Use add_edge from each branch to link them.`
    } catch (e) {
      return `Error: ${(e as Error).message}`
    }
  },
}
```

- [ ] **Step 4: Swap tools in `server/src/tools/index.ts`**

Replace:
```ts
import {
  readTreeTool, addPlotNodeTool, confirmPathTool, pruneBranchTool, mergeBranchesTool,
} from './plot-tree.js'
```
With:
```ts
import {
  readGraphTool, addPlotNodeTool, addEdgeTool, removeEdgeTool,
  queryUnresolvedSetupsTool,
  confirmPathTool, pruneBranchTool, mergeBranchesTool,
} from './plot-graph.js'
```

And in the tool registry list, replace `readTreeTool` with `readGraphTool` and add the 3 new tools (`addEdgeTool`, `removeEdgeTool`, `queryUnresolvedSetupsTool`).

- [ ] **Step 5: Delete old `plot-tree.ts`**

```bash
rm server/src/tools/plot-tree.ts
```

- [ ] **Step 6: Run tests — both new tests and existing**

```bash
cd server && npx vitest run tests/plot-graph-tools.test.ts
cd server && npm test  # ensure nothing else broke
```

Expected: 5 new tests pass; existing suite passes (note: any tests specifically for the old plot-tree tool names need updating or deleting — handle any failures by removing old tests since we're dropping the old tools).

- [ ] **Step 7: Commit**

```bash
git add server/src/tools/plot-graph.ts server/src/tools/index.ts server/tests/plot-graph-tools.test.ts
git rm server/src/tools/plot-tree.ts
# If any old test file mentioned plot-tree tools, delete it here too
git commit -m "feat(tools): plot-graph tools replace plot-tree (no migration)"
```

---

## Task 5: Editorial integration — inject chapter subgraph into causality reviewer

**Files:**
- Modify: `server/src/editorial/pipeline.ts` — when calling causality reviewer, append plot_graph_context to its prompt variables
- Modify: `prompts/reader_scene_causality.j2` — template additions
- Create: `server/tests/editorial-causality-context.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/editorial-causality-context.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
// Test the helper that composes the context for causality reviewer

import { buildCausalityContext } from '../src/editorial/pipeline.js'
import { addNode, addEdge } from '../src/services/plot-graph.js'

describe('buildCausalityContext', () => {
  it('returns chapter_subgraph + unresolved_setups', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'))
    const bookDir = path.join(tmp, 'book1')
    fs.mkdirSync(bookDir, { recursive: true })
    const a = addNode(bookDir, { type: 'event', title: 'A', description: '', references: ['ch01'], characters: [], status: 'draft' })
    const b = addNode(bookDir, { type: 'setup', title: 'B', description: '', references: ['ch01'], characters: [], status: 'draft' })
    const c = addNode(bookDir, { type: 'event', title: 'C', description: '', references: ['ch02'], characters: [], status: 'draft' })
    addEdge(bookDir, { from: a.id, to: c.id, type: 'causes' })

    const ctx = buildCausalityContext(bookDir, 'ch01')
    expect(ctx.chapter_subgraph.nodes).toHaveLength(2)  // A and B both reference ch01
    expect(ctx.chapter_subgraph.outgoing_edges).toHaveLength(1)  // A→C
    expect(ctx.unresolved_setups).toHaveLength(1)  // B is unresolved setup
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns empty when no plot graph', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'))
    const bookDir = path.join(tmp, 'book1')
    fs.mkdirSync(bookDir, { recursive: true })
    const ctx = buildCausalityContext(bookDir, 'ch01')
    expect(ctx.chapter_subgraph.nodes).toEqual([])
    expect(ctx.unresolved_setups).toEqual([])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/editorial-causality-context.test.ts
```

Expected: FAIL (helper doesn't exist).

- [ ] **Step 3: Add helper to `server/src/editorial/pipeline.ts`**

Add exported helper:

```ts
import { chapterSubgraph, unresolvedSetups } from '../services/plot-graph.js'

export interface CausalityContext {
  chapter_subgraph: ReturnType<typeof chapterSubgraph>
  unresolved_setups: ReturnType<typeof unresolvedSetups>
}

export function buildCausalityContext(bookDir: string, chapterId: string): CausalityContext {
  return {
    chapter_subgraph: chapterSubgraph(bookDir, chapterId),
    unresolved_setups: unresolvedSetups(bookDir),
  }
}
```

- [ ] **Step 4: Thread causality context into the reviewer's template variables**

Locate the code that renders each reviewer template (likely `nunjucks.renderString` or similar). For the causality reviewer specifically, pass `plot_graph_context` variable:

```ts
// Where the reviewer is called (inside the loop that dispatches reviewers):
let extraVars: Record<string, any> = {}
if (reviewerName === 'editorial_causality' && chapterId) {
  extraVars.plot_graph_context = buildCausalityContext(bookDir, chapterId)
}
// Merge extraVars into the template context when rendering
```

(Exact integration depends on current pipeline structure — adapt to match. The invariant: the causality template receives a `plot_graph_context` variable when available.)

- [ ] **Step 5: Extend `prompts/reader_scene_causality.j2`**

Append to the end of the existing template:

```
{% if plot_graph_context %}

【剧情图谱对照参考】
本章在剧情图谱上对应以下节点：
{{ plot_graph_context.chapter_subgraph.nodes | tojson }}

这些节点的入边（应当已经发生过的因果铺垫）：
{{ plot_graph_context.chapter_subgraph.incoming_edges | tojson }}

全书目前仍未回收的伏笔：
{{ plot_graph_context.unresolved_setups | tojson }}

审稿检查点：
1. 本章写出的事件链，是否严格遵循了图谱上的因果边？有跳步骤或凭空结果吗？
2. 图谱上的 setup 节点如果 references 包含本章，本章文本里有实际铺设吗？还是徒有设计、文本里没落实？
3. 图谱上的 payoff 节点如果 references 包含本章，本章文本里有实际回收吗？
4. 如果本章没有图谱参考，严重度记为 1-2（信息不足，不作为硬扣分）。

在 issues[] 里为每个违例单独一条，severity ≥ 3 的要给 fix_instruction。
{% endif %}
```

- [ ] **Step 6: Run tests — pass**

```bash
cd server && npx vitest run tests/editorial-causality-context.test.ts
cd server && npm test  # regression check
```

Expected: new tests pass; existing suite passes.

- [ ] **Step 7: Commit**

```bash
git add server/src/editorial/pipeline.ts \
  prompts/reader_scene_causality.j2 \
  server/tests/editorial-causality-context.test.ts
git commit -m "feat(editorial): inject chapter subgraph into causality reviewer"
```

---

## Task 6: Prompt-builder integration — plot ledger section

**Files:**
- Modify: `server/src/agent/prompt-builder.ts` — add plotGraphStatus section
- Create: `server/tests/prompt-plot-ledger.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/prompt-plot-ledger.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { buildPlotGraphStatus } from '../src/agent/prompt-builder.js'
import { addNode } from '../src/services/plot-graph.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plgp-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(bookDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildPlotGraphStatus', () => {
  it('returns empty string when no graph exists', () => {
    expect(buildPlotGraphStatus(bookDir)).toBe('')
  })

  it('returns empty string when all setups are resolved', () => {
    addNode(bookDir, { type: 'event', title: 'just an event', description: '', references: [], characters: [], status: 'draft' })
    expect(buildPlotGraphStatus(bookDir)).toBe('')
  })

  it('returns ledger text listing unresolved setups with span', () => {
    addNode(bookDir, { type: 'setup', title: '怀表', description: '北斗七星', references: ['ch01'], characters: [], status: 'draft' })
    addNode(bookDir, { type: 'setup', title: '老照片', description: '', references: ['ch03'], characters: [], status: 'draft' })
    const ledger = buildPlotGraphStatus(bookDir, 'ch07')
    expect(ledger).toContain('剧情账本')
    expect(ledger).toContain('怀表')
    expect(ledger).toContain('ch01')
    expect(ledger).toContain('老照片')
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
cd server && npx vitest run tests/prompt-plot-ledger.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add `buildPlotGraphStatus` to `server/src/agent/prompt-builder.ts`**

```ts
import { unresolvedSetups } from '../services/plot-graph.js'

export function buildPlotGraphStatus(bookDir: string, currentChapter?: string): string {
  const unresolved = unresolvedSetups(bookDir)
  if (unresolved.length === 0) return ''

  const curNum = currentChapter
    ? parseInt(currentChapter.replace(/^ch/i, ''), 10)
    : NaN

  const lines: string[] = [
    '【剧情账本·未回收伏笔】',
    `你已在之前章节埋下 ${unresolved.length} 个伏笔尚未回收。写新章时请考虑是否该收账：`,
    '',
  ]
  for (const s of unresolved) {
    const earliestCh = [...s.references].sort()[0]
    let spanTxt = ''
    if (earliestCh && !isNaN(curNum)) {
      const setupNum = parseInt(earliestCh.replace(/^ch/i, ''), 10)
      if (!isNaN(setupNum)) {
        const span = curNum - setupNum
        spanTxt = `，距今 ${span} 章`
      }
    }
    lines.push(`- [${s.id}] "${s.title}"（埋于 ${earliestCh ?? '?'}${spanTxt}）`)
    if (s.description) lines.push(`  描述：${s.description}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Inject into the prompt-builder section chain**

Locate where `promptBuilder` assembles the system prompt from `coreMemory`, `projectMemory` etc. Add the new section between them:

```ts
const plotLedger = buildPlotGraphStatus(bookDir, currentChapter)
const sections = [
  coreMemorySection,
  projectMemorySection,
  plotLedger ? { title: '剧情账本', body: plotLedger } : null,
  // ... existing sections
].filter(Boolean)
```

(Exact integration depends on current structure — the invariant is: plotLedger appears in system prompt when non-empty.)

Also, add to the "Iron Rules" or equivalent section in the prompt a hint:
```
写新章前，如对要回收哪些伏笔不确定，先调用 query_unresolved_setups。
```

- [ ] **Step 5: Run tests — pass**

```bash
cd server && npx vitest run tests/prompt-plot-ledger.test.ts
cd server && npm test  # regression
```

Expected: new tests pass; existing suite passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/agent/prompt-builder.ts server/tests/prompt-plot-ledger.test.ts
git commit -m "feat(prompt): inject plot ledger of unresolved setups"
```

---

## Phase B · Frontend

## Task 7: `PlotGraphView.jsx` shell with timeline skeleton

**Files:**
- Create: `frontend/src/components/PlotGraphView.jsx`
- Modify: `frontend/src/App.jsx` — new tab `plot-graph` + activity bar entry (optional)

- [ ] **Step 1: Create the shell**

Create `frontend/src/components/PlotGraphView.jsx`:

```jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader, Plus, GitBranch } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

const NODE_COLORS = {
  event: 'var(--ink)',
  setup: 'var(--reviewer-lore)',
  payoff: 'var(--success)',
  decision: 'var(--accent)',
  turning_point: 'var(--ink)',      // reversed bg = black
  convergence: 'var(--reviewer-pacing)',
}

function chRefToOrder(chId) {
  const n = parseInt(String(chId).replace(/^ch/i, ''), 10)
  return isNaN(n) ? 9999 : n
}

export function PlotGraphView({ currentBook, addToast, onChapterOpen, dataVersion }) {
  const { t } = useI18n()
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unresolved, setUnresolved] = useState([])
  const [detailNodeId, setDetailNodeId] = useState(null)
  const [addNodeOpen, setAddNodeOpen] = useState(false)

  const reload = useCallback(async () => {
    if (!currentBook) { setLoading(false); return }
    setLoading(true)
    try {
      const [g, u] = await Promise.all([
        fetch(`/api/v1/books/${currentBook.book_id}/plot-graph`).then(r => r.json()),
        fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/unresolved-setups`).then(r => r.json()),
      ])
      setGraph(g)
      setUnresolved(u)
    } finally {
      setLoading(false)
    }
  }, [currentBook])

  useEffect(() => { reload() }, [reload, dataVersion])

  const columns = useMemo(() => {
    if (!graph) return []
    const byCh = {}
    for (const node of Object.values(graph.nodes)) {
      const ch = (node.references?.sort()?.[0]) ?? 'ch00'
      if (!byCh[ch]) byCh[ch] = []
      byCh[ch].push(node)
    }
    return Object.entries(byCh)
      .sort(([a], [b]) => chRefToOrder(a) - chRefToOrder(b))
  }, [graph])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader size={24} className="anim-spin" /></div>
  if (!currentBook) return <div style={{ padding: 40, color: 'var(--ink-muted)' }}>未选择书籍</div>

  return (
    <div className="plot-graph-view">
      <div className="plot-topbar">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>— Plot Graph —</div>
        <div className="plot-stats">
          <span className="label-sc">{Object.keys(graph?.nodes ?? {}).length} Nodes · {graph?.edges?.length ?? 0} Edges</span>
          {unresolved.length > 0 && (
            <span className="plot-unresolved label-sc" style={{ color: 'var(--accent)' }}>
              · {unresolved.length} 伏笔未回收
            </span>
          )}
        </div>
        <div className="plot-actions">
          <button className="btn btn-sm" onClick={() => setAddNodeOpen(true)}>
            <Plus size={12} /> 节点
          </button>
        </div>
      </div>

      <div className="plot-timeline-scroll">
        <div className="plot-timeline">
          {columns.map(([chId, nodes]) => (
            <div key={chId} className="plot-col" data-ch={chId}>
              <div className="plot-col-head label-sc">Ch. {toRoman(chRefToOrder(chId))}</div>
              {nodes.map(n => (
                <div
                  key={n.id}
                  className={`plot-node plot-node-${n.type}`}
                  data-status={n.status}
                  onClick={() => setDetailNodeId(n.id)}
                  style={{ borderLeftColor: NODE_COLORS[n.type] }}
                >
                  <div className="plot-node-type label-sc">{n.type}</div>
                  <div className="plot-node-title">{n.title}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Edges SVG overlay and detail drawer + add-node modal wired in later tasks */}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS**

Append to App.css:

```css
.plot-graph-view { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
.plot-topbar {
  display: grid; grid-template-columns: 1fr auto auto;
  padding: 12px 22px; border-bottom: 1px solid var(--border-strong);
  background: var(--bg-elevated); align-items: center; gap: 12px;
}
.plot-stats { color: var(--ink-secondary); }
.plot-actions { display: flex; gap: 6px; }
.plot-timeline-scroll { flex: 1; overflow-x: auto; overflow-y: auto; padding: 16px; }
.plot-timeline { display: grid; grid-auto-flow: column; grid-auto-columns: 170px; gap: 16px; min-width: fit-content; }
.plot-col { display: flex; flex-direction: column; gap: 10px; padding-top: 26px; position: relative; }
.plot-col-head {
  position: absolute; top: 0; left: 0; right: 0;
  padding-bottom: 4px; border-bottom: 1px solid var(--border-strong);
  text-align: center; color: var(--accent);
}
.plot-node {
  background: var(--bg-elevated); padding: 7px 9px;
  border: 1px solid var(--border-strong);
  border-left-width: 3px;
  cursor: pointer;
  transition: transform 100ms;
}
.plot-node:hover { transform: translate(-1px, -1px); box-shadow: 2px 2px 0 var(--accent-soft); }
.plot-node-type { color: var(--ink-secondary); margin-bottom: 3px; font-size: 7.5px; }
.plot-node-title { font-family: var(--font-display); font-size: 11px; font-weight: 500; line-height: 1.3; }
.plot-node[data-status="pruned"], .plot-node[data-status="alternative"] {
  opacity: 0.5; border-style: dashed;
}
.plot-node-turning_point { background: var(--ink); color: var(--bg); border-left-color: var(--gold, var(--accent)); }
.plot-node-turning_point .plot-node-type { color: var(--gold, var(--accent)); }
.plot-node-turning_point .plot-node-title { color: var(--bg); }
```

- [ ] **Step 3: Replace the plot-tree path in OutlineTreeEditor OR add new tab**

Recommended: add a new tab `plot-graph` instead of inside the outline view. In `App.jsx`:

Add to `renderEditor()`:
```jsx
case 'plot-graph':
  return <PlotGraphView currentBook={currentBook} addToast={addToast} dataVersion={dataVersion}
    onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })} />
```

Add activity bar entry — open `frontend/src/components/ActivityBar.jsx`. Add a `<GitBranch>` icon button with id `'plot-graph'`:
```jsx
<button className={active === 'plot-graph' ? 'active' : ''} onClick={() => onClick('plot-graph')}>
  <GitBranch size={16} />
</button>
```

And handle in App's `handleActivityClick`:
```js
tabMap['plot-graph'] = ['plot-graph', 'tab.plotGraph']
```

Add i18n key `tab.plotGraph` = "剧情图" in `frontend/src/i18n/*.json` (or wherever translations live).

- [ ] **Step 4: Smoke test**

Dev server. Click the new activity icon → opens a "Plot Graph" tab. With an empty graph: shows 0 Nodes / 0 Edges; timeline empty. Add a node via backend (curl) referencing ch01 → refresh → see the node in Ch. I column.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlotGraphView.jsx \
  frontend/src/App.jsx \
  frontend/src/components/ActivityBar.jsx \
  frontend/src/App.css \
  frontend/src/i18n/*.json
git commit -m "feat(frontend): PlotGraphView timeline shell + tab entry"
```

---

## Task 8: `AddNodeModal` + wiring

**Files:**
- Create: `frontend/src/components/plotgraph/AddNodeModal.jsx`
- Modify: `frontend/src/components/PlotGraphView.jsx`

- [ ] **Step 1: Create modal**

Create `frontend/src/components/plotgraph/AddNodeModal.jsx`:

```jsx
import { useState } from 'react'
import { X, Check } from 'lucide-react'

const NODE_TYPE_OPTIONS = [
  { value: 'event', label: 'Event · 事件' },
  { value: 'setup', label: 'Setup · 伏笔' },
  { value: 'payoff', label: 'Payoff · 回收' },
  { value: 'decision', label: 'Decision · 抉择' },
  { value: 'turning_point', label: 'Turning · 转折' },
  { value: 'convergence', label: 'Convergence · 汇合' },
]

export function AddNodeModal({ open, onCancel, onSubmit }) {
  const [type, setType] = useState('event')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [references, setReferences] = useState('')
  const [characters, setCharacters] = useState('')

  if (!open) return null

  const submit = () => {
    if (!title.trim()) return
    onSubmit({
      type,
      title: title.trim(),
      description: description.trim(),
      references: references.split(',').map(s => s.trim()).filter(Boolean),
      characters: characters.split(',').map(s => s.trim()).filter(Boolean),
      status: 'draft',
    })
    // reset
    setTitle(''); setDescription(''); setReferences(''); setCharacters(''); setType('event')
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
        <h3 className="display-heading">新节点</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label className="label-sc">类型
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ marginLeft: 8, padding: '2px 6px', fontFamily: 'var(--font-body)' }}>
              {NODE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <input className="editable-input" placeholder="标题"
            value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea className="editable-input" placeholder="描述（可选）"
            value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          <input className="editable-input" placeholder="关联章节（逗号分隔，如 ch01,ch02）"
            value={references} onChange={e => setReferences(e.target.value)} />
          <input className="editable-input" placeholder="涉及角色（逗号分隔）"
            value={characters} onChange={e => setCharacters(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}><X size={12} /> 取消</button>
          <button className="btn primary" onClick={submit} disabled={!title.trim()}>
            <Check size={12} /> 创建
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into PlotGraphView**

```jsx
import { AddNodeModal } from './plotgraph/AddNodeModal'

// In PlotGraphView JSX (add near end):
<AddNodeModal
  open={addNodeOpen}
  onCancel={() => setAddNodeOpen(false)}
  onSubmit={async (body) => {
    try {
      const r = await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json()
        addToast?.(`创建失败：${err.error}`, 'error')
        return
      }
      addToast?.('节点已创建', 'success')
      setAddNodeOpen(false)
      reload()
    } catch (e) {
      addToast?.(`出错：${e.message}`, 'error')
    }
  }}
/>
```

- [ ] **Step 3: Smoke test**

Dev server. Open Plot Graph tab. Click + 节点 → modal appears. Fill title + references → 创建. New node appears in the timeline column. Good.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plotgraph/AddNodeModal.jsx \
  frontend/src/components/PlotGraphView.jsx
git commit -m "feat(plotgraph): add-node modal"
```

---

## Task 9: `NodeDetailDrawer` with inline editing

**Files:**
- Create: `frontend/src/components/plotgraph/NodeDetailDrawer.jsx`
- Modify: `frontend/src/components/PlotGraphView.jsx`

- [ ] **Step 1: Create drawer**

Create `frontend/src/components/plotgraph/NodeDetailDrawer.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { EditableField } from '../outline/EditableField'

export function NodeDetailDrawer({ open, node, edges, nodes, onClose, onPatch, onDelete, onEdgeRemove }) {
  if (!open || !node) return null

  const incoming = edges.filter(e => e.to === node.id)
  const outgoing = edges.filter(e => e.from === node.id)

  return (
    <div className="node-drawer">
      <div className="drawer-head">
        <span className="label-sc" style={{ color: 'var(--accent)' }}>{node.type}</span>
        <div style={{ flex: 1 }}>
          <EditableField value={node.title} onSave={v => onPatch({ title: v })} />
        </div>
        <button onClick={onClose}><X size={14} /></button>
      </div>

      <div className="drawer-section">
        <div className="label-sc">描述</div>
        <EditableField multiline value={node.description} onSave={v => onPatch({ description: v })} placeholder="— 点此添加 —" />
      </div>

      <div className="drawer-section">
        <div className="label-sc">章节引用</div>
        <EditableField
          value={(node.references ?? []).join(', ')}
          onSave={v => onPatch({ references: v.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="ch01, ch02"
        />
      </div>

      <div className="drawer-section">
        <div className="label-sc">角色</div>
        <EditableField
          value={(node.characters ?? []).join(', ')}
          onSave={v => onPatch({ characters: v.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="林舟, 她"
        />
      </div>

      <div className="drawer-section">
        <div className="label-sc">状态</div>
        <select value={node.status} onChange={e => onPatch({ status: e.target.value })}
          style={{ padding: '2px 6px', fontFamily: 'var(--font-body)' }}>
          {['draft', 'confirmed', 'pruned', 'alternative'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
      </div>

      <div className="drawer-section">
        <div className="label-sc">入边（{incoming.length}）</div>
        {incoming.map(e => {
          const src = nodes[e.from]
          return (
            <div key={e.id} className="drawer-edge">
              <span>{src?.title ?? e.from}</span>
              <span className="label-sc">--{e.type}→</span>
              <button onClick={() => onEdgeRemove(e.id)}><Trash2 size={10} /></button>
            </div>
          )
        })}
      </div>

      <div className="drawer-section">
        <div className="label-sc">出边（{outgoing.length}）</div>
        {outgoing.map(e => {
          const dst = nodes[e.to]
          return (
            <div key={e.id} className="drawer-edge">
              <span className="label-sc">--{e.type}→</span>
              <span>{dst?.title ?? e.to}</span>
              <button onClick={() => onEdgeRemove(e.id)}><Trash2 size={10} /></button>
            </div>
          )
        })}
      </div>

      <div className="drawer-section">
        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 size={12} /> 删除节点（含相关边）
        </button>
      </div>
    </div>
  )
}
```

CSS:
```css
.node-drawer {
  position: absolute; top: 50px; right: 0; width: 320px; height: calc(100% - 50px);
  background: var(--bg-elevated); border-left: 1px solid var(--border-strong);
  padding: 14px 16px; overflow-y: auto; z-index: 50;
}
.drawer-head { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 12px; }
.drawer-head button { background: none; border: none; cursor: pointer; color: var(--ink-secondary); }
.drawer-section { margin-bottom: 14px; }
.drawer-section .label-sc { color: var(--ink-muted); display: block; margin-bottom: 4px; }
.drawer-edge { display: flex; align-items: center; gap: 6px; font-size: 11px; margin: 2px 0; }
.drawer-edge button { background: none; border: none; cursor: pointer; color: var(--ink-secondary); }
```

- [ ] **Step 2: Wire into PlotGraphView**

```jsx
import { NodeDetailDrawer } from './plotgraph/NodeDetailDrawer'

const detailNode = detailNodeId ? graph?.nodes?.[detailNodeId] : null

// Near end of JSX, inside `.plot-graph-view`:
<NodeDetailDrawer
  open={!!detailNode}
  node={detailNode}
  edges={graph?.edges ?? []}
  nodes={graph?.nodes ?? {}}
  onClose={() => setDetailNodeId(null)}
  onPatch={async (patch) => {
    await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes/${detailNodeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    reload()
  }}
  onDelete={async () => {
    await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/nodes/${detailNodeId}`, { method: 'DELETE' })
    setDetailNodeId(null)
    reload()
  }}
  onEdgeRemove={async (edgeId) => {
    await fetch(`/api/v1/books/${currentBook.book_id}/plot-graph/edges/${edgeId}`, { method: 'DELETE' })
    reload()
  }}
/>
```

- [ ] **Step 3: Smoke test**

Click any node → drawer opens. Edit title / description / references → saves. Delete an edge from the drawer. Delete the node.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plotgraph/NodeDetailDrawer.jsx \
  frontend/src/components/PlotGraphView.jsx \
  frontend/src/App.css
git commit -m "feat(plotgraph): node detail drawer with inline edit"
```

---

## Task 10: `UnresolvedSetupsPopover` + indicator

**Files:**
- Create: `frontend/src/components/plotgraph/UnresolvedSetupsPopover.jsx`
- Modify: `frontend/src/components/PlotGraphView.jsx`

- [ ] **Step 1: Create popover**

Create `frontend/src/components/plotgraph/UnresolvedSetupsPopover.jsx`:

```jsx
export function UnresolvedSetupsPopover({ open, items, onJumpToNode, onClose }) {
  if (!open) return null
  return (
    <div className="unresolved-popover">
      <div className="popover-head">
        <span className="label-sc" style={{ color: 'var(--accent)' }}>未回收伏笔（{items.length}）</span>
        <button onClick={onClose}>×</button>
      </div>
      {items.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>没有未回收伏笔</div>}
      {items.map(it => (
        <div key={it.id} className="unresolved-item" onClick={() => onJumpToNode(it.id)}>
          <div className="label-sc" style={{ color: 'var(--accent)' }}>{it.references?.[0] ?? '?'}</div>
          <div style={{ fontWeight: 500 }}>{it.title}</div>
          {it.description && <div style={{ fontSize: 10, color: 'var(--ink-secondary)', marginTop: 2 }}>{it.description}</div>}
        </div>
      ))}
    </div>
  )
}
```

CSS:
```css
.unresolved-popover {
  position: absolute; top: 42px; right: 140px;
  background: var(--bg-elevated); border: 1px solid var(--border-strong);
  padding: 10px 12px; min-width: 260px; max-width: 320px;
  box-shadow: 3px 3px 0 var(--accent-soft);
  z-index: 40;
}
.popover-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.popover-head button { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--ink-secondary); }
.unresolved-item {
  padding: 8px 10px; margin: 4px 0; cursor: pointer;
  border-left: 2px solid var(--warning); background: var(--bg);
  font-size: 11px;
}
.unresolved-item:hover { background: var(--accent-soft); }
```

- [ ] **Step 2: Make the top-bar indicator clickable**

In PlotGraphView, change the `.plot-unresolved` span to a button, and wire state:

```jsx
const [unresolvedPopoverOpen, setUnresolvedPopoverOpen] = useState(false)

// Top bar span becomes:
{unresolved.length > 0 && (
  <button
    className="plot-unresolved label-sc"
    onClick={() => setUnresolvedPopoverOpen(v => !v)}
    style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
  >
    · {unresolved.length} 伏笔未回收
  </button>
)}

// Near end:
<UnresolvedSetupsPopover
  open={unresolvedPopoverOpen}
  items={unresolved}
  onClose={() => setUnresolvedPopoverOpen(false)}
  onJumpToNode={(id) => {
    setDetailNodeId(id)
    setUnresolvedPopoverOpen(false)
  }}
/>
```

- [ ] **Step 3: Smoke test**

Create a book with 2+ setup nodes, no payoff. Click "N 伏笔未回收" → popover lists them. Click one → opens the detail drawer for that node.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plotgraph/UnresolvedSetupsPopover.jsx \
  frontend/src/components/PlotGraphView.jsx \
  frontend/src/App.css
git commit -m "feat(plotgraph): unresolved setups popover + jump"
```

---

## Task 11: SVG edges overlay (bezier curves + pays-off arcs)

**Files:**
- Create: `frontend/src/components/plotgraph/EdgesOverlay.jsx`
- Modify: `frontend/src/components/PlotGraphView.jsx`

- [ ] **Step 1: Create SVG overlay component**

Create `frontend/src/components/plotgraph/EdgesOverlay.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

const EDGE_COLOR = {
  causes: 'var(--ink)',
  triggers: 'var(--ink)',
  enables: 'var(--ink-secondary)',
  blocks: 'var(--accent)',
  'pays-off': 'var(--success)',
  parallel: 'var(--ink-muted)',
}

export function EdgesOverlay({ edges, containerRef }) {
  const [positions, setPositions] = useState(null)

  useEffect(() => {
    function compute() {
      if (!containerRef.current) return
      const container = containerRef.current
      const containerRect = container.getBoundingClientRect()
      const map = {}
      container.querySelectorAll('.plot-node').forEach(el => {
        const id = el.getAttribute('data-node-id')
        if (!id) return
        const r = el.getBoundingClientRect()
        map[id] = {
          x: r.left - containerRect.left + r.width / 2,
          y: r.top - containerRect.top + r.height / 2,
          w: r.width, h: r.height,
        }
      })
      setPositions(map)
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('scroll', compute, true)
    return () => { ro.disconnect(); window.removeEventListener('scroll', compute, true) }
  }, [containerRef, edges])

  if (!positions) return null

  return (
    <svg style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 1,
    }}>
      <defs>
        {Object.entries(EDGE_COLOR).map(([key, color]) => (
          <marker key={key} id={`arrow-${key}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill={color} />
          </marker>
        ))}
      </defs>
      {edges.map(e => {
        const a = positions[e.from]
        const b = positions[e.to]
        if (!a || !b) return null
        // For pays-off, route as a high arc above the nodes
        let d
        if (e.type === 'pays-off') {
          const peak = Math.min(a.y, b.y) - 40
          const midX = (a.x + b.x) / 2
          d = `M ${a.x} ${a.y} Q ${midX} ${peak} ${b.x} ${b.y}`
        } else {
          // Simple bezier from source right-center to target left-center
          const cx = (a.x + b.x) / 2
          d = `M ${a.x} ${a.y} Q ${cx} ${a.y}, ${cx} ${(a.y + b.y) / 2} T ${b.x} ${b.y}`
        }
        const isDashed = e.type === 'pays-off' || e.type === 'blocks' || e.type === 'parallel'
        return (
          <path
            key={e.id}
            d={d}
            stroke={EDGE_COLOR[e.type]}
            strokeWidth={e.type === 'pays-off' ? 1.5 : 1.2}
            strokeDasharray={isDashed ? (e.type === 'parallel' ? '2 3' : '5 3') : undefined}
            fill="none"
            markerEnd={`url(#arrow-${e.type})`}
          />
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 2: Use in PlotGraphView**

In PlotGraphView:

```jsx
import { EdgesOverlay } from './plotgraph/EdgesOverlay'

const timelineRef = useRef(null)

// Modify .plot-node JSX to include data-node-id:
<div className="plot-node" data-node-id={n.id} ...>

// Wrap .plot-timeline with the ref and mount overlay:
<div className="plot-timeline-scroll" ref={timelineRef}>
  <div className="plot-timeline" style={{ position: 'relative' }}>
    {columns.map(...)}
    <EdgesOverlay edges={graph?.edges ?? []} containerRef={timelineRef} />
  </div>
</div>
```

Import: `import { useRef } from 'react'`.

- [ ] **Step 3: Smoke test**

Create 2 nodes (A→B causes edge + A pays-off to an earlier setup). Refresh. Verify:
- A→B shows as solid black line with arrow
- pays-off shows as dashed green arc above

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plotgraph/EdgesOverlay.jsx \
  frontend/src/components/PlotGraphView.jsx
git commit -m "feat(plotgraph): SVG edges overlay with pays-off arcs"
```

---

## Task 12: Full smoke test + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full end-to-end scenario**

Dev server both sides. Pick a book. Execute:

1. Open Plot Graph tab → empty timeline
2. Add setup "怀表" referencing ch01 → appears in Ch. I column, orange border
3. Add event "收到信" referencing ch02 → Ch. II column
4. Add edge 怀表→收到信 type causes → solid line drawn
5. Add payoff "北斗图解" referencing ch07 → Ch. VII column, green border
6. In detail drawer of payoff, attempt to add pays-off edge to non-setup target → backend rejects with 400
7. Add pays-off edge from 北斗图解 to 怀表 → green arc drawn above timeline
8. Unresolved count drops to 0; "N 伏笔未回收" badge disappears
9. Add second setup "老照片" at ch03 without payoff → badge shows "1 伏笔未回收"
10. Click badge → popover shows; click item → drawer opens for 老照片
11. Mark 老照片 status=pruned → badge disappears (pruned setups skipped)
12. Delete 怀表 node → cascade: pays-off edge to it also gone
13. From Agent chat, ask "read_graph" — Agent sees the full graph
14. Agent tool `query_unresolved_setups` returns expected list
15. Submit a draft for ch07 editorial → causality reviewer's output should reference plot_graph_context (may need to manually inspect reviewer's raw response)
16. Ensure `prompt-builder.ts` injects "剧情账本·未回收伏笔" line when author-chat starts a new Agent run and there's ≥ 1 unresolved setup

- [ ] **Step 2: Update CLAUDE.md**

In "Architecture" section, replace the old "Plot Tree" description with:

```markdown
### Plot Graph (`server/src/services/plot-graph.ts` + `server/src/tools/plot-graph.ts`)

The old tree has been replaced by a DAG in `plot_graph.json`:
- Nodes (6 types): event / setup / payoff / decision / turning_point / convergence. `chapter` and `arc` are forbidden.
- Edges (6 types): causes / triggers / enables / blocks / pays-off / parallel.
- Nodes reference chapters via `references: string[]` (many-to-many weak link).
- `editorial_causality` reviewer receives `plot_graph_context` (chapter subgraph + unresolved setups).
- `prompt-builder` injects an unresolved-setups ledger into the system prompt so the Agent tracks foreshadowing debt.

Tools: `read_graph`, `add_plot_node`, `add_edge`, `remove_edge`, `query_unresolved_setups`, `confirm_path`, `prune_branch`, `merge_branches`.
```

In "API Routes":

```markdown
**plot-graph.ts** — Plot graph DAG endpoints:
- `GET /api/v1/books/:bookId/plot-graph` — full graph
- `POST / PATCH / DELETE /api/v1/books/:bookId/plot-graph/nodes[/:id]`
- `POST / DELETE /api/v1/books/:bookId/plot-graph/edges[/:id]`
- `GET /api/v1/books/:bookId/plot-graph/unresolved-setups`
```

In the tool count table, update count (17 → 19 because we added add_edge / remove_edge / query_unresolved_setups and dropped read_tree but kept read_graph replacement, net +2).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore(plot-graph): finalize + update CLAUDE.md"
```

---

## Verification Checklist

- [ ] All 6 node types accepted; `chapter` and `arc` rejected
- [ ] All 6 edge types work; pays-off target must be setup; self-loops rejected; duplicates rejected; cycles rejected
- [ ] Node CRUD + edge CRUD via HTTP works
- [ ] `query_unresolved_setups` returns correct list with spans
- [ ] Deleting a node cascade-removes its edges
- [ ] Pruned setups are excluded from unresolved list
- [ ] `editorial_causality` reviewer receives `plot_graph_context` variable in prompt
- [ ] `prompt-builder` injects plot ledger section when unresolved setups exist
- [ ] Old `plot-tree.ts` tools removed; new tools registered in `tools/index.ts`
- [ ] Frontend: timeline columns per chapter; node cards with type-colored left border; SVG edges + pays-off arcs
- [ ] Node detail drawer inline-edits all fields; deletes edges; deletes node
- [ ] Add-node modal creates nodes via API
- [ ] Unresolved setups popover works, jumps to node
- [ ] Theme (light + dark) renders correctly for all new components
- [ ] `plot_tree.json` from before this plan is not touched; `plot_graph.json` is created cleanly

## Known Limitations (Out of Scope)

- **Add-edge connection mode in UI** — users currently create pays-off/causes edges only via node detail drawer's future "add edge" affordance (itself out of scope for Phase 1). MVP: **Agent creates edges via `add_edge` tool; UI users must use add_edge through the Agent until a connect-mode UI is added in a follow-up plan**
- **Column merging/splitting** — spec mentions it; not implemented in this plan. Users live with one column per chapter
- **Force-directed or swim-lane alternative views** — skipped
- **Minimap** — skipped for first version; add if long-book usability pain arises
- **Realtime SSE lock overlay during Agent write** — same placeholder as workbench / outline
- **references ↔ chapter renumber cascade** — handled in outline-view plan's renumber service
- **Migration of old plot_tree.json** — per spec: not done


