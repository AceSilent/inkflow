/**
 * submit_to_editorial — Tool for Author Agent to submit drafts
 * to the Editorial Department (3 parallel reviewers).
 *
 * Returns structured JSON feedback that the Author can use
 * to self-revise in the same agent loop.
 * Results are auto-persisted to 04_Drafts/review_{chapterId}.json.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition, type ToolContext } from '../tools/base-tool.js'
import { runEditorialPipeline, type EditorialResult, type EditorialContext } from './pipeline.js'
import { type LLMConfig } from '../llm/provider.js'
import { getSettings } from '../routes/settings.js'
import { MIN_DRAFT_CHARS } from '../tools/write-tools.js'
import { persistChapterSummary } from '../memory/chapter-summarizer.js'

/**
 * LLM config for editorial reviewers.
 *
 * Resolution order: editorModel → authorModel → env.
 * (We intentionally DROPPED the old `readerModel` step and the `gpt-4o-mini`
 *  fallback — a reviewer weaker than the author is a known anti-pattern: the
 *  weak reviewer rubber-stamps prose it can't actually evaluate, producing
 *  false ✅s. If the user wants a cheaper reviewer, set editorModel explicitly
 *  via settings — don't let it silently degrade.)
 */
function editorialLLMConfig(dataDir: string): LLMConfig {
  const settings = getSettings(dataDir)
  // Fall back to authorModel (same tier as the writer) rather than to a
  // weaker readerModel — reviewer weaker than author → false passes.
  const modelSelector = settings.editorModel || settings.authorModel || ''

  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return { apiKey: provider.apiKey, baseURL: provider.baseUrl, model }
    }
  }

  // Env fallback. EDITORIAL_MODEL takes precedence if set; otherwise use the
  // same LLM_MODEL the author is on. No hidden "cheap default" — if nothing
  // is configured, that's a setup error the user should see.
  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.EDITORIAL_MODEL || process.env.LLM_MODEL || '',
  }
}

// ── Lore / outline context loaders ──

function safeReadJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Render the characters database into a reviewer-friendly bullet list.
 * Keeps it compact so the prompt stays under token budget.
 */
function formatCharacters(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return ''
  const lines: string[] = []
  for (const [name, val] of entries) {
    if (val && typeof val === 'object') {
      const summary = JSON.stringify(val)
      lines.push(`- ${name}: ${summary.length > 400 ? summary.slice(0, 400) + '…' : summary}`)
    } else {
      lines.push(`- ${name}: ${String(val)}`)
    }
  }
  return lines.join('\n')
}

function formatWorldLore(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (typeof data !== 'object') return String(data)
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      const body = typeof v === 'string' ? v : JSON.stringify(v)
      return `- **${k}**: ${body.length > 500 ? body.slice(0, 500) + '…' : body}`
    })
    .join('\n')
}

/**
 * Walk the outline tree, find the target chapter node, and return a
 * compact "current chapter + previous chapter" summary block to give the
 * reviewers the minimum narrative context they need.
 */
