/**
 * PlotTree tools — read_tree, add_plot_node, confirm_path, prune_branch, merge_branches.
 *
 * Note: This is a simplified TS port. The full PlotTree class with persistence
 * will be ported in a separate task. For now, tools operate on JSON files directly.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'

const TREE_FILE = 'plot_tree.json'

function loadTree(bookDir: string): Record<string, unknown> | null {
  const treePath = path.join(bookDir, TREE_FILE)
  if (!fs.existsSync(treePath)) return null
  try {
    return JSON.parse(fs.readFileSync(treePath, 'utf-8'))
  } catch {
    return null
  }
}

function saveTree(bookDir: string, tree: Record<string, unknown>): void {
  fs.writeFileSync(path.join(bookDir, TREE_FILE), JSON.stringify(tree, null, 2), 'utf-8')
}

export const readTreeTool: ToolDefinition = {
  name: 'read_tree',
  description: '读取剧情树摘要或特定节点。',
  parameters: z.object({
    node_id: z.string().optional().describe('节点ID（可选，不传则返回全部摘要）'),
  }),
  permissionLevel: 'read',
  execute: async ({ node_id }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const tree = loadTree(bookDir)
    if (!tree) return 'No plot tree exists yet. Use add_plot_node to start building one.'

    if (node_id) {
      const nodes = (tree.nodes ?? {}) as Record<string, unknown>
      const node = nodes[node_id]
      if (!node) return `Error: Node '${node_id}' not found.`
      return JSON.stringify(node, null, 2)
    }

    return JSON.stringify(tree, null, 2)
  },
}

export const addPlotNodeTool: ToolDefinition = {
  name: 'add_plot_node',
  description: '向剧情树添加新节点。',
  parameters: z.object({
    parent: z.string().describe('父节点ID'),
    node_type: z.string().describe('节点类型: arc, chapter, turning_point, branch, convergence'),
    title: z.string().describe('节点标题'),
    description: z.string().optional().describe('节点描述'),
    characters: z.string().optional().describe('涉及角色（逗号分隔）'),
  }),
  permissionLevel: 'write',
  execute: async ({ parent, node_type, title, description, characters }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    let tree = loadTree(bookDir) ?? { book_id: ctx.bookId, nodes: {}, root_id: 'root' }
    const nodes = (tree.nodes ?? {}) as Record<string, unknown>

    const nodeId = `${node_type}_${Date.now()}`
    const charList = characters ? characters.split(',').map(c => c.trim()).filter(Boolean) : []

    nodes[nodeId] = {
      id: nodeId,
      type: node_type,
      title,
      description: description ?? '',
      parent,
      characters: charList,
      status: 'draft',
      created_at: new Date().toISOString(),
    }

    tree.nodes = nodes
    saveTree(bookDir, tree)
    return `Node created: ${nodeId} (type=${node_type}, title=${title})`
  },
}

export const confirmPathTool: ToolDefinition = {
  name: 'confirm_path',
  description: '确认剧情节点为正式路线。',
  parameters: z.object({
    node_id: z.string().describe('要确认的节点ID'),
  }),
  permissionLevel: 'write',
  execute: async ({ node_id }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const tree = loadTree(bookDir)
    if (!tree) return 'Error: No plot tree exists.'
    const nodes = (tree.nodes ?? {}) as Record<string, Record<string, unknown>>
    if (!nodes[node_id]) return `Error: Node '${node_id}' not found.`
    nodes[node_id].status = 'confirmed'
    saveTree(bookDir, tree)
    return `Node '${node_id}' confirmed as official plot line.`
  },
}

export const pruneBranchTool: ToolDefinition = {
  name: 'prune_branch',
  description: '剪枝：标记剧情分支为已放弃。',
  parameters: z.object({
    node_id: z.string().describe('要剪掉的节点ID'),
    reason: z.string().optional().describe('剪枝原因'),
  }),
  permissionLevel: 'write',
  execute: async ({ node_id, reason }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const tree = loadTree(bookDir)
    if (!tree) return 'Error: No plot tree exists.'
    const nodes = (tree.nodes ?? {}) as Record<string, Record<string, unknown>>
    if (!nodes[node_id]) return `Error: Node '${node_id}' not found.`
    nodes[node_id].status = 'pruned'
    nodes[node_id].pruned_reason = reason ?? ''
    saveTree(bookDir, tree)
    return `Branch '${node_id}' pruned. Reason: ${reason ?? 'none'}`
  },
}

export const mergeBranchesTool: ToolDefinition = {
  name: 'merge_branches',
  description: '创建汇合节点，合并多条剧情分支。',
  parameters: z.object({
    branch_ids: z.string().describe('要合并的分支ID（逗号分隔，至少2个）'),
    convergence_title: z.string().describe('汇合节点标题'),
  }),
  permissionLevel: 'write',
  execute: async ({ branch_ids, convergence_title }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const tree = loadTree(bookDir)
    if (!tree) return 'Error: No plot tree exists.'
    const ids = branch_ids.split(',').map(s => s.trim())
    if (ids.length < 2) return 'Error: Need at least 2 branch IDs to merge.'
    const nodes = (tree.nodes ?? {}) as Record<string, Record<string, unknown>>
    const convId = `convergence_${Date.now()}`
    nodes[convId] = {
      id: convId,
      type: 'convergence',
      title: convergence_title,
      merges: ids,
      status: 'confirmed',
      created_at: new Date().toISOString(),
    }
    tree.nodes = nodes
    saveTree(bookDir, tree)
    return `Convergence node created: ${convId} merging [${ids.join(', ')}]`
  },
}
