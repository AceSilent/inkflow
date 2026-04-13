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
import { runEditorialPipeline, type EditorialResult } from './pipeline.js'
import { type LLMConfig } from '../llm/provider.js'
import { getSettings } from '../routes/settings.js'

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
    chapter_id: z.string().describe('章节ID，用于保存审核结果'),
    book_tone: z.string().optional().describe('书籍基调，如"热血玄幻"'),
    book_genre: z.string().optional().describe('书籍类型，如"玄幻"'),
  }),
  permissionLevel: 'read',
  execute: async ({ draft_text, chapter_id, book_tone, book_genre }, ctx) => {
    const promptsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
      '../../../prompts'
    )

    const llmConfig = editorialLLMConfig(ctx.dataDir)

    try {
      const result: EditorialResult = await runEditorialPipeline(
        draft_text,
        { bookTone: book_tone, bookGenre: book_genre },
        llmConfig,
        promptsDir,
      )

      // Auto-persist review results
      if (chapter_id && ctx.bookId && ctx.dataDir) {
        persistReview(ctx.dataDir, ctx.bookId, chapter_id, result)
      }

      return JSON.stringify({
        overall_pass: result.overall_pass,
        summary: result.merged_summary,
        feedbacks: result.feedbacks,
      }, null, 2)
    } catch (err) {
      return `编辑部审核出错: ${String(err)}`
    }
  },
}