function formatOutlineContext(outline: unknown, chapterId: string): string {
  if (!outline || typeof outline !== 'object') return ''
  const chapters: Array<{ id: string; label?: string; summary?: string }> = []
  const walk = (node: any): void => {
    if (!node) return
    if (node.type === 'chapter') {
      chapters.push({ id: node.id, label: node.label, summary: node.summary })
    }
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(outline)

  const idx = chapters.findIndex(c => c.id === chapterId)
  if (idx < 0) return ''

  const parts: string[] = []
  if (idx > 0) {
    const prev = chapters[idx - 1]
    parts.push(`【前一章 ${prev.id}${prev.label ? ' · ' + prev.label : ''}】\n${prev.summary ?? '(无摘要)'}`)
  }
  const cur = chapters[idx]
  parts.push(`【本章 ${cur.id}${cur.label ? ' · ' + cur.label : ''}】\n${cur.summary ?? '(无摘要)'}`)
  return parts.join('\n\n')
}

function loadEditorialContext(dataDir: string, bookId: string, chapterId: string): Pick<EditorialContext, 'charactersInfo' | 'worldLore' | 'outlineContext'> {
  const bookDir = path.join(dataDir, bookId)
  const characters = safeReadJson(path.join(bookDir, '01_Global_Settings', 'characters.json'))
  const worldLore = safeReadJson(path.join(bookDir, '01_Global_Settings', 'world_lore.json'))
  const outline = safeReadJson(path.join(bookDir, '02_Outlines', 'outline.json'))

  return {
    charactersInfo: formatCharacters(characters),
    worldLore: formatWorldLore(worldLore),
    outlineContext: formatOutlineContext(outline, chapterId),
  }
}

// ── Convergence tracking ──
// Same issue flagged across revisions = the author is spinning. After N rounds
// we surface it so the agent can escalate to request_guidance() instead of
// rewriting forever.

/**
 * Rounds-same-issue ≥ this count → emit convergence warning.
 */
export const STUCK_ROUND_THRESHOLD = 3

export interface IssueHistoryEntry {
  first_seen_round: number
  count: number
}

export type IssueHistory = Record<string, IssueHistoryEntry>

export interface PersistResult {
  revision_round: number
  /** Issues present in the current round that have been flagged ≥ STUCK_ROUND_THRESHOLD consecutive rounds. */
  persistent_issues: Array<{ fingerprint: string; count: number; first_seen_round: number }>
}

/**
 * Build a stable fingerprint for an issue. Uses reviewer + type + a prefix of
 * quote (or fix_instruction as fallback) so trivial LLM wording changes
 * don't mask the fact that it's the same underlying complaint.
 */
export function issueFingerprint(reviewer: string, issue: { type?: string; quote?: string; fix_instruction?: string }): string {
  const type = issue.type ?? 'unknown'
  const text = (issue.quote ?? issue.fix_instruction ?? '').trim().slice(0, 60)
  return `${reviewer}::${type}::${text}`
}

export function persistReview(
  dataDir: string,
  bookId: string,
  chapterId: string,
  result: EditorialResult,
): PersistResult {
  const draftsDir = path.join(dataDir, bookId, '04_Drafts')
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true })
  }
  const reviewPath = path.join(draftsDir, `review_${chapterId}.json`)

  // Load previous round's state for convergence tracking.
  let prevRound = 0
  let prevHistory: IssueHistory = {}
  if (fs.existsSync(reviewPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))
      if (typeof prev.revision_round === 'number') prevRound = prev.revision_round
      if (prev.issue_history && typeof prev.issue_history === 'object') {
        prevHistory = prev.issue_history as IssueHistory
      }
    } catch { /* ignore corrupt prior file */ }
  }
  const revision_round = prevRound + 1

  // Update history: issues present this round inherit (and increment) the
  // previous count; anything not present this round drops off.
  const nextHistory: IssueHistory = {}
  const persistent_issues: PersistResult['persistent_issues'] = []
  for (const fb of result.feedbacks) {
    for (const issue of fb.issues) {
      const fp = issueFingerprint(fb.reviewer, issue)
      const prev = prevHistory[fp]
      const entry: IssueHistoryEntry = prev
        ? { first_seen_round: prev.first_seen_round, count: prev.count + 1 }
        : { first_seen_round: revision_round, count: 1 }
      nextHistory[fp] = entry
      if (entry.count >= STUCK_ROUND_THRESHOLD) {
        persistent_issues.push({ fingerprint: fp, count: entry.count, first_seen_round: entry.first_seen_round })
      }
    }
  }

  fs.writeFileSync(reviewPath, JSON.stringify({
    overall_pass: result.overall_pass,
    revision_round,
    feedbacks: result.feedbacks,
    merged_summary: result.merged_summary,
    issue_history: nextHistory,
    reviewed_at: new Date().toISOString(),
  }, null, 2), 'utf-8')

  return { revision_round, persistent_issues }
}

