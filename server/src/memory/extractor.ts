import fs from 'fs'
import path from 'path'
import { generateText } from 'ai'
import type { ModelMessage } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'
import { writeMemory, listMemories } from './memory-service.js'
import { nanoId } from './markdown-io.js'
import type { MemoryFrontmatter } from './markdown-io.js'

export interface ExtractedMemory {
  scope: 'user' | 'book' | 'session'
  type: string
  title: string
  body: string
  confidence: number
  tags: string[]
  book_id?: string
}

export type ExtractEvent = 'user_message' | 'editorial_return'

export interface ExtractorInput {
  event: ExtractEvent
  llmConfig: LLMConfig
  recentHistory: ModelMessage[]
  userMessage?: string
  editorialSummary?: string
  bookId?: string
  currentChapter?: string
}

// Windows drive-letter quirk: new URL(import.meta.url).pathname on Windows
// yields '/D:/AI/...' — strip the leading '/' before the drive letter so
// path.resolve works correctly across platforms.
const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts',
)

function renderTemplate(templateName: string, vars: Record<string, string>): string {
  const templatePath = path.join(PROMPTS_DIR, templateName)
  let tmpl = fs.readFileSync(templatePath, 'utf8')
  for (const [k, v] of Object.entries(vars)) {
    tmpl = tmpl.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v)
  }
  return tmpl
}

function historyToText(history: ModelMessage[]): string {
  return history.slice(-5).map(m => {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content).slice(0, 500)
    return `[${m.role}] ${c}`
  }).join('\n')
}

export async function extractMemories(input: ExtractorInput): Promise<ExtractedMemory[]> {
  const template = input.event === 'user_message'
    ? 'extractor_user_message.j2'
    : 'extractor_editorial_lesson.j2'
  const prompt = renderTemplate(template, {
    recentHistory: historyToText(input.recentHistory),
    userMessage: input.userMessage ?? '',
    editorialSummary: input.editorialSummary ?? '',
    bookId: input.bookId ?? '',
    currentChapter: input.currentChapter ?? '',
  })

  try {
    const { text } = await generateText({
      model: createProvider(input.llmConfig),
      prompt,
      temperature: 0.3,
    })
    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0]) as ExtractedMemory[]
    return parsed
      .filter(m => m.confidence >= 0.3)
      .map(m => ({ ...m, book_id: m.book_id ?? input.bookId }))
  } catch (e) {
    console.warn(`[extractor] extract failed:`, e)
    return []
  }
}

function stripHeading(s: string): string {
  // Remove a leading markdown H1 heading + blank line so similarity compares
  // the semantic body, not the `# title` prefix that writeMemory prepends.
  return s.replace(/^#\s+[^\n]*\n+/, '').trimStart()
}

function bodySimilarity(a: string, b: string): number {
  // Simple overlap: first 100 chars character intersection
  const pa = stripHeading(a).slice(0, 100).split('')
  const pb = new Set(stripHeading(b).slice(0, 100).split(''))
  const overlap = pa.filter(c => pb.has(c)).length
  return overlap / Math.max(pa.length, 1)
}

export async function ingestExtracted(
  dataDir: string,
  extracted: ExtractedMemory[],
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = []
  const skipped: string[] = []

  const existing = listMemories(dataDir, 'all')

  for (const ext of extracted) {
    if (ext.confidence < 0.3) {
      skipped.push(`low-confidence: ${ext.title}`)
      continue
    }
    const duplicate = existing.find(e => bodySimilarity(e.body, ext.body) > 0.8)
    if (duplicate) {
      skipped.push(`duplicate of ${duplicate.frontmatter.id}: ${ext.title}`)
      continue
    }
    const now = new Date().toISOString()
    const fm: MemoryFrontmatter = {
      id: nanoId('mem'),
      scope: ext.scope,
      type: ext.type,
      confidence: ext.confidence,
      tags: ext.tags,
      source: 'auto_extract',
      status: 'pending',
      created_at: now,
      ...(ext.book_id ? { book_id: ext.book_id } : {}),
    }
    const filePath = writeMemory(dataDir, fm, `# ${ext.title}\n\n${ext.body}`)
    written.push(filePath)
  }
  return { written, skipped }
}
