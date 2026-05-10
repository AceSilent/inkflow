/**
 * Editorial Pipeline — focused machine review.
 *
 * Author Agent calls submit_to_editorial -> reviewers run in parallel ->
 * severity-weighted feedback returned to Author for self-revision.
 *
 * Default machine reviewers:
 *   1. 设定考据 (Lore Keeper) — lore consistency vs characters.json/world_lore
 *   2. 逻辑审核 (Causality & Foreshadow) — logic chain + hook bookkeeping
 */
import fs from 'fs'
import path from 'path'
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'
import { chapterSubgraph, unresolvedSetups } from '../services/plot-graph.js'
import type { ToolProgressEvent } from '../tools/base-tool.js'

export interface EditorialFeedback {
  reviewer: string
  pass_status: boolean
  issues: Array<{
    type: string
    severity: number
    quote?: string
    fix_instruction?: string
  }>
  quick_comment: string
  /** Captured `reasoning_content` from the reviewer's LLM call, if any. */
  thinking?: string
}

/**
 * For models that return `message.reasoning_content` (GLM-5.x), bypass the AI SDK
 * to capture both the final answer and the thinking trace. Returns null on any
 * non-2xx so callers can fall back to generateText().
 */
async function rawChatCompletion(
  llmConfig: LLMConfig,
  prompt: string,
): Promise<{ content: string; thinking: string } | null> {
  const url = `${(llmConfig.baseURL || '').replace(/\/$/, '')}/chat/completions`
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        stream: false,
      }),
    })
    if (!resp.ok) return null
    const data: any = await resp.json()
    const msg = data?.choices?.[0]?.message
    if (!msg) return null
    return {
      content: typeof msg.content === 'string' ? msg.content : '',
      thinking: typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '',
    }
  } catch {
    return null
  }
}

function isReasoningModel(model: string): boolean {
  const m = (model || '').toLowerCase()
  return m.includes('glm-5') || m.includes('glm5')
}

export interface EditorialResult {
  overall_pass: boolean
  feedbacks: EditorialFeedback[]
  merged_summary: string
  revision_strategy: RevisionStrategy
  review_scope?: ReviewScope
  reviewed_reviewers?: EditorialReviewerName[]
  carried_forward_reviewers?: EditorialReviewerName[]
}

export const EDITORIAL_REVIEWERS = [
  { name: 'editorial_lore', templateFile: 'reader_scene_lore.j2', causality: false },
  { name: 'editorial_pacing', templateFile: 'reader_scene_pacing.j2', causality: false },
  { name: 'editorial_ai_tone', templateFile: 'reader_scene_ai_tone.j2', causality: false },
  { name: 'editorial_character', templateFile: 'reader_scene_character.j2', causality: false },
  { name: 'editorial_causality', templateFile: 'reader_scene_causality.j2', causality: true },
] as const

export type EditorialReviewerName = typeof EDITORIAL_REVIEWERS[number]['name']
export const DEFAULT_MACHINE_REVIEWERS: EditorialReviewerName[] = [
  'editorial_lore',
  'editorial_causality',
]
export type ReviewScope = 'full' | 'failed_only' | 'targeted'

export type RevisionStrategyAction = 'none' | 'chapter_edit' | 'chapter_rewrite' | 'ask_human' | 'stop_auto_revision'
export type RevisionStrategyGrade = 'pass' | 'light' | 'medium' | 'severe' | 'stuck'
export type RevisionReviewScope = 'failed_only' | 'full'

export interface RevisionStrategy {
  action: RevisionStrategyAction
  grade: RevisionStrategyGrade
  score: number
  reason: string
  instruction: string
  target_reviewers: string[]
  recommended_review_scope: RevisionReviewScope
  revision_brief: string
  auto_revision: {
    current_round: number
    max_auto_rounds: number
    exhausted: boolean
    stop_reason?: string
  }
}

export interface RevisionStrategyOptions {
  currentRound?: number
  maxAutoRounds?: number
  persistentIssues?: Array<{ fingerprint: string; count: number; first_seen_round: number }>
}

