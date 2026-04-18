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
