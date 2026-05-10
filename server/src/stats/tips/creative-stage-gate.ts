import path from 'path'
import fs from 'fs'
import { type BlockedToolCall, type ToolHooks } from '../../tools/base-tool.js'
import { getCreativeStageStatus } from '../../agent/creative-stage.js'
import { type RuleContext, fireOnce } from './types.js'
import { sanitizePathSegment } from '../../utils/path-sanitizer.js'

const PLOT_NODE_LIMIT_PER_TURN = 12
const PLOT_EDGE_LIMIT_PER_TURN = 16

function currentBookDir(ctx: RuleContext): string {
  return path.join(ctx.dataDir, ctx.bookId)
}

function block(message: string): BlockedToolCall {
  return { block: true, message }
}

function draftExists(bookDir: string, chapterId: string): boolean {
  const safe = sanitizePathSegment(chapterId.replace(/\.md$/i, ''), 'chapter_id')
  const file = path.join(bookDir, '04_Drafts', `${safe}.md`)
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 2
  } catch {
    return false
  }
}

function completedPlusCurrent(ctx: RuleContext, toolName: string): number {
  return (ctx.callsThisStream.get(toolName) ?? 0) + 1
}

export function creativeStageGate(ctx: RuleContext): ToolHooks {
  return {
    interceptToolCall(name, args): BlockedToolCall | undefined {
      if (name === 'add_plot_node' && completedPlusCurrent(ctx, name) > PLOT_NODE_LIMIT_PER_TURN) {
        fireOnce(ctx, 'creative_stage_plot_node_budget', {
          severity: 'warning',
          title: '剧情图扩展过多',
          message: '本轮新增剧情节点已超过建议上限。请先总结当前图谱并进入下一阶段，避免无限扩图。',
        })
        return block('本轮新增剧情节点过多。请先停止扩图，总结已有主线、伏笔、转折与收束，再根据用户意图决定是否进入正文或等待确认。')
      }

      if (name === 'add_edge' && completedPlusCurrent(ctx, name) > PLOT_EDGE_LIMIT_PER_TURN) {
        fireOnce(ctx, 'creative_stage_plot_edge_budget', {
          severity: 'warning',
          title: '剧情图连线过多',
          message: '本轮新增剧情边已超过建议上限。请先收束剧情图，不要继续机械加边。',
        })
        return block('本轮新增剧情边过多。请先停止扩图，总结关键因果链和未回收伏笔，再进入下一阶段或等待确认。')
      }

      if (name === 'save_draft') {
        const status = getCreativeStageStatus(currentBookDir(ctx))
        if (status.blockers.length === 0) return undefined
        fireOnce(ctx, 'creative_stage_before_draft', {
          severity: 'warning',
          title: '正文阶段条件不足',
          message: `还不能保存正文草稿：${status.blockers.join('；')}。`,
        })
        return block(`正文阶段条件不足：${status.blockers.join('；')}。请先自然地与用户确认创作意图，并通过工具完成设定库、大纲和剧情图；完成后再写正文。`)
      }

      if (name === 'submit_to_editorial') {
        const bookDir = currentBookDir(ctx)
        const status = getCreativeStageStatus(bookDir)
        const chapterId = typeof args?.chapter_id === 'string'
          ? args.chapter_id
          : status.metrics.currentChapterId ?? 'ch01'
        if (draftExists(bookDir, chapterId)) return undefined
        fireOnce(ctx, 'creative_stage_before_review', {
          severity: 'warning',
          title: '送审前缺少草稿',
          message: `当前还没有可送审的 ${chapterId} 草稿。请先完成正文并 save_draft。`,
        })
        return block(`当前还没有 ${chapterId} 草稿，不能送审。请先完成正文并 save_draft。`)
      }

      return undefined
    },
  }
}