export const DEFAULT_MAX_AUTO_REVISION_ROUNDS = 2

// ── Severity-weighted pass logic ──

/**
 * Issues at this severity or above force a reviewer fail regardless of what
 * the LLM put in `pass_status`. Prevents the "✅ but also severity-5 lore
 * break" contradiction the reviewers sometimes emit.
 */
export const SEVERITY_CRITICAL = 4

/**
 * Per-reviewer ceiling on sum-of-severity across all issues. Ten low-severity
 * issues pile up to the same "something is systemically wrong here" signal as
 * one mid-severity one, so we fail even without any single blocker.
 */
export const WEIGHTED_FAIL_THRESHOLD = 8

export function issueSeverity(i: { severity?: number }): number {
  const v = i.severity
  return typeof v === 'number' && v > 0 ? v : 3
}

export function reviewerMaxSeverity(fb: EditorialFeedback): number {
  return fb.issues.reduce((max, i) => Math.max(max, issueSeverity(i)), 0)
}

export function reviewerWeightedSeverity(fb: EditorialFeedback): number {
  return fb.issues.reduce((n, i) => n + issueSeverity(i), 0)
}

/**
 * Effective pass for one reviewer = LLM's own pass_status AND no critical
 * issue AND weighted severity below the ceiling. The LLM is one voice; the
 * severity data is the other, and they have to agree.
 */
export function reviewerEffectivePass(fb: EditorialFeedback): boolean {
  if (!fb.pass_status) return false
  if (reviewerMaxSeverity(fb) >= SEVERITY_CRITICAL) return false
  if (reviewerWeightedSeverity(fb) >= WEIGHTED_FAIL_THRESHOLD) return false
  return true
}

export function computeOverallPass(feedbacks: EditorialFeedback[]): boolean {
  return feedbacks.every(reviewerEffectivePass)
}

function failingFeedbacks(feedbacks: EditorialFeedback[]): EditorialFeedback[] {
  return feedbacks.filter(fb => !reviewerEffectivePass(fb))
}

/**
 * Build the merged summary: failing reviewers first, then by max severity
 * descending; within each failing reviewer, issues also sorted by severity.
 * The agent sees the loudest problems at the top of its tool result.
 */
export function buildMergedSummary(feedbacks: EditorialFeedback[]): string {
  const sorted = [...feedbacks].sort((a, b) => {
    const passA = reviewerEffectivePass(a)
    const passB = reviewerEffectivePass(b)
    if (passA !== passB) return passA ? 1 : -1
    return reviewerMaxSeverity(b) - reviewerMaxSeverity(a)
  })
  const parts: string[] = []
  for (const fb of sorted) {
    if (!reviewerEffectivePass(fb)) {
      const weighted = reviewerWeightedSeverity(fb)
      parts.push(`[${fb.reviewer}] ❌ ${fb.quick_comment}  (加权严重度 ${weighted})`)
      const sortedIssues = [...fb.issues].sort((a, b) => issueSeverity(b) - issueSeverity(a))
      for (const issue of sortedIssues) {
        parts.push(`  - [${issue.type}|严重度${issueSeverity(issue)}] ${issue.fix_instruction ?? ''}`)
      }
    } else {
      parts.push(`[${fb.reviewer}] ✅ ${fb.quick_comment}`)
    }
  }
  return parts.join('\n')
}

const PROSE_LOCAL_ISSUE_TYPES = new Set([
  'AI_Tone',
  'Death_Words',
  'Dash_Abuse',
  'Cliche',
  'Redundant_Wording',
  'Style_Drift',
  'Weak_Hook',
  'Rhetoric_Pileup',
  'Camera_Blocking_Density',
])

