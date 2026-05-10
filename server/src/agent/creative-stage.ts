import fs from 'fs'
import path from 'path'

export type CreativeStageId =
  | 'story_bible'
  | 'outline'
  | 'plot_graph'
  | 'chapter_draft'
  | 'human_review'
  | 'editorial_review'
  | 'revision'

export interface CreativeStageStatus {
  stage: CreativeStageId
  label: string
  nextAction: string
  blockers: string[]
  metrics: {
    hasStyleProfile: boolean
    hasCharacters: boolean
    hasWorldLore: boolean
    hasOutline: boolean
    plotNodes: number
    plotEdges: number
    hasFirstDraft: boolean
    hasFirstReview: boolean
    firstReviewPassed: boolean
    firstHumanApproved: boolean
    currentChapterId?: string
    plannedChapters: number
    passedChapters: number
  }
}

function existsNonEmpty(file: string): boolean {
  try {
    return fs.existsSync(file) && fs.statSync(file).size > 2
  } catch {
    return false
  }
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function countCollection(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function reviewPassed(review: any): boolean {
  return review?.overall_pass === true || review?.summary?.overall_pass === true
}

function userApproved(bookDir: string, chapterId: string): boolean {
  const status = readJson(path.join(bookDir, '04_Drafts', `chapter_status_${chapterId}.json`))
  return status?.user_decision === 'approved'
}

function chapterPassed(bookDir: string, chapterId: string): boolean {
  return userApproved(bookDir, chapterId)
}

function collectChapterIds(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'chapter' && typeof node.id === 'string') out.push(node.id)
  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) collectChapterIds(child, out)
  return out
}

function readOutlineChapterIds(bookDir: string): string[] {
  const outline = readJson(path.join(bookDir, '02_Outlines', 'outline.json'))
  const ids = collectChapterIds(outline)
  return ids.length > 0 ? ids : ['ch01']
}

