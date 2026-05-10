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
import {
  buildMergedSummary,
  buildRevisionStrategy,
  computeOverallPass,
  reviewerEffectivePass,
  reviewerMaxSeverity,
  reviewerWeightedSeverity,
} from './revision-strategy.js'
import type { RevisionStrategy } from './revision-strategy.js'

export {
  DEFAULT_MAX_AUTO_REVISION_ROUNDS,
  SEVERITY_CRITICAL,
  WEIGHTED_FAIL_THRESHOLD,
  buildMergedSummary,
  buildRevisionBrief,
  buildRevisionStrategy,
  computeOverallPass,
  issueSeverity,
  reviewerEffectivePass,
  reviewerMaxSeverity,
  reviewerWeightedSeverity,
} from './revision-strategy.js'
export type {
  RevisionReviewScope,
  RevisionStrategy,
  RevisionStrategyAction,
  RevisionStrategyGrade,
  RevisionStrategyOptions,
} from './revision-strategy.js'

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
