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
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'
import { collectChapters } from '../utils/outline.js'

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
  const chapters = collectChapters(outline)
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

function loadEditorialContextByDir(bookDir: string, chapterId: string): Pick<EditorialContext, 'charactersInfo' | 'worldLore' | 'outlineContext'> {
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
  return persistReviewToDir(path.join(dataDir, bookId), chapterId, result)
}

/**
 * Same as persistReview, but takes a pre-joined bookDir. Used by
 * runEditorialPipelineForChapter where the caller (e.g. the workbench route)
 * already has bookDir and shouldn't need to split it back into dataDir + bookId.
 */
function persistReviewToDir(
  bookDir: string,
  chapterId: string,
  result: EditorialResult,
): PersistResult {
  const reviewPath = path.join(ensureDir(path.join(bookDir, '04_Drafts')), `review_${chapterId}.json`)

  // Load previous round's state for convergence tracking.
  const prev = safeReadJson<{ revision_round?: number; issue_history?: IssueHistory }>(reviewPath)
  const prevRound = typeof prev?.revision_round === 'number' ? prev.revision_round : 0
  const prevHistory: IssueHistory = (prev?.issue_history && typeof prev.issue_history === 'object')
    ? prev.issue_history
    : {}
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

  writeJson(reviewPath, {
    overall_pass: result.overall_pass,
    revision_round,
    feedbacks: result.feedbacks,
    merged_summary: result.merged_summary,
    issue_history: nextHistory,
    reviewed_at: new Date().toISOString(),
  })

  return { revision_round, persistent_issues }
}

/**
 * Result returned by runEditorialPipelineForChapter — the bare EditorialResult
 * plus the persistence metadata the caller needs for convergence messaging.
 *
 * We extend EditorialResult rather than returning a tuple so that callers which
 * only care about the review data (e.g. the workbench /resubmit-review route)
 * can just return the whole object as JSON without juggling two shapes.
 */
export interface RunEditorialPipelineResult extends EditorialResult {
  revision_round: number
  persistent_issues: PersistResult['persistent_issues']
}

export interface RunEditorialPipelineForChapterArgs {
  /** `{dataDir}/{bookId}` — already sanitised and joined by the caller. */
  bookDir: string
  chapterId: string
  draftText: string
  bookTone?: string
  bookGenre?: string
  povCharacter?: string
  setting?: string
  sceneTarget?: string
  logicChain?: string
  emotionalArc?: string
  focusPoint?: string
}

/**
 * Core editorial flow factored out of `submitToEditorialTool.execute` so both
 * the tool and HTTP routes (e.g. workbench /resubmit-review) can invoke it
 * without duplicating context loading, pipeline execution, and persistence.
 *
 * Side effects:
 *   - Writes 04_Drafts/review_{chapterId}.json (via persistReviewToDir)
 *   - On pass, updates project memory via persistChapterSummary
 *
 * Does NOT:
 *   - Enforce the save_draft-first guard (caller decides — the tool wants it,
 *     the workbench route has already verified the draft file exists)
 *   - Format the Author-facing summary string (that's tool-specific UX)
 */
export async function runEditorialPipelineForChapter(
  args: RunEditorialPipelineForChapterArgs,
): Promise<RunEditorialPipelineResult> {
  const {
    bookDir, chapterId, draftText,
    bookTone, bookGenre, povCharacter, setting,
    sceneTarget, logicChain, emotionalArc, focusPoint,
  } = args

  const promptsDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
    '../../../prompts'
  )

  // bookDir is `{dataDir}/{bookId}` by construction; split it back for helpers
  // that haven't been migrated to a bookDir-only signature yet.
  const dataDir = path.dirname(bookDir)
  const bookId = path.basename(bookDir)

  const llmConfig = editorialLLMConfig(dataDir)
  const loaded = loadEditorialContextByDir(bookDir, chapterId)

  const result: EditorialResult = await runEditorialPipeline(
    draftText,
    {
      bookTone, bookGenre,
      povCharacter, setting,
      sceneTarget, logicChain, emotionalArc, focusPoint,
      ...loaded,
    },
    llmConfig,
    promptsDir,
  )

  const persist = persistReviewToDir(bookDir, chapterId, result)

  // Once a chapter clears editorial, fold its summary + character states into
  // project memory so the next chapter sees the updated continuity context.
  // Awaited (not fire-and-forget) so the next agent call reads fresh memory;
  // failures are swallowed — a memory-summary failure must not downgrade a
  // "chapter passed" result to a 500.
  if (result.overall_pass) {
    try {
      await persistChapterSummary({
        dataDir, bookId, chapterId,
        draftText,
        llmConfig,
        promptsDir,
      })
    } catch {
      // swallow — do not let summary persistence break the editorial flow
    }
  }

  return {
    ...result,
    revision_round: persist.revision_round,
    persistent_issues: persist.persistent_issues,
  }
}

export const submitToEditorialTool: ToolDefinition = {
  name: 'submit_to_editorial',
  description: [
    '将草稿提交给编辑部进行专项审核。5个审稿人（设定、节奏、文风、角色、因果）并行评审。',
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
    // Guard 1: draft_text must pass the same "not an empty shell" floor as save_draft.
    // Prevents the agent from calling submit_to_editorial with a placeholder and
    // getting a free ✅ before save_draft has been run at all.
    if (draft_text.length < MIN_DRAFT_CHARS) {
      return `Error: draft_text 只有 ${draft_text.length} 字，少于最低要求 ${MIN_DRAFT_CHARS} 字。先用 save_draft 写出完整章节正文，再把完整正文提交审稿。`
    }

    // Guard 2: the corresponding saved draft must exist. This forces the flow
    // save_draft → submit_to_editorial and blocks submitting un-persisted text.
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const draftPath = path.join(bookDir, '04_Drafts', `${chapter_id}.md`)
    if (!fs.existsSync(draftPath)) {
      return `Error: 未找到 04_Drafts/${chapter_id}.md。先用 save_draft 保存 ${chapter_id} 的正文，再调 submit_to_editorial——不要绕过 save_draft 直接送审。`
    }

    try {
      // Delegate the actual pipeline run + persistence to the shared helper so
      // the HTTP resubmit-review route (which doesn't go through the Author
      // Agent) runs exactly the same code path as the agent tool.
      const result = await runEditorialPipelineForChapter({
        bookDir,
        chapterId: chapter_id,
        draftText: draft_text,
        bookTone: book_tone,
        bookGenre: book_genre,
        povCharacter: pov_character,
        setting,
        sceneTarget: scene_target,
        logicChain: logic_chain,
        emotionalArc: emotional_arc,
        focusPoint: focus_point,
      })

      // Inline tool result for Author — strip `thinking` from each feedback to
      // keep the agent's context lean. Full thinking traces stay in the
      // persisted review_{chapterId}.json file for human inspection.
      const leanFeedbacks = result.feedbacks.map(({ thinking: _t, ...rest }) => rest)

      // Convergence banner: if the same issue has been flagged across
      // STUCK_ROUND_THRESHOLD or more rounds, prepend a loud warning to the
      // summary pointing the agent at request_guidance() instead of another
      // blind rewrite. Without this, agent loops forever on unsolvable items.
      let summary = result.merged_summary
      if (result.persistent_issues.length > 0) {
        const lines = result.persistent_issues.map(p =>
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
        revision_round: result.revision_round,
        persistent_issues: result.persistent_issues,
        summary,
        feedbacks: leanFeedbacks,
      }, null, 2)
    } catch (err) {
      return `编辑部审核出错: ${String(err)}`
    }
  },
}