export const submitToEditorialTool: ToolDefinition = {
  name: 'submit_to_editorial',
  description: [
    '将草稿提交给编辑部进行专项审核。3个审稿人（设定、节奏、文风）并行评审。',
    '审核结果包含各审稿人的pass/fail状态、具体问题列表和修改指令。',
    '审核结果自动保存到 04_Drafts/review_{chapterId}.json。',
    '收到反馈后，你应该根据反馈自主修改草稿。',
  ].join('\n'),
  parameters: z.object({
    draft_text: z.string().describe('要审核的草稿文本'),
    chapter_id: z.string()
      .regex(/^ch\d{1,4}$/i, "chapter_id 必须是 'ch{N}' 形式（如 ch01）。和 save_draft 的 ch{N}.md 文件名对齐，review 才会保存到 review_ch{N}.json，前端章节卡片才能配对显示审稿结果。")
      .describe("章节 ID，必须是 'ch{N}' 形式（如 ch01, ch02）。审稿结果保存到 04_Drafts/review_{chapter_id}.json"),
    book_tone: z.string().optional().describe('书籍基调，如"热血玄幻"'),
    book_genre: z.string().optional().describe('书籍类型，如"玄幻"'),
    pov_character: z.string().optional().describe('本场景主视角角色名；帮助设定审稿人聚焦角色一致性'),
    setting: z.string().optional().describe('本场景地点/时空/环境一句话描述'),
    scene_target: z.string().optional().describe('本场景叙事目标，例如"点燃男主复仇动机"'),
    logic_chain: z.string().optional().describe('本场景核心因果链，可留空'),
    emotional_arc: z.string().optional().describe('本场景情绪起落路径，可留空'),
    focus_point: z.string().optional().describe('本场景重点描写对象，可留空'),
  }),
  permissionLevel: 'read',
  category: '编辑部',
  execute: async ({
    draft_text, chapter_id, book_tone, book_genre,
    pov_character, setting, scene_target, logic_chain, emotional_arc, focus_point,
  }, ctx) => {
    const promptsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
      '../../../prompts'
    )

    // Guard 1: draft_text must pass the same "not an empty shell" floor as save_draft.
    // Prevents the agent from calling submit_to_editorial with a placeholder and
    // getting a free ✅ before save_draft has been run at all.
    if (draft_text.length < MIN_DRAFT_CHARS) {
      return `Error: draft_text 只有 ${draft_text.length} 字，少于最低要求 ${MIN_DRAFT_CHARS} 字。先用 save_draft 写出完整章节正文，再把完整正文提交审稿。`
    }

    // Guard 2: the corresponding saved draft must exist. This forces the flow
    // save_draft → submit_to_editorial and blocks submitting un-persisted text.
    const draftPath = path.join(ctx.dataDir, ctx.bookId, '04_Drafts', `${chapter_id}.md`)
    if (!fs.existsSync(draftPath)) {
      return `Error: 未找到 04_Drafts/${chapter_id}.md。先用 save_draft 保存 ${chapter_id} 的正文，再调 submit_to_editorial——不要绕过 save_draft 直接送审。`
    }

    const llmConfig = editorialLLMConfig(ctx.dataDir)
    const loaded = loadEditorialContext(ctx.dataDir, ctx.bookId, chapter_id)

    try {
      const result: EditorialResult = await runEditorialPipeline(
        draft_text,
        {
          bookTone: book_tone,
          bookGenre: book_genre,
          povCharacter: pov_character,
          setting,
          sceneTarget: scene_target,
          logicChain: logic_chain,
          emotionalArc: emotional_arc,
          focusPoint: focus_point,
          ...loaded,
        },
        llmConfig,
        promptsDir,
      )

      // Auto-persist review results + track convergence across rounds.
      let persist: PersistResult | null = null
      if (chapter_id && ctx.bookId && ctx.dataDir) {
        persist = persistReview(ctx.dataDir, ctx.bookId, chapter_id, result)
      }

      // Once a chapter clears the editorial gate, fold its summary +
      // character states into project memory so future chapters get the
      // continuity context. We await this (rather than fire-and-forget) so
      // the agent's next call already sees the updated memory — the slight
      // latency is worth deterministic memory state. Failure is logged but
      // does not break the editorial result; chapter is still "passed".
      if (result.overall_pass && chapter_id && ctx.bookId && ctx.dataDir) {
        await persistChapterSummary({
          dataDir: ctx.dataDir,
          bookId: ctx.bookId,
          chapterId: chapter_id,
          draftText: draft_text,
          llmConfig,
          promptsDir,
        })
      }

      // Inline tool result for Author — strip `thinking` from each feedback to
      // keep the agent's context lean. Full thinking traces stay in the
      // persisted review_{chapterId}.json file for human inspection.
      const leanFeedbacks = result.feedbacks.map(({ thinking: _t, ...rest }) => rest)

      // Convergence banner: if the same issue has been flagged across
      // STUCK_ROUND_THRESHOLD or more rounds, prepend a loud warning to the
      // summary pointing the agent at request_guidance() instead of another
      // blind rewrite. Without this, agent loops forever on unsolvable items.
      let summary = result.merged_summary
      if (persist && persist.persistent_issues.length > 0) {
        const lines = persist.persistent_issues.map(p =>
          `  · ${p.fingerprint}  (已累计 ${p.count} 轮)`
        )
        summary = [
          `⚠️ 收敛警告：以下问题已反复出现 ≥${STUCK_ROUND_THRESHOLD} 轮修改，继续自行改写大概率无效。`,
          `   建议调用 request_guidance() 把这些点抛给人类决策，而不是再写一遍。`,
          ...lines,
          '',
          summary,
        ].join('\n')
      }

      return JSON.stringify({
        overall_pass: result.overall_pass,
        revision_round: persist?.revision_round ?? 1,
        persistent_issues: persist?.persistent_issues ?? [],
        summary,
        feedbacks: leanFeedbacks,
      }, null, 2)
    } catch (err) {
      return `编辑部审核出错: ${String(err)}`
    }
  },
}
