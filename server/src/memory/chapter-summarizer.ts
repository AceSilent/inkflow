/**
 * Chapter auto-summarization.
 *
 * Closes the loop on the previously-orphan plot_progress / character_states
 * stores: nothing was writing to them, so the context-builder always
 * surfaced empty memory. This module is invoked from submit_to_editorial
 * when overall_pass=true (i.e. the chapter has cleared the editorial gate)
 * and persists a 100-200 char chapter summary plus per-character state
 * lines into project memory.
 *
 * The summary template lives in prompts/summary_from_draft.j2.
 */
import fs from 'fs'
import path from 'path'
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'
import { renderTemplate } from '../editorial/pipeline.js'
import { updatePlotProgress, updateCharacterStates } from './project-memory.js'

export interface ChapterSummary {
  summary: string
  character_states: Record<string, string>
}

/**
 * Walk the outline for a chapter's display label. Used to give the
 * summarizer a human-friendly title even when the agent didn't pass one.
 */
function findChapterLabel(outline: unknown, chapterId: string): string {
  if (!outline || typeof outline !== 'object') return ''
  let found = ''
  const walk = (node: any): void => {
    if (!node || found) return
    if (node.type === 'chapter' && node.id === chapterId) {
      found = node.label ?? ''
      return
    }
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(outline)
  return found
}

/**
 * Run the LLM to produce a chapter summary + character states.
 * Pure function — does not touch disk for persistence; caller decides
 * what to do with the result. Throws on LLM failure (caller decides
 * whether to swallow or surface).
 */
export async function summarizeChapter(opts: {
  chapterId: string
  chapterLabel: string
  draftText: string
  llmConfig: LLMConfig
  promptsDir: string
}): Promise<ChapterSummary> {
  const { chapterId, chapterLabel, draftText, llmConfig, promptsDir } = opts
  const tplPath = path.join(promptsDir, 'summary_from_draft.j2')
  if (!fs.existsSync(tplPath)) {
    throw new Error(`Summary template not found: ${tplPath}`)
  }
  const prompt = renderTemplate(tplPath, {
    chapter_id: chapterId,
    chapter_label: chapterLabel || chapterId,
    draft: draftText,
  })

  const model = createProvider(llmConfig)
  const result = await generateText({ model, prompt, temperature: 0.3 })

  let text = result.text.trim()
  // Strip markdown fences if the LLM ignored the "no markdown" instruction.
  const fenced = text.match(/```json?\s*\n?([\s\S]*?)\n?```/)
  if (fenced) text = fenced[1].trim()

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`summarizeChapter: failed to parse LLM JSON — ${String(err).slice(0, 200)}; raw=${text.slice(0, 200)}`)
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const character_states = (parsed.character_states && typeof parsed.character_states === 'object')
    ? Object.fromEntries(
        Object.entries(parsed.character_states as Record<string, unknown>)
          .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v.trim().length > 0)
          .map(([k, v]) => [k, (v as string).trim()])
      )
    : {}

  return { summary, character_states }
}

/**
 * High-level entry: read draft + outline, call summarizer, persist results
 * into project memory. Errors are caught and logged to console — chapter
 * summarization is a "nice to have" enrichment, not a hard requirement, so
 * a failed call should never block the editorial flow that triggered it.
 */
export async function persistChapterSummary(opts: {
  dataDir: string
  bookId: string
  chapterId: string
  draftText: string
  llmConfig: LLMConfig
  promptsDir: string
}): Promise<ChapterSummary | null> {
  const { dataDir, bookId, chapterId, draftText, llmConfig, promptsDir } = opts
  try {
    let chapterLabel = ''
    const outlinePath = path.join(dataDir, bookId, '02_Outlines', 'outline.json')
    if (fs.existsSync(outlinePath)) {
      try {
        const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf-8'))
        chapterLabel = findChapterLabel(outline, chapterId)
      } catch { /* outline malformed — fall back to empty label */ }
    }

    const result = await summarizeChapter({
      chapterId, chapterLabel, draftText, llmConfig, promptsDir,
    })
    if (result.summary) {
      updatePlotProgress(dataDir, bookId, chapterId, result.summary)
    }
    if (result.character_states && Object.keys(result.character_states).length > 0) {
      updateCharacterStates(dataDir, bookId, chapterId, result.character_states)
    }
    return result
  } catch (err) {
    console.error(`[chapter-summarizer] persist failed for ${bookId}/${chapterId}:`, err)
    return null
  }
}