const REPAIRABLE_LOCAL_ISSUE_TYPES = new Set([
  ...PROSE_LOCAL_ISSUE_TYPES,
  'PTSD_Missing',
  'Weak_Opening_Pressure',
  'Motive_Chain_Weak',
  'Broken_Causality',
  'Logic_Bridge_Missing',
  'Lore_Clarification',
  'Minor_Lore_Patch',
  'Foreshadowing_Missing',
  'Dropped_Foreshadow',
  'Item_Error',
  'Character_Error',
  'Pacing_Drag',
  'Emotion_Gap',
  'Identity_Slip',
  'Floating_Hook',
  'Weak_Motive',
  'Coincidence_Driven',
])

const ROOT_STRUCTURAL_ISSUE_TYPES = new Set([
  'Lore_Contradiction',
  'Core_Setting_Break',
  'Character_Break',
  'Character_Contradiction',
  'Causality_Break',
  'Plot_Break',
  'Timeline_Conflict',
])

function isLocalProseIssue(issue: { type?: string }): boolean {
  return issue.type ? PROSE_LOCAL_ISSUE_TYPES.has(issue.type) : false
}

function isRepairableLocalIssue(issue: { type?: string; severity?: number }): boolean {
  if (!issue.type) return false
  if (ROOT_STRUCTURAL_ISSUE_TYPES.has(issue.type)) return false
  if (!REPAIRABLE_LOCAL_ISSUE_TYPES.has(issue.type)) return false
  return issueSeverity(issue) <= SEVERITY_CRITICAL
}

function hasRootStructuralIssue(fb: EditorialFeedback): boolean {
  return fb.issues.some(issue =>
    issue.type && ROOT_STRUCTURAL_ISSUE_TYPES.has(issue.type) && issueSeverity(issue) >= SEVERITY_CRITICAL
  )
}

function isStructuralReviewer(reviewer: string): boolean {
  return reviewer === 'editorial_lore' ||
    reviewer === 'editorial_pacing' ||
    reviewer === 'editorial_character' ||
    reviewer === 'editorial_causality'
}

function issueInstruction(issue: { type?: string; quote?: string; fix_instruction?: string }): string {
  const type = issue.type ?? 'Issue'
  const quote = issue.quote ? `「${issue.quote.slice(0, 80)}」` : ''
  const fix = issue.fix_instruction ?? '按审稿意见修正。'
  return `${type}${quote ? ` ${quote}` : ''}：${fix}`
}

export function buildRevisionBrief(
  feedbacks: EditorialFeedback[],
  action: RevisionStrategyAction = 'chapter_edit',
  reviewScope: RevisionReviewScope = 'failed_only',
): string {
  const failing = failingFeedbacks(feedbacks)
  if (failing.length === 0) {
    return '本轮机器慢审已通过。除非人类提出新的创作意图或批注，不要继续改写本章。'
  }

  const lines: string[] = []
  const reviewers = failing.map(fb => fb.reviewer).join('、')
  lines.push(`本次只处理未过审稿人的明确问题：${reviewers}。`)

  const issues = failing
    .flatMap(fb => (fb.issues ?? []).map(issue => ({ reviewer: fb.reviewer, issue })))
    .sort((a, b) => issueSeverity(b.issue) - issueSeverity(a.issue))

  let idx = 1
  for (const { reviewer, issue } of issues.slice(0, 8)) {
    const prefix = reviewer === 'editorial_ai_tone'
      ? 'AI腔调'
      : reviewer === 'editorial_lore'
        ? '设定'
        : reviewer === 'editorial_causality'
          ? '因果'
          : reviewer === 'editorial_character'
            ? '角色'
            : '节奏'
    lines.push(`${idx}. ${prefix}：${issueInstruction(issue)}`)
    idx += 1
  }

  if (issues.some(({ issue }) => issue.type === 'Camera_Blocking_Density')) {
    lines.push(`${idx}. 开头 800 字优先删除连续镜头链，不要密集写“停下/抬头/看见/接受现实”式分镜调度。`)
    idx += 1
    lines.push(`${idx}. 处理镜头编排过密时先删再改：把“踩/停/举手机/看/抹汗/塞兜”这类连续动作链压成处境判断，不要新增光线、脚步、呼吸、湿气等补偿描写。`)
    idx += 1
  }
  if (issues.some(({ issue }) => issue.type === 'Rhetoric_Pileup')) {
    lines.push(`${idx}. 每 800 字最多保留 1 个明显比喻；轻吐槽要少而准，不要每个信息点都包装成比喻。`)
    idx += 1
  }
  if (issues.some(({ issue }) => issue.type === 'Dash_Abuse')) {
    lines.push(`${idx}. 删除破折号解释，改成普通断句或让动作/对话自己说明。`)
    idx += 1
  }

  lines.push(`${idx}. ${action === 'chapter_rewrite' ? '可以整章重写，但必须保留大纲目标、核心事件和章末落点。' : '保留章节目标和主要事件，不要整章换剧情。'}`)
  idx += 1
  lines.push(`${idx}. 保存后${reviewScope === 'failed_only' ? `只复审 ${reviewers}` : '全量复审设定考据与逻辑审核'}；最终仍需本轮慢审通过并由人类终审，或人类直接通过。`)
  return lines.join('\n')
}

