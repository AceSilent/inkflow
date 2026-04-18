/**
 * Cold-segment compaction pipeline.
 *
 * When the model window fills up, the oldest (cold) messages are summarised
 * down to a single system message via a separate LLM call (EDITORIAL_MODEL).
 * The summary is also persisted to Memory v2's `session_summaries/*.md` so
 * it survives process restart.
 *
 * Inputs: cold / warm / hot message buckets + SessionState (recent reads +
 * active skill) + llmConfig + bookDir.
 * Outputs: newMessages = [summary, ...warm, ...hot], summaryText, stats.
 */
import fs from 'fs'
import path from 'path'
import type { ModelMessage } from 'ai'
import { type LLMConfig } from '../llm/provider.js'
import { generateWithPtlRetry } from './ptl-fallback.js'
import type { SessionState } from './session-state.js'
import { writeMemory } from '../memory/memory-service.js'
import { nanoId } from '../memory/markdown-io.js'

// Windows drive-letter quirk: strip the leading '/' before the drive letter.
const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts',
)

function stripImages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(m => {
    if (typeof m.content === 'string') return m
    if (!Array.isArray(m.content)) return m
    const filtered = m.content.filter((p: any) => p?.type !== 'image' && p?.type !== 'document')
    return { ...m, content: filtered } as ModelMessage
  })
}

function renderMessages(messages: ModelMessage[]): string {
  return messages.map(m => {
    const content = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content).slice(0, 1000)
    return `[${m.role}] ${content}`
  }).join('\n\n')
}

function renderSessionState(state: SessionState): string {
  const parts: string[] = []
  if (state.recentReads.length > 0) {
    parts.push('## 刚读过的文件')
    for (const r of state.recentReads) {
      parts.push(`- ${r.tool}(${JSON.stringify(r.args)}) → "${r.excerpt.slice(0, 200)}..."`)
    }
  }
  if (state.activeSkill) {
    parts.push('## 激活的 skill')
    parts.push(`${state.activeSkill.name}:\n${state.activeSkill.body.slice(0, 1000)}`)
  }
  return parts.join('\n\n')
}

export interface CompactInput {
  cold: ModelMessage[]
  warm: ModelMessage[]
  hot: ModelMessage[]
  sessionState: SessionState
  llmConfig: LLMConfig
  bookDir: string
}

export interface CompactOutput {
  newMessages: ModelMessage[]
  summaryText: string
  stats: { compacted: number; kept: number }
}

export async function compactColdSegment(input: CompactInput): Promise<CompactOutput> {
  if (input.cold.length === 0) {
    return {
      newMessages: [...input.warm, ...input.hot],
      summaryText: '',
      stats: { compacted: 0, kept: input.warm.length + input.hot.length },
    }
  }

  const stripped = stripImages(input.cold)
  const coldText = renderMessages(stripped)
  const stateText = renderSessionState(input.sessionState)

  const tmplPath = path.join(PROMPTS_DIR, 'compact_summary.j2')
  let tmpl = fs.readFileSync(tmplPath, 'utf8')
  tmpl = tmpl
    .replace(/\{\{\s*coldMessages\s*\}\}/g, coldText)
    .replace(/\{\{\s*sessionState\s*\}\}/g, stateText)

  const { text: summaryText } = await generateWithPtlRetry(tmpl, input.llmConfig, 4000)

  const summaryMessage: ModelMessage = {
    role: 'system',
    content: [
      '# 会话摘要（自动压缩，覆盖前 ' + input.cold.length + ' 条消息）',
      '',
      summaryText,
      '',
      '# 最近工作台状态',
      stateText || '(空)',
    ].join('\n'),
  } as ModelMessage

  // Persist to Memory v2 session_summaries ({dataDir}/{bookId}/session_summaries/)
  const bookId = path.basename(input.bookDir)
  const dataDir = path.dirname(input.bookDir)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  writeMemory(dataDir, {
    id: `sess_${nanoId()}`,
    scope: 'session',
    type: 'compact_summary',
    confidence: 0.7,
    tags: ['auto-compact', `book-${bookId}`],
    source: 'context_compact',
    source_event: `compact_${ts}`,
    status: 'active',
    created_at: new Date().toISOString(),
    book_id: bookId,
  }, summaryText)

  return {
    newMessages: [summaryMessage, ...input.warm, ...input.hot],
    summaryText,
    stats: { compacted: input.cold.length, kept: input.warm.length + input.hot.length },
  }
}
