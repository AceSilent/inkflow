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

// LLM config for editorial reviewers — reads from settings.json first, falls back to env vars.
// Uses editorModel (or readerModel) from settings, which can be a cheaper/faster model.
function editorialLLMConfig(dataDir: string): LLMConfig {
  const settings = getSettings(dataDir)
  const modelSelector = settings.editorModel || settings.readerModel || settings.authorModel || ''

  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return { apiKey: provider.apiKey, baseURL: provider.baseUrl, model }
    }
  }

  // Fallback to environment variables
  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.EDITORIAL_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
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

function persistReview(
  dataDir: string,
  bookId: string,
  chapterId: string,
  result: EditorialResult,
): void {
  const draftsDir = path.join(dataDir, bookId, '04_Drafts')
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true })
  }
  const reviewPath = path.join(draftsDir, `review_${chapterId}.json`)
  fs.writeFileSync(reviewPath, JSON.stringify({
    overall_pass: result.overall_pass,
    feedbacks: result.feedbacks,
    merged_summary: result.merged_summary,
    reviewed_at: new Date().toISOString(),
  }, null, 2), 'utf-8')
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

      // Auto-persist review results
      if (chapter_id && ctx.bookId && ctx.dataDir) {
        persistReview(ctx.dataDir, ctx.bookId, chapter_id, result)
      }

      // Inline tool result for Author — strip `thinking` from each feedback to
      // keep the agent's context lean. Full thinking traces stay in the
      // persisted review_{chapterId}.json file for human inspection.
      const leanFeedbacks = result.feedbacks.map(({ thinking: _t, ...rest }) => rest)
      return JSON.stringify({
        overall_pass: result.overall_pass,
        summary: result.merged_summary,
        feedbacks: leanFeedbacks,
      }, null, 2)
    } catch (err) {
      return `编辑部审核出错: ${String(err)}`
    }
  },
}
