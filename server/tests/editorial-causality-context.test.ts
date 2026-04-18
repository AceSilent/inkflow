import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    // sanity: B is the unresolved setup, not A
    expect(ctx.unresolved_setups[0].id).toBe(b.id)
    // sanity: outgoing edge is A→C
    expect(ctx.chapter_subgraph.outgoing_edges[0].from).toBe(a.id)
    expect(ctx.chapter_subgraph.outgoing_edges[0].to).toBe(c.id)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns empty when no plot graph', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'))
    const bookDir = path.join(tmp, 'book1')
    fs.mkdirSync(bookDir, { recursive: true })
    const ctx = buildCausalityContext(bookDir, 'ch01')
    expect(ctx.chapter_subgraph.nodes).toEqual([])
    expect(ctx.chapter_subgraph.incoming_edges).toEqual([])
    expect(ctx.chapter_subgraph.outgoing_edges).toEqual([])
    expect(ctx.unresolved_setups).toEqual([])
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
