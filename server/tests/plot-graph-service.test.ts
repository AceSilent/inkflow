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
