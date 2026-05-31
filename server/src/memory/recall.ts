/**
 * Markdown memory recall — dumps active markdown memories into prompt context,
 * with per-scope character budgets and confidence-based sorting.
 */
import path from 'path'
import fs from 'fs'
import { listMemories, type MemoryEntry } from './memory-service.js'
import { parseMarkdownMemory } from './markdown-io.js'

export interface RecallConfig {
  totalCharBudget: number
  scopeSplit: { project: number; global: number; session: number }
  minConfidence: number
}

export const DEFAULT_RECALL_CONFIG: RecallConfig = {
  totalCharBudget: 3000,
  scopeSplit: { project: 0.5, global: 0.3, session: 0.2 },
  minConfidence: 0.4,
}

interface BucketResult { lines: string[]; usedChars: number }

function renderMemory(m: MemoryEntry): string {
  // Strip leading "# Title\n\n" from body to get just the content
  const body = m.body.replace(/^#[^\n]*\n+/, '').trim()
  return `- [${m.frontmatter.id}|${m.frontmatter.type}] ${body.slice(0, 300)} (conf ${m.frontmatter.confidence.toFixed(2)})`
}

export function fillBucket(memories: MemoryEntry[], charBudget: number): BucketResult {
  // Sort: confidence desc, then created_at desc
  const sorted = [...memories].sort((a, b) => {
    if (b.frontmatter.confidence !== a.frontmatter.confidence)
      return b.frontmatter.confidence - a.frontmatter.confidence
    return b.frontmatter.created_at.localeCompare(a.frontmatter.created_at)
  })
  const lines: string[] = []
  let used = 0
  for (const m of sorted) {
    const line = renderMemory(m)
    if (used + line.length > charBudget) break
    lines.push(line)
    used += line.length + 1
  }
  return { lines, usedChars: used }
}

export function buildMarkdownMemoryContext(
  dataDir: string,
  bookId: string | undefined,
  config: RecallConfig = DEFAULT_RECALL_CONFIG,
): string {
  const all = listMemories(dataDir, 'active').filter(m => m.frontmatter.confidence >= config.minConfidence)

  const projectMem = all.filter(m => m.frontmatter.scope === 'book' && m.frontmatter.book_id === bookId)
  const globalMem = all.filter(m => m.frontmatter.scope === 'user')

  // Session memories: read books/{id}/session_summaries/*.md, newest 3 by mtime
  const sessionMem: MemoryEntry[] = []
  if (bookId) {
    const sessDir = path.join(dataDir, bookId, 'session_summaries')
    if (fs.existsSync(sessDir)) {
      const files = fs.readdirSync(sessDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({ f, mtime: fs.statSync(path.join(sessDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 3)
      for (const { f } of files) {
        const filePath = path.join(sessDir, f)
        const raw = fs.readFileSync(filePath, 'utf8')
        const { frontmatter, body } = parseMarkdownMemory(raw)
        if (frontmatter) sessionMem.push({ frontmatter, body, filePath })
      }
    }
  }

  const projectBudget = Math.floor(config.totalCharBudget * config.scopeSplit.project)
  const globalBudget = Math.floor(config.totalCharBudget * config.scopeSplit.global)
  const sessionBudget = Math.floor(config.totalCharBudget * config.scopeSplit.session)

  const projectResult = fillBucket(projectMem, projectBudget)
  const globalResult = fillBucket(globalMem, globalBudget)
  const sessionResult = fillBucket(sessionMem, sessionBudget)

  const parts: string[] = []
  if (globalResult.lines.length > 0) parts.push(`[记忆·用户偏好]\n${globalResult.lines.join('\n')}`)
  if (projectResult.lines.length > 0) parts.push(`[记忆·本项目]\n${projectResult.lines.join('\n')}`)
  if (sessionResult.lines.length > 0) parts.push(`[会话摘要·最近]\n${sessionResult.lines.join('\n')}`)

  return parts.join('\n\n')
}
