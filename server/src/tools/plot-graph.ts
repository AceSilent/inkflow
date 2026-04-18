/**
 * Plot graph tools — Agent-facing interface for the DAG-based plot graph.
 *
 * Replaces the legacy plot-tree tools. Node types are narrowed (no chapter/arc —
 * channel planning belongs in the outline). New tools: add_edge, remove_edge,
 * query_unresolved_setups. Merges are modeled as a convergence node + add_edge.
 */
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
      const refs = (args.references || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const chars = (args.characters || '').split(',').map((s: string) => s.trim()).filter(Boolean)
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
    const withSpan = unresolved.map((s) => {
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