function buildStopAutoRevisionBrief(
  feedbacks: EditorialFeedback[],
  stopReason: string,
): string {
  const failing = failingFeedbacks(feedbacks)
  const reviewers = failing.map(fb => fb.reviewer).join('、') || '无'
  const issues = failing
    .flatMap(fb => (fb.issues ?? []).map(issue => ({ reviewer: fb.reviewer, issue })))
    .sort((a, b) => issueSeverity(b.issue) - issueSeverity(a.issue))
    .slice(0, 8)

  return [
    `自动修订已停止：${stopReason}`,
    `未过审稿人：${reviewers}。`,
    '',
    '需要向人类汇报的问题：',
    ...issues.map(({ reviewer, issue }, i) =>
      `${i + 1}. ${reviewer}：${issueInstruction(issue)}`
    ),
    '',
    '不要继续保存草稿或再次送审。请等待人类批注、人工通过、调整大纲，或明确授权开启新的修订批次。',
  ].join('\n')
}

function withStrategyDefaults(
  strategy: Omit<RevisionStrategy, 'target_reviewers' | 'recommended_review_scope' | 'revision_brief' | 'auto_revision'>,
  feedbacks: EditorialFeedback[],
  reviewScope: RevisionReviewScope,
  options: RevisionStrategyOptions,
): RevisionStrategy {
  const currentRound = options.currentRound ?? 0
  const maxAutoRounds = options.maxAutoRounds ?? DEFAULT_MAX_AUTO_REVISION_ROUNDS
  const failing = failingFeedbacks(feedbacks)
  const targetReviewers = failing.map(fb => fb.reviewer)
  const persistentIssues = options.persistentIssues ?? []
  const exhausted = strategy.action !== 'none' && (
    (currentRound > 0 && currentRound >= maxAutoRounds) ||
    persistentIssues.length > 0
  )

  if (exhausted) {
    const stopReason = persistentIssues.length > 0
      ? '同类问题已连续出现，继续自动改写大概率无效。'
      : `自动修订预算已用完（第 ${currentRound} 轮，预算 ${maxAutoRounds} 轮）。`
    return {
      action: 'stop_auto_revision',
      grade: 'stuck',
      score: strategy.score,
      reason: stopReason,
      instruction: [
        '停止自动重写。不要再调用 save_draft 或 submit_to_editorial 进入下一轮自循环。',
        '请向人类汇报未过审稿人、关键问题和你需要的创作判断；等待人类批注、人工通过、调整大纲或明确授权重写。',
      ].join('\n'),
      target_reviewers: targetReviewers,
      recommended_review_scope: reviewScope,
      revision_brief: buildStopAutoRevisionBrief(feedbacks, stopReason),
      auto_revision: {
        current_round: currentRound,
        max_auto_rounds: maxAutoRounds,
        exhausted: true,
        stop_reason: stopReason,
      },
    }
  }

  return {
    ...strategy,
    target_reviewers: targetReviewers,
    recommended_review_scope: reviewScope,
    revision_brief: buildRevisionBrief(feedbacks, strategy.action, reviewScope),
    auto_revision: {
      current_round: currentRound,
      max_auto_rounds: maxAutoRounds,
      exhausted: false,
    },
  }
}

