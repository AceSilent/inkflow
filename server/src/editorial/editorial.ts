/**
 * submit_to_editorial — Tool for Author Agent to submit drafts
 * to the Editorial Department. Default machine review runs the focused
 * lore/causality reviewers; other prose-quality decisions are human-gated.
 *
 * Returns structured JSON feedback that the Author can use
 * to self-revise in the same agent loop.
 * Results are auto-persisted to 04_Drafts/review_{chapterId}.json.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition, type ToolProgressEvent } from '../tools/base-tool.js'
import {
  runEditorialPipeline,
  type EditorialResult,
  type EditorialReviewerName,
  type ReviewScope,
} from './pipeline.js'
import { MIN_REVIEW_DRAFT_CHARS } from '../tools/write-tools.js'
import { formatDraftSelfCheck, runDraftSelfCheck } from '../tools/draft-self-check.js'
import { persistChapterSummary } from '../memory/chapter-summarizer.js'
import { loadEditorialContextByDir } from './editorial-context.js'
import { editorialLLMConfig, reviewerLLMConfigs } from './model-config.js'
import { mergeTargetedReview, resolveReviewers } from './review-targeting.js'
import {
  STUCK_ROUND_THRESHOLD,
  persistReviewToDir,
  readPreviousReview,
  type PersistResult,
} from './review-persistence.js'

export { mergeTargetedReview } from './review-targeting.js'
export { issueFingerprint, persistReview, STUCK_ROUND_THRESHOLD } from './review-persistence.js'

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
  onProgress?: (event: ToolProgressEvent) => void | Promise<void>
  reviewScope?: ReviewScope
  reviewers?: EditorialReviewerName[]
  /** Human annotation/direct workbench re-review starts a fresh auto-revision budget. */
  resetAutoRevisionBudget?: boolean
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
    onProgress,
    reviewScope = 'full',
    reviewers,
    resetAutoRevisionBudget,
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
  const perReviewerConfigs = reviewerLLMConfigs(dataDir)
  const loaded = loadEditorialContextByDir(bookDir, chapterId)
  const previousReview = readPreviousReview(bookDir, chapterId)
  const resolvedReview = resolveReviewers(reviewScope, reviewers, previousReview)

  const rawResult: EditorialResult = await runEditorialPipeline(
    draftText,
    {
      bookTone, bookGenre,
      povCharacter, setting,
      sceneTarget, logicChain, emotionalArc, focusPoint,
      // Thread bookDir + chapterId so the causality reviewer can pull a
      // plot-graph slice (chapter subgraph + unresolved setups) into its prompt.
      bookDir, chapterId,
      onProgress,
      reviewers: resolvedReview.reviewers,
      reviewerLLMConfigs: perReviewerConfigs,
      ...loaded,
    },
    llmConfig,
    promptsDir,
  )

  const result = mergeTargetedReview(
    previousReview,
    rawResult,
    resolvedReview.reviewers,
    resolvedReview.scope,
  )

  const persist = persistReviewToDir(bookDir, chapterId, result, { resetAutoRevisionBudget })

  // Fire-and-forget memory extraction — failure must NEVER affect main response.
  // Runs for every editorial round (pass or fail): lessons from failed reviews are
  // just as valuable as those from passing ones for craft-skill accumulation.
  ;(async () => {
    try {
      const { extractMemories, ingestExtracted } = await import('../memory/extractor.js')
      const extracted = await extractMemories({
        event: 'editorial_return',
        llmConfig,
        recentHistory: [],
        editorialSummary: result.merged_summary,
        bookId,
        currentChapter: chapterId,
      })
      if (extracted.length > 0) {
        await ingestExtracted(dataDir, extracted)
      }
    } catch (e) {
      console.warn('[editorial] memory extraction failed:', e)
    }
  })()

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
    '将草稿提交给机器慢审。默认只跑两个审稿人：设定考据（editorial_lore）与逻辑审核（editorial_causality）。',
    '慢审只负责设定和因果风险，不评判网文性、AI味、节奏或人物魅力；这些由人类在工作台拍板。',
    '初审默认 full；轻微小修后可用 failed_only 只复审上轮未过的设定/逻辑审稿人，系统会与上一轮结果合并。最终章节定稿仍需要人类在工作台明确通过。',
    '审核结果包含各审稿人的pass/fail状态、具体问题列表和修改指令。',
    '审核结果自动保存到 04_Drafts/review_{chapterId}.json。',
    `硬性篇幅门槛：draft_text 与已保存草稿都必须至少 ${MIN_REVIEW_DRAFT_CHARS} 字；不足时不要送审，先局部扩写或重写。`,
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
    review_scope: z.enum(['full', 'failed_only', 'targeted']).optional().describe('审核范围。full=默认设定/逻辑两审；failed_only=只复审上一轮未过审稿人并合并旧结果；targeted=只跑 reviewers 指定的审稿人。章节最终定稿必须由人类在工作台通过。'),
    reviewers: z.array(z.enum([
      'editorial_lore',
      'editorial_causality',
    ])).optional().describe('review_scope=targeted 时指定要跑的审稿人列表。'),
    reset_auto_revision_budget: z.boolean().optional().describe('人类批注或明确人工介入后设为 true，用于开启新的自动修订批次，避免沿用旧失败轮次。普通 Agent 自修不要设置。'),
  }),
  permissionLevel: 'read',
  category: '编辑部',
  execute: async ({
    draft_text, chapter_id, book_tone, book_genre,
    pov_character, setting, scene_target, logic_chain, emotional_arc, focus_point,
    review_scope, reviewers, reset_auto_revision_budget,
  }, ctx) => {
    // Guard 1: draft_text must pass the hard reviewable-chapter floor.
    if (draft_text.length < MIN_REVIEW_DRAFT_CHARS) {
      return [
        `Error: draft_text 只有 ${draft_text.length} 字，少于送审最低要求 ${MIN_REVIEW_DRAFT_CHARS} 字。`,
        '先用 load_skill("chapter_edit") 进行局部扩写，或 load_skill("chapter_rewrite") 整章重写；补足动作、环境、对话、内心和冲突收束后，再 save_draft 并重新送审。',
      ].join('\n')
    }

    // Guard 2: the corresponding saved draft must exist. This forces the flow
    // save_draft → submit_to_editorial and blocks submitting un-persisted text.
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const draftPath = path.join(bookDir, '04_Drafts', `${chapter_id}.md`)
    if (!fs.existsSync(draftPath)) {
      return `Error: 未找到 04_Drafts/${chapter_id}.md。先用 save_draft 保存 ${chapter_id} 的正文，再调 submit_to_editorial——不要绕过 save_draft 直接送审。`
    }
    const savedDraftText = fs.readFileSync(draftPath, 'utf8')
    if (savedDraftText.length < MIN_REVIEW_DRAFT_CHARS) {
      return [
        `Error: 已保存草稿 04_Drafts/${chapter_id}.md 只有 ${savedDraftText.length} 字，少于送审最低要求 ${MIN_REVIEW_DRAFT_CHARS} 字。`,
        '先扩写并再次 save_draft，确保磁盘草稿与送审文本都达标，再调用 submit_to_editorial。',
      ].join('\n')
    }
    const selfCheck = runDraftSelfCheck(savedDraftText, {
      minReviewChars: MIN_REVIEW_DRAFT_CHARS,
      bookDir,
    })
    if (selfCheck.blockEditorial) {
      return [
        'Error: 保存草稿未通过本地快速自检，暂不进入慢审稿。',
        formatDraftSelfCheck(selfCheck),
        '',
        '请先 load_skill("chapter_edit")，按自检问题快速删改、压缩或补桥段，再 save_draft。自检严重项清掉后再 submit_to_editorial。',
      ].join('\n')
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
        reviewScope: review_scope,
        reviewers,
        resetAutoRevisionBudget: reset_auto_revision_budget,
        onProgress: ctx.emitProgress,
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
      if (!result.overall_pass) {
        summary = [
          `修订策略：${result.revision_strategy.action}（${result.revision_strategy.grade}，score=${result.revision_strategy.score}）`,
          `原因：${result.revision_strategy.reason}`,
          `指令：${result.revision_strategy.instruction}`,
          `复审范围建议：${result.revision_strategy.recommended_review_scope}；目标审稿人：${result.revision_strategy.target_reviewers.join('、') || '无'}`,
          '',
          `【本轮修订简报】`,
          result.revision_strategy.revision_brief,
          '',
          summary,
        ].join('\n')
      }
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
        requires_human_approval: true,
        revision_round: result.revision_round,
        revision_strategy: result.revision_strategy,
        review_scope: result.review_scope,
        reviewed_reviewers: result.reviewed_reviewers,
        carried_forward_reviewers: result.carried_forward_reviewers,
        persistent_issues: result.persistent_issues,
        summary,
        feedbacks: leanFeedbacks,
      }, null, 2)
    } catch (err) {
      return `编辑部审核出错: ${String(err)}`
    }
  },
}