export function getCreativeStageStatus(bookDir: string): CreativeStageStatus {
  const styleProfileFile = path.join(bookDir, '01_Global_Settings', 'style_profile.json')
  const charactersFile = path.join(bookDir, '01_Global_Settings', 'characters.json')
  const worldLoreFile = path.join(bookDir, '01_Global_Settings', 'world_lore.json')
  const outlineFile = path.join(bookDir, '02_Outlines', 'outline.json')
  const graphFile = path.join(bookDir, 'plot_graph.json')
  const firstDraftFile = path.join(bookDir, '04_Drafts', 'ch01.md')
  const firstReviewFile = path.join(bookDir, '04_Drafts', 'review_ch01.json')

  const graph = readJson(graphFile)
  const review = readJson(firstReviewFile)
  const outlineChapterIds = readOutlineChapterIds(bookDir)
  const passedChapters = outlineChapterIds.filter((id) => chapterPassed(bookDir, id)).length
  const currentChapterId = outlineChapterIds.find((id) => !chapterPassed(bookDir, id))
    ?? outlineChapterIds[outlineChapterIds.length - 1]

  const metrics = {
    hasStyleProfile: existsNonEmpty(styleProfileFile),
    hasCharacters: existsNonEmpty(charactersFile),
    hasWorldLore: existsNonEmpty(worldLoreFile),
    hasOutline: existsNonEmpty(outlineFile),
    plotNodes: countCollection(graph?.nodes),
    plotEdges: countCollection(graph?.edges),
    hasFirstDraft: existsNonEmpty(firstDraftFile),
    hasFirstReview: existsNonEmpty(firstReviewFile),
    firstReviewPassed: reviewPassed(review),
    firstHumanApproved: userApproved(bookDir, 'ch01'),
    currentChapterId,
    plannedChapters: outlineChapterIds.length,
    passedChapters,
  }

  const blockers: string[] = []
  if (!metrics.hasCharacters) blockers.push('角色设定库未保存')
  if (!metrics.hasWorldLore) blockers.push('世界观 lore 未保存')
  if (!metrics.hasOutline) blockers.push('10 章大纲未保存')
  if (metrics.plotNodes < 4 || metrics.plotEdges < 1) blockers.push('剧情图还不够支撑正文')

  if (!metrics.hasCharacters || !metrics.hasWorldLore) {
    return {
      stage: 'story_bible',
      label: '设定库',
      nextAction: '先把用户意图、参考文风、主角气质、世界观规则沉淀到 lore。',
      blockers,
      metrics,
    }
  }

  if (!metrics.hasOutline) {
    return {
      stage: 'outline',
      label: '大纲',
      nextAction: '创建规范 book / volume / chapter 大纲，并明确 10 章目标、冲突和收束点。',
      blockers,
      metrics,
    }
  }

  if (metrics.plotNodes < 4 || metrics.plotEdges < 1) {
    return {
      stage: 'plot_graph',
      label: '剧情图',
      nextAction: '创建开局事件、主线目标、关键伏笔、turning_point、convergence 和至少一条因果边。',
      blockers,
      metrics,
    }
  }

  const currentDraftFile = currentChapterId
    ? path.join(bookDir, '04_Drafts', `${currentChapterId}.md`)
    : firstDraftFile
  const currentReviewFile = currentChapterId
    ? path.join(bookDir, '04_Drafts', `review_${currentChapterId}.json`)
    : firstReviewFile
  const hasCurrentDraft = existsNonEmpty(currentDraftFile)
  const hasCurrentReview = existsNonEmpty(currentReviewFile)
  const currentReview = readJson(currentReviewFile)
  const currentPassed = currentChapterId ? chapterPassed(bookDir, currentChapterId) : false

  if (currentChapterId && passedChapters >= outlineChapterIds.length && outlineChapterIds.length > 0) {
    return {
      stage: 'outline',
      label: '下一阶段大纲',
      nextAction: '当前大纲章节已全部通过；请总结本阶段成果，再扩展下一阶段大纲、设定和剧情图。',
      blockers: [],
      metrics,
    }
  }

  if (!hasCurrentDraft) {
    return {
      stage: 'chapter_draft',
      label: '章节正文',
      nextAction: `开始生成 ${currentChapterId ?? 'ch01'}；写作前读取设定、大纲、剧情图和文风控制面。正文阶段允许多次草稿迭代，直到本章目标完成后再送审。`,
      blockers: [],
      metrics,
    }
  }

  if (!hasCurrentReview) {
    return {
      stage: 'human_review',
      label: '人审',
      nextAction: `${currentChapterId ?? '当前章节'} 已有草稿。先让人类快速判断：可直接通过进入下一章，或批注退回，或再送设定/逻辑慢审。`,
      blockers: [],
      metrics,
    }
  }

  if (!reviewPassed(currentReview)) {
    return {
      stage: 'revision',
      label: '修订',
      nextAction: `围绕 ${currentChapterId ?? '当前章节'} 修订设定/逻辑问题；通过慢审或人类改判前不要进入下一章。`,
      blockers: [],
      metrics,
    }
  }

  if (!currentPassed) {
    return {
      stage: 'human_review',
      label: '终审',
      nextAction: `${currentChapterId ?? '当前章节'} 的设定/逻辑慢审已通过。等待人类终审：可以通过进入下一章，也可以拦截批注。`,
      blockers: [],
      metrics,
    }
  }

  return {
    stage: 'chapter_draft',
    label: '章节正文',
    nextAction: '继续下一章；写 chN 前确认 chN-1 已由人类明确通过。',
    blockers: [],
    metrics,
  }
}

export function buildCreativeStagePrompt(bookDir: string): string {
  const status = getCreativeStageStatus(bookDir)
  const lines = [
    `当前阶段：${status.label}`,
    `下一步：${status.nextAction}`,
    '',
    '阶段门控：设定库 → 大纲 → 剧情图 → 章节正文 → 人审 → 可选设定/逻辑慢审 → 人类终审。可以自然回应用户，但不要跳过未完成阶段。',
    `状态：文风控制面=${status.metrics.hasStyleProfile ? '已保存' : '缺失'}；角色=${status.metrics.hasCharacters ? '已保存' : '缺失'}；世界观=${status.metrics.hasWorldLore ? '已保存' : '缺失'}；大纲=${status.metrics.hasOutline ? '已保存' : '缺失'}；剧情图=${status.metrics.plotNodes} 节点/${status.metrics.plotEdges} 边；ch01=${status.metrics.hasFirstDraft ? '有草稿' : '无草稿'}；ch01慢审=${status.metrics.hasFirstReview ? (status.metrics.firstReviewPassed ? '通过' : '未通过') : '未送审'}；ch01人审=${status.metrics.firstHumanApproved ? '通过' : '未通过'}。`,
  ]
  if (status.blockers.length > 0) {
    lines.push('', '当前阻塞：', ...status.blockers.map((b) => `- ${b}`))
  }
  return lines.join('\n')
}
