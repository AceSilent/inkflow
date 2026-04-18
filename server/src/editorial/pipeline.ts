/**
 * Editorial Pipeline — 5 specialized reviewers run in parallel.
 *
 * Author Agent calls submit_to_editorial -> reviewers run in parallel ->
 * severity-weighted feedback returned to Author for self-revision.
 *
 * Reviewers:
 *   1. 设定审稿人 (Lore Keeper) — lore consistency vs characters.json/world_lore
 *   2. 节奏审稿人 (Pacing Reviewer) — scene rhythm, beat density
 *   3. 文风审稿人 (AI Tone Detector) — AI-voice smell
 *   4. 人物审稿人 (Character Consistency) — voice / motive / emotion continuity
 *   5. 因果审稿人 (Causality & Foreshadow) — logic chain + hook bookkeeping
 */
import fs from 'fs'
import path from 'path'
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'
import { chapterSubgraph, unresolvedSetups } from '../services/plot-graph.js'

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
}

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

function issueSeverity(i: { severity?: number }): number {
  const v = i.severity
  return typeof v === 'number' && v > 0 ? v : 3
}

function reviewerMaxSeverity(fb: EditorialFeedback): number {
  return fb.issues.reduce((max, i) => Math.max(max, issueSeverity(i)), 0)
}

function reviewerWeightedSeverity(fb: EditorialFeedback): number {
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
        issues: parsed.ai_tone_issues ?? parsed.issues ?? parsed.lore_issues ?? parsed.pacing_issues ?? [],
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
  /**
   * Book directory on disk, used to load `plot_graph.json` for the causality
   * reviewer's chapter subgraph. When both `bookDir` and `chapterId` are
   * provided, the causality reviewer's prompt receives plot_graph_context
   * variables. When either is missing, the causality reviewer still runs —
   * the template's `{% if plot_graph_context %}` block just stays stripped.
   */
  bookDir?: string
  chapterId?: string
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

  // Run all reviewers in parallel. New reviewers (character, causality) are
  // added behind the existing three rather than replacing them so past review
  // files (review_{id}.json) stay shape-compatible.
  const [lore, pacing, aiTone, character, causality] = await Promise.all([
    runReviewer('editorial_lore', 'reader_scene_lore.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_pacing', 'reader_scene_pacing.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_ai_tone', 'reader_scene_ai_tone.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_character', 'reader_scene_character.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_causality', 'reader_scene_causality.j2', promptsDir, causalityVars, llmConfig),
  ])

  const feedbacks = [lore, pacing, aiTone, character, causality]
  return {
    overall_pass: computeOverallPass(feedbacks),
    feedbacks,
    merged_summary: buildMergedSummary(feedbacks),
  }
}
