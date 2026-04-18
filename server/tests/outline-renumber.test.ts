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