export function buildRevisionStrategy(feedbacks: EditorialFeedback[], options: RevisionStrategyOptions = {}): RevisionStrategy {
  const failing = failingFeedbacks(feedbacks)
  if (failing.length === 0) {
    return withStrategyDefaults({
      action: 'none',
      grade: 'pass',
      score: 100,
      reason: '全部审稿人通过，无需修订。',
      instruction: '章节已通过编辑部。不要继续改写，除非用户提出新的创作意图或批注。',
    }, feedbacks, 'full', options)
  }

  const failedCount = failing.length
  const weightedSeverity = failing.reduce((sum, fb) => sum + reviewerWeightedSeverity(fb), 0)
  const maxSeverity = failing.reduce((max, fb) => Math.max(max, reviewerMaxSeverity(fb)), 0)
  const structuralCriticals = failing.filter(fb =>
    isStructuralReviewer(fb.reviewer) && reviewerMaxSeverity(fb) >= SEVERITY_CRITICAL
  ).length
  const rootStructuralFailures = failing.filter(hasRootStructuralIssue).length
  const allLocalProse = failing.every(fb =>
    fb.issues.length > 0 && fb.issues.every(issue => isLocalProseIssue(issue))
  )
  const allRepairableLocal = failing.every(fb =>
    fb.issues.length > 0 && fb.issues.every(issue => isRepairableLocalIssue(issue))
  )
  const score = Math.max(0, 100 - Math.min(90, weightedSeverity * 5 + failedCount * 8 + structuralCriticals * 18))

  if (allLocalProse || (score >= 70 && structuralCriticals === 0)) {
    return withStrategyDefaults({
      action: 'chapter_edit',
      grade: 'light',
      score,
      reason: `章节基础成立；失败集中在局部问题（${failedCount} 个审稿人未过，加权严重度 ${weightedSeverity}）。`,
      instruction: '这章禁止整章重写。请先 load_skill("chapter_edit")，严格按 revision_brief 做局部替换、插段或删改，然后 save_draft，并用 failed_only 复审未过审稿人。',
    }, feedbacks, 'failed_only', options)
  }

  if (allRepairableLocal && rootStructuralFailures === 0) {
    return withStrategyDefaults({
      action: 'chapter_edit',
      grade: 'medium',
      score,
      reason: `章节主干仍可保留；问题集中在可局部手术的文风、节奏压力或因果桥补丁（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
      instruction: '优先 load_skill("chapter_edit")。保留章节目标和主要事件，按 revision_brief 做局部删除、替换和补桥段；不要整章重写。因为牵涉多个审稿维度，保存后用 full 复审设定考据与逻辑审核。',
    }, feedbacks, failedCount > 1 ? 'full' : 'failed_only', options)
  }

  if (score >= 50 && failedCount <= 2 && structuralCriticals <= 1) {
    return withStrategyDefaults({
      action: 'chapter_edit',
      grade: 'medium',
      score,
      reason: `章节主干仍可保留，但需要较明显的局部补强（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
      instruction: '优先 load_skill("chapter_edit") 并严格按 revision_brief 处理。可以新增或替换若干段落来补强因果、动机、设定或节奏，但不要推翻章节目标；若改动结构、设定事实或角色动机，复审用 full。',
    }, feedbacks, structuralCriticals > 0 ? 'full' : 'failed_only', options)
  }

  return withStrategyDefaults({
    action: 'chapter_rewrite',
    grade: 'severe',
    score,
    reason: `章节存在结构性失败或低分审稿结果（${failedCount} 个审稿人未过，最高严重度 ${maxSeverity}，加权严重度 ${weightedSeverity}）。`,
    instruction: '本章不适合补丁式修。请先 load_skill("chapter_rewrite")，重新确认大纲、设定和剧情图后整章重写，再 save_draft 并重新 submit_to_editorial。',
  }, feedbacks, 'full', options)
}

