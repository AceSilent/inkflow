/**
 * Terminal tools — trigger human interaction, pause the agent loop.
 */
import { z } from 'zod'
import { type ToolDefinition } from './base-tool.js'

export const submitForReviewTool: ToolDefinition = {
  name: 'submit_for_review',
  description: '将草稿提交给人类审核。调用后 Agent 循环暂停。',
  parameters: z.object({
    draft_text: z.string().describe('待审核的草稿内容'),
  }),
  permissionLevel: 'write',
  isTerminal: true,
  category: '终端',
  execute: async ({ draft_text }) => {
    return `TERMINAL:SUBMIT_FOR_REVIEW\nDraft submitted (${draft_text.length} chars)`
  },
}

export const presentOptionsTool: ToolDefinition = {
  name: 'present_options',
  description: '向人类展示多个选项，等待人类选择。调用后 Agent 循环暂停。',
  parameters: z.object({
    description: z.string().describe('选项说明'),
    options: z.string().describe('选项列表（用换行分隔）'),
  }),
  permissionLevel: 'read',
  isTerminal: true,
  category: '终端',
  execute: async ({ description, options }) => {
    return `TERMINAL:PRESENT_OPTIONS\n${description}\n\n${options}`
  },
}

export const requestGuidanceTool: ToolDefinition = {
  name: 'request_guidance',
  description: '向人类请求指导或决策。调用后 Agent 循环暂停。',
  parameters: z.object({
    question: z.string().describe('问题'),
    context: z.string().optional().describe('相关上下文'),
  }),
  permissionLevel: 'read',
  isTerminal: true,
  category: '终端',
  execute: async ({ question, context }) => {
    const ctx = context ? `\nContext: ${context}` : ''
    return `TERMINAL:REQUEST_GUIDANCE\n${question}${ctx}`
  },
}
