/**
 * submit_to_editorial — Tool for Author Agent to submit drafts
 * to the Editorial Department (3 parallel reviewers).
 *
 * Returns structured JSON feedback that the Author can use
 * to self-revise in the same agent loop.
 */
import { z } from 'zod'
import path from 'path'
import { type ToolDefinition, type ToolContext } from '../tools/base-tool.js'
import { runEditorialPipeline, type EditorialResult } from './pipeline.js'
import { type LLMConfig } from '../llm/provider.js'

// LLM config for editorial reviewers (can use cheaper/faster model)
function editorialLLMConfig(): LLMConfig {
  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL,
    model: process.env.EDITORIAL_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
  }
}

export const submitToEditorialTool: ToolDefinition = {
  name: 'submit_to_editorial',
  description: [
    '将草稿提交给编辑部进行专项审核。3个审稿人（设定、节奏、文风）并行评审。',
    '审核结果包含各审稿人的pass/fail状态、具体问题列表和修改指令。',
    '收到反馈后，你应该根据反馈自主修改草稿。',
  ].join('\n'),
  parameters: z.object({
    draft_text: z.string().describe('要审核的草稿文本'),
    book_tone: z.string().optional().describe('书籍基调，如"热血玄幻"'),
    book_genre: z.string().optional().describe('书籍类型，如"玄幻"'),
  }),
  permissionLevel: 'read',
  execute: async ({ draft_text, book_tone, book_genre }, ctx) => {
    const promptsDir = path.resolve(
      path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
      '../../../prompts'
    )

    const llmConfig = editorialLLMConfig()

    try {
      const result: EditorialResult = await runEditorialPipeline(
        draft_text,
        { bookTone: book_tone, bookGenre: book_genre },
        llmConfig,
        promptsDir,
      )

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