// ── Template rendering (Jinja2 subset: {{ var }} + {% if var %}...{% endif %}) ──

/**
 * Minimal Jinja2-compatible renderer covering what the reader templates use:
 *   - `{{ var }}` / `{{var}}` variable substitution
 *   - `{% if var %}...{% endif %}` conditional blocks (no else, no nesting),
 *     where "truthy" = var is defined AND its rendered value is non-empty.
 *
 * Anything not covered (loops, filters, else, nested ifs) falls through
 * unchanged. Any dangling `{{ foo }}` after substitution is replaced with
 * "(未提供)" so the LLM never sees raw placeholders.
 */
export function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = fs.readFileSync(templatePath, 'utf-8')

  // 1. Resolve `{% if var %}...{% endif %}` blocks first so variables inside
  //    stripped blocks don't pollute the output.
  const ifRegex = /\{%\s*if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g
  content = content.replace(ifRegex, (_, varName: string, body: string) => {
    const v = vars[varName]
    return v && v.trim().length > 0 ? body : ''
  })

  // 2. Substitute `{{ var }}` / `{{var}}` occurrences.
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{ ${key} }}`, value)
    content = content.replaceAll(`{{${key}}}`, value)
  }

  // 3. Backstop — any unresolved `{{ anything }}` becomes "(未提供)" so the
  //    reviewer LLM doesn't see placeholder syntax.
  content = content.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '（未提供）')

  return content
}

// ── Single reviewer call ──

async function runReviewer(
  reviewerName: string,
  templateFile: string,
  promptsDir: string,
  vars: Record<string, string>,
  llmConfig: LLMConfig,
): Promise<EditorialFeedback> {
  const templatePath = path.join(promptsDir, templateFile)
  if (!fs.existsSync(templatePath)) {
    return {
      reviewer: reviewerName,
      pass_status: false,
      issues: [{ type: 'Template_Missing', severity: 5, fix_instruction: `Review template ${templateFile} not found` }],
      quick_comment: `Template not found: ${templateFile} — review skipped`,
    }
  }

  const prompt = renderTemplate(templatePath, vars)

  let answerText = ''
  let thinking = ''

  try {
    if (isReasoningModel(llmConfig.model)) {
      // Bypass AI SDK so we can capture `message.reasoning_content` alongside content.
      const raw = await rawChatCompletion(llmConfig, prompt)
      if (raw) {
        answerText = raw.content
        thinking = raw.thinking
      } else {
        // Raw call failed — fall back to AI SDK so we still get a result (no thinking).
        const model = createProvider(llmConfig)
        const result = await generateText({ model, prompt, temperature: 0.3 })
        answerText = result.text
      }
    } else {
      const model = createProvider(llmConfig)
      const result = await generateText({ model, prompt, temperature: 0.3 })
      answerText = result.text
    }

    // Parse JSON from response (strip markdown fences if present)
    let text = answerText.trim()
    const jsonMatch = text.match(/```json?\s*\n?([\s\S]*?)\n?```/)
    if (jsonMatch) text = jsonMatch[1].trim()

    try {
      const parsed = JSON.parse(text)
      const fb: EditorialFeedback = {
        reviewer: reviewerName,
        pass_status: parsed.pass_status ?? true,
        issues: parsed.ai_tone_issues ??
          parsed.issues ??
          parsed.lore_issues ??
          parsed.lore_violations ??
          parsed.pacing_issues ??
          parsed.critical_issues ??
          [],
        quick_comment: parsed.quick_comment ?? parsed.comment ?? '',
      }
      if (thinking) fb.thinking = thinking
      return fb
    } catch {
      const fb: EditorialFeedback = {
        reviewer: reviewerName,
        pass_status: false,
        issues: [{ type: 'Parse_Error', severity: 3, fix_instruction: 'Review response could not be parsed' }],
        quick_comment: `[Parse error] Raw: ${text.slice(0, 200)}`,
      }
      if (thinking) fb.thinking = thinking
      return fb
    }
  } catch (err) {
    return {
      reviewer: reviewerName,
      pass_status: false,
      issues: [{ type: 'LLM_Error', severity: 5, fix_instruction: 'Reviewer LLM call failed' }],
      quick_comment: `[LLM error] ${String(err).slice(0, 200)}`,
    }
  }
}

// ── Causality reviewer: plot-graph context ──

/**
 * Shape of the plot-graph context that gets injected into the causality
 * reviewer's prompt. Computed from `plot_graph.json` at reviewer-dispatch
 * time and passed via `plot_graph_context` template variables.
 */
export interface CausalityContext {
  chapter_subgraph: ReturnType<typeof chapterSubgraph>
  unresolved_setups: ReturnType<typeof unresolvedSetups>
}

/**
 * Build the plot-graph slice the causality reviewer sees: nodes touching the
 * current chapter, their incoming/outgoing edges, and the book-wide list of
 * setups that haven't been paid off yet. Safe on missing `plot_graph.json`
 * (returns empty arrays).
 */
export function buildCausalityContext(bookDir: string, chapterId: string): CausalityContext {
  return {
    chapter_subgraph: chapterSubgraph(bookDir, chapterId),
    unresolved_setups: unresolvedSetups(bookDir),
  }
}

// ── Full editorial pipeline ──

export interface EditorialContext {
  bookTone?: string
  bookGenre?: string
  /** Human-readable characters dump (not raw JSON) — injected into `{{ characters_info }}`. */
  charactersInfo?: string
  /** Human-readable world-lore dump — injected into `{{ world_lore }}`. */
  worldLore?: string
  /** Scene-specific hints the agent supplies when calling submit_to_editorial. */
  povCharacter?: string
  setting?: string
  sceneTarget?: string
  logicChain?: string
  emotionalArc?: string
  focusPoint?: string
  /** Outline slice (current chapter + neighbors) for contextual grounding. */
  outlineContext?: string
  /** Compact style fingerprint from 01_Global_Settings/style_profile.json. */
  styleProfile?: string
  /**
   * Book directory on disk, used to load `plot_graph.json` for the causality
   * reviewer's chapter subgraph. When both `bookDir` and `chapterId` are
   * provided, the causality reviewer's prompt receives plot_graph_context
   * variables. When either is missing, the causality reviewer still runs —
   * the template's `{% if plot_graph_context %}` block just stays stripped.
   */
  bookDir?: string
  chapterId?: string
  /** Optional progress channel for per-reviewer observability. */
  onProgress?: (event: ToolProgressEvent) => void | Promise<void>
  /**
   * Review subset to run. Omitted = full review. When provided, callers must
   * merge targeted results with a previous full review before treating a
   * chapter as finally passed.
   */
  reviewers?: EditorialReviewerName[]
  /** Optional per-reviewer model overrides; falls back to the shared llmConfig. */
  reviewerLLMConfigs?: Partial<Record<EditorialReviewerName, LLMConfig>>
}

async function emitEditorialProgress(
  context: EditorialContext,
  event: Omit<ToolProgressEvent, 'sourceTool'>,
): Promise<void> {
  try {
    await context.onProgress?.({ sourceTool: 'submit_to_editorial', ...event })
  } catch {
    // Progress reporting must never affect editorial decisions.
  }
}

async function runReviewerWithProgress(
  reviewerName: string,
  templateFile: string,
  promptsDir: string,
  vars: Record<string, string>,
  llmConfig: LLMConfig,
  context: EditorialContext,
): Promise<EditorialFeedback> {
  const startedAt = Date.now()
  const reviewerConfig = context.reviewerLLMConfigs?.[reviewerName as EditorialReviewerName] ?? llmConfig
  await emitEditorialProgress(context, {
    type: 'reviewer_start',
    label: `审稿人开始：${reviewerName}`,
    status: 'running',
    toolName: reviewerName,
    meta: { reviewer: reviewerName, templateFile, model: reviewerConfig.model },
  })

  try {
    const feedback = await runReviewer(reviewerName, templateFile, promptsDir, vars, reviewerConfig)
    await emitEditorialProgress(context, {
      type: 'reviewer_done',
      label: `审稿人完成：${reviewerName}`,
      status: feedback.pass_status ? 'done' : 'error',
      toolName: reviewerName,
      durationMs: Date.now() - startedAt,
      outputPreview: feedback.quick_comment,
      error: feedback.pass_status ? undefined : feedback.quick_comment,
      meta: {
        reviewer: reviewerName,
        pass_status: feedback.pass_status,
        issues: feedback.issues.length,
        maxSeverity: reviewerMaxSeverity(feedback),
        weightedSeverity: reviewerWeightedSeverity(feedback),
      },
    })
    return feedback
  } catch (err) {
    await emitEditorialProgress(context, {
      type: 'reviewer_error',
      label: `审稿人失败：${reviewerName}`,
      status: 'error',
      toolName: reviewerName,
      durationMs: Date.now() - startedAt,
      error: String((err as any)?.message ?? err).slice(0, 500),
      meta: { reviewer: reviewerName },
    })
    throw err
  }
}

export async function runEditorialPipeline(
  draft: string,
  context: EditorialContext,
  llmConfig: LLMConfig,
  promptsDir: string,
): Promise<EditorialResult> {
  const vars: Record<string, string> = {
    draft,
    book_tone: context.bookTone ?? '热血玄幻',
    book_genre: context.bookGenre ?? '玄幻',
    characters_info: context.charactersInfo ?? '',
    world_lore: context.worldLore ?? '',
    pov_character: context.povCharacter ?? '',
    setting: context.setting ?? '',
    scene_target: context.sceneTarget ?? '',
    logic_chain: context.logicChain ?? '',
    emotional_arc: context.emotionalArc ?? '',
    focus_point: context.focusPoint ?? '',
    outline_context: context.outlineContext ?? '',
    style_profile: context.styleProfile ?? '',
  }

  // Causality reviewer gets an extra set of variables derived from
  // plot_graph.json. Flat JSON strings because the minimal template engine
  // only does `{{ var }}` substitution — no dotted access, no filters.
  // The `plot_graph_context` flag controls the `{% if %}` block in the
  // template; the three `*_json` vars are the actual payload.
  const causalityVars: Record<string, string> = { ...vars }
  if (context.bookDir && context.chapterId) {
    const plotGraphContext = buildCausalityContext(context.bookDir, context.chapterId)
    const hasAnyPlotGraphData =
      plotGraphContext.chapter_subgraph.nodes.length > 0 ||
      plotGraphContext.unresolved_setups.length > 0
    if (hasAnyPlotGraphData) {
      causalityVars.plot_graph_context = 'yes'
      causalityVars.plot_graph_nodes_json = JSON.stringify(
        plotGraphContext.chapter_subgraph.nodes,
      )
      causalityVars.plot_graph_incoming_edges_json = JSON.stringify(
        plotGraphContext.chapter_subgraph.incoming_edges,
      )
      causalityVars.plot_graph_unresolved_setups_json = JSON.stringify(
        plotGraphContext.unresolved_setups,
      )
    }
  }

  const requested = context.reviewers && context.reviewers.length > 0
    ? new Set(context.reviewers)
    : new Set(DEFAULT_MACHINE_REVIEWERS)

  const selected = EDITORIAL_REVIEWERS.filter(r => requested.has(r.name))
  const feedbacks = await Promise.all(selected.map(r =>
    runReviewerWithProgress(
      r.name,
      r.templateFile,
      promptsDir,
      r.causality ? causalityVars : vars,
      llmConfig,
      context,
    )
  ))

  return {
    overall_pass: computeOverallPass(feedbacks),
    feedbacks,
    merged_summary: buildMergedSummary(feedbacks),
    revision_strategy: buildRevisionStrategy(feedbacks),
    reviewed_reviewers: feedbacks.map(fb => fb.reviewer as EditorialReviewerName),
  }
}
