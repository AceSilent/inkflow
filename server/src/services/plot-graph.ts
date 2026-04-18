import path from 'path'
import {
  addPlotNodeBodySchema,
  addEdgeBodySchema,
  updatePlotNodeBodySchema,
  type PlotNode,
  type PlotEdge,
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
  body: z.input<typeof addPlotNodeBodySchema>,
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
  patch: z.input<typeof updatePlotNodeBodySchema>,
): PlotNode {
  const graph = loadPlotGraph(bookDir) ?? newGraph(bookDir)
  const cur = graph.nodes[nodeId]
  if (!cur) throw new Error(`Node not found: ${nodeId}`)
  const parsed = updatePlotNodeBodySchema.parse(patch)
  graph.nodes[nodeId] = { ...cur, ...parsed }
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
  body: z.input<typeof addEdgeBodySchema>,
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
