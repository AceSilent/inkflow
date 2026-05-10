import fs from 'fs'
import path from 'path'
import { ensureDir } from '../utils/file-io.js'
import { withFileLock } from '../tools/safety.js'
import {
  parseMarkdownMemory,
  serializeMarkdownMemory,
  type MemoryFrontmatter,
} from './markdown-io.js'

/**
 * Maps an active memory (scope + type) to its target directory.
 * Pending/archived overrides type-based routing.
 */
function targetDir(dataDir: string, fm: MemoryFrontmatter): string {
  if (fm.status === 'pending') {
    return ensureDir(path.join(dataDir, '..', 'global', 'memories', '_pending'))
  }
  if (fm.status === 'archived') {
    if (fm.scope === 'book' && fm.book_id) {
      return ensureDir(path.join(dataDir, fm.book_id, 'memories', '_archived'))
    }
    return ensureDir(path.join(dataDir, '..', 'global', 'memories', '_archived'))
  }
  // status === 'active'
  if (fm.scope === 'book' && fm.book_id) {
    return ensureDir(path.join(dataDir, fm.book_id, 'memories'))
  }
  if (fm.scope === 'session' && fm.book_id) {
    return ensureDir(path.join(dataDir, fm.book_id, 'session_summaries'))
  }
  // global scope: route by type
  const typeBucket = {
    preference: 'user_preferences',
    craft: 'craft_skills',
    lesson: 'anti_patterns',
    anti_pattern: 'anti_patterns',
  }[fm.type] ?? 'user_preferences'
  return ensureDir(path.join(dataDir, '..', 'global', 'memories', typeBucket))
}

export function writeMemory(dataDir: string, fm: MemoryFrontmatter, body: string): string {
  const dir = targetDir(dataDir, fm)
  const filePath = path.join(dir, `${fm.id}.md`)
  fs.writeFileSync(filePath, serializeMarkdownMemory(fm, body), 'utf8')
  return filePath
}

export interface MemoryEntry {
  frontmatter: MemoryFrontmatter
  body: string
  filePath: string
}

