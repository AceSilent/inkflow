/**
 * Editorial Pipeline — 3 specialized reviewers run in parallel.
 *
 * Replaces scene_pipeline.py's reader/editor flow.
 * Author Agent calls submit_to_editorial -> 3 reviewers run in parallel ->
 * feedback returned to Author for self-revision.
 *
 * Reviewers:
 *   1. 设定审稿人 (Lore Keeper) — checks lore consistency
 *   2. 节奏审稿人 (Pacing Junkie) — checks rhythm and pacing
 *   3. 文风审稿人 (AI Tone Detector) — detects AI-generated tone
 */
import fs from 'fs'
import path from 'path'
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'

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

// ── Template rendering (simple variable substitution) ──

function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = fs.readFileSync(templatePath, 'utf-8')
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{ ${key} }}`, value)
    content = content.replaceAll(`{{${key}}}`, value)
  }
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

// ── Full editorial pipeline ──

export async function runEditorialPipeline(
  draft: string,
  context: {
    bookTone?: string
    bookGenre?: string
    loreJson?: string
    outlineContext?: string
  },
  llmConfig: LLMConfig,
  promptsDir: string,
): Promise<EditorialResult> {
  const vars: Record<string, string> = {
    draft,
    book_tone: context.bookTone ?? '热血玄幻',
    book_genre: context.bookGenre ?? '玄幻',
    lore_json: context.loreJson ?? '{}',
    outline_context: context.outlineContext ?? '',
  }

  // Run all 3 reviewers in parallel
  const [lore, pacing, aiTone] = await Promise.all([
    runReviewer('editorial_lore', 'reader_scene_lore.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_pacing', 'reader_scene_pacing.j2', promptsDir, vars, llmConfig),
    runReviewer('editorial_ai_tone', 'reader_scene_ai_tone.j2', promptsDir, vars, llmConfig),
  ])

  const feedbacks = [lore, pacing, aiTone]
  const overall_pass = feedbacks.every(f => f.pass_status)

  // Merge summary for Author
  const summaryParts: string[] = []
  for (const fb of feedbacks) {
    if (!fb.pass_status) {
      summaryParts.push(`[${fb.reviewer}] ❌ ${fb.quick_comment}`)
      for (const issue of fb.issues) {
        summaryParts.push(`  - [${issue.type}|严重度${issue.severity}] ${issue.fix_instruction ?? ''}`)
      }
    } else {
      summaryParts.push(`[${fb.reviewer}] ✅ ${fb.quick_comment}`)
    }
  }

  return {
    overall_pass,
    feedbacks,
    merged_summary: summaryParts.join('\n'),
  }
}