function findMemoryFile(dataDir: string, id: string): string | null {
  // Search known locations
  const candidates = [
    path.join(dataDir, '..', 'global', 'memories', '_pending', `${id}.md`),
    path.join(dataDir, '..', 'global', 'memories', '_archived', `${id}.md`),
    path.join(dataDir, '..', 'global', 'memories', 'user_preferences', `${id}.md`),
    path.join(dataDir, '..', 'global', 'memories', 'craft_skills', `${id}.md`),
    path.join(dataDir, '..', 'global', 'memories', 'anti_patterns', `${id}.md`),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  // Walk per-book dirs
  if (!fs.existsSync(dataDir)) return null
  for (const book of fs.readdirSync(dataDir)) {
    const memDir = path.join(dataDir, book, 'memories')
    if (fs.existsSync(memDir)) {
      for (const sub of ['', '_archived']) {
        const p = path.join(memDir, sub, `${id}.md`)
        if (fs.existsSync(p)) return p
      }
    }
    const sessDir = path.join(dataDir, book, 'session_summaries', `${id}.md`)
    if (fs.existsSync(sessDir)) return sessDir
  }
  return null
}

export function readMemory(dataDir: string, id: string): MemoryEntry | null {
  const filePath = findMemoryFile(dataDir, id)
  if (!filePath) return null
  const raw = fs.readFileSync(filePath, 'utf8')
  const { frontmatter, body } = parseMarkdownMemory(raw)
  if (!frontmatter) return null
  return { frontmatter, body, filePath }
}

export type ListStatus = 'pending' | 'active' | 'archived' | 'all'

export function listMemories(dataDir: string, status: ListStatus = 'all'): MemoryEntry[] {
  const results: MemoryEntry[] = []
  const bucketPaths: string[] = []

  const globalRoot = path.join(dataDir, '..', 'global', 'memories')
  if (status === 'pending' || status === 'all') {
    bucketPaths.push(path.join(globalRoot, '_pending'))
  }
  if (status === 'active' || status === 'all') {
    for (const d of ['user_preferences', 'craft_skills', 'anti_patterns']) {
      bucketPaths.push(path.join(globalRoot, d))
    }
  }
  if (status === 'archived' || status === 'all') {
    bucketPaths.push(path.join(globalRoot, '_archived'))
  }

  // Per-book directories
  if (fs.existsSync(dataDir)) {
    for (const book of fs.readdirSync(dataDir)) {
      const memDir = path.join(dataDir, book, 'memories')
      if (fs.existsSync(memDir)) {
        if (status === 'active' || status === 'all') bucketPaths.push(memDir)
        if (status === 'archived' || status === 'all') bucketPaths.push(path.join(memDir, '_archived'))
      }
    }
  }

  for (const bp of bucketPaths) {
    if (!fs.existsSync(bp)) continue
    const stat = fs.statSync(bp)
    if (!stat.isDirectory()) continue
    for (const f of fs.readdirSync(bp)) {
      if (!f.endsWith('.md') || f === 'MEMORY.md') continue
      const filePath = path.join(bp, f)
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseMarkdownMemory(raw)
      if (frontmatter) results.push({ frontmatter, body, filePath })
    }
  }
  return results
}

export async function moveMemory(
  dataDir: string,
  id: string,
  newStatus: 'active' | 'archived',
  newScope?: MemoryFrontmatter['scope'],
  newBookId?: string,
): Promise<void> {
  const entry = readMemory(dataDir, id)
  if (!entry) throw new Error(`Memory not found: ${id}`)
  await withFileLock(entry.filePath, async () => {
    const updated: MemoryFrontmatter = {
      ...entry.frontmatter,
      status: newStatus,
      ...(newScope ? { scope: newScope } : {}),
      ...(newBookId ? { book_id: newBookId } : {}),
      ...(newStatus === 'active' ? { approved_at: new Date().toISOString() } : {}),
    }
    fs.unlinkSync(entry.filePath)
    writeMemory(dataDir, updated, entry.body)
  })
}

export async function updateMemory(
  dataDir: string,
  id: string,
  patch: Partial<Omit<MemoryFrontmatter, 'id' | 'created_at'>> & { body?: string },
): Promise<void> {
  const entry = readMemory(dataDir, id)
  if (!entry) throw new Error(`Memory not found: ${id}`)
  await withFileLock(entry.filePath, async () => {
    const updated: MemoryFrontmatter = { ...entry.frontmatter, ...patch }
    const body = patch.body ?? entry.body
    fs.unlinkSync(entry.filePath)
    writeMemory(dataDir, updated, body)
  })
}

export async function deleteMemory(dataDir: string, id: string): Promise<void> {
  const entry = readMemory(dataDir, id)
  if (!entry) return
  await withFileLock(entry.filePath, async () => {
    if (fs.existsSync(entry.filePath)) fs.unlinkSync(entry.filePath)
  })
}

export function rewriteIndex(dataDir: string, bucketDir: string): void {
  // bucketDir is e.g. 'user_preferences' or 'craft_skills'
  const dir = path.join(dataDir, '..', 'global', 'memories', bucketDir)
  if (!fs.existsSync(dir)) return
  const entries: string[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md') || f === 'MEMORY.md') continue
    const raw = fs.readFileSync(path.join(dir, f), 'utf8')
    const { frontmatter, body } = parseMarkdownMemory(raw)
    if (!frontmatter) continue
    const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || frontmatter.type
    entries.push(`- [${title}](${f}) — conf ${frontmatter.confidence.toFixed(2)}, ${frontmatter.created_at.slice(0, 10)}`)
  }
  const indexContent = `# Active memories · ${bucketDir}\n\n${entries.join('\n')}\n`
  fs.writeFileSync(path.join(dir, 'MEMORY.md'), indexContent, 'utf8')
}
