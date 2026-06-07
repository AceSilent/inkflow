import {
  listMemories,
  moveMemory,
  readMemory,
  updateMemory,
  writeMemory,
  type MemoryEntry,
} from './memory-service.js'
import type { MemoryFrontmatter } from './markdown-io.js'

export interface MemoryOrganizerResult {
  processed: number
  archived: number
  createdDigests: number
  updatedDigests: number
  skippedLowConfidence: number
  skippedNoGroup: number
  pendingRemaining: number
}

interface DigestGroup {
  name: 'style' | 'outline' | 'world'
  type: string
  title: string
  keywords: string[]
  preferredTypes: string[]
}

const MIN_AUTO_MERGE_CONFIDENCE = 0.75
const MAX_DIGEST_LINES = 14
const MAX_LINE_BODY_CHARS = 220

const DIGEST_GROUPS: DigestGroup[] = [
  {
    name: 'style',
    type: 'preference',
    title: '迁移记忆：作者偏好与协作方式',
    preferredTypes: ['preference', 'lesson', 'anti_pattern', 'craft'],
    keywords: [
      '偏好',
      'ai腔',
      '白描',
      '旁白',
      '讲解',
      '比喻',
      '解释',
      '抒情',
      '用词',
      '语感',
      '风格',
      '协作',
      '工作流',
      '协同',
      '协同创作',
      '先看',
      '别改',
      '先阅读',
      '用户改动',
      '覆盖',
      '盲目修改',
      'workflow',
      'style',
      'preference',
      'tone',
    ],
  },
  {
    name: 'outline',
    type: 'plot_note',
    title: '迁移记忆：大纲与剧情结构',
    preferredTypes: ['plot_note'],
    keywords: [
      '大纲',
      '剧情',
      '章节',
      '第一章',
      '结尾',
      '钩子',
      '死者',
      '尸体',
      '酒馆',
      '酒味',
      '口袋',
      '线索',
      '案件',
      '推理',
      'outline',
      'plot',
      'chapter',
      'ending',
      'pacing',
    ],
  },
  {
    name: 'world',
    type: 'fact',
    title: '迁移记忆：世界与核心设定',
    preferredTypes: ['fact', 'character', 'setting'],
    keywords: [
      '世界',
      '设定',
      '角色',
      '主角',
      '艾伦',
      '艾琳娜',
      '格雷赫文',
      '低吟',
      '圣犹达',
      '南岸',
      '工厂',
      '教会',
      'fact',
      'setting',
      'character',
      'world',
    ],
  },
]

function nowIso(): string {
  return new Date().toISOString()
}

function digestId(bookId: string, name: string): string {
  const safeBook = bookId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'book'
  return `mem_${safeBook}_migration_${name}`
}

function memoryHeading(entry: MemoryEntry): string {
  return entry.body.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.frontmatter.type
}

function memoryBody(entry: MemoryEntry): string {
  return entry.body
    .replace(/^#[^\n]*\n+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function memoryDigestLine(entry: MemoryEntry): string {
  const body = memoryBody(entry)
  return `- ${memoryHeading(entry)}：${body.slice(0, MAX_LINE_BODY_CHARS)}${body.length > MAX_LINE_BODY_CHARS ? '...' : ''}`
}

function normalizeLine(line: string): string {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/[：:，,。.;；、\s"'“”‘’`]/g, '')
    .toLowerCase()
    .slice(0, 260)
}

function parseDigestLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]\s+/.test(line))
}

function renderDigestBody(title: string, lines: string[]): string {
  return [`# ${title}`, '', ...lines].join('\n')
}

function memoryMatches(entry: MemoryEntry, group: DigestGroup): boolean {
  if (group.preferredTypes.includes(entry.frontmatter.type)) return true
  const haystack = [
    entry.frontmatter.type,
    ...(entry.frontmatter.tags ?? []),
    memoryHeading(entry),
    memoryBody(entry).slice(0, 320),
  ].join(' ').toLowerCase()
  return group.keywords.some(keyword => haystack.includes(keyword.toLowerCase()))
}

function groupForMemory(entry: MemoryEntry): DigestGroup | null {
  for (const group of DIGEST_GROUPS) {
    if (memoryMatches(entry, group)) return group
  }
  return null
}

function isPendingForBook(entry: MemoryEntry, bookId: string): boolean {
  return entry.frontmatter.status === 'pending'
    && (entry.frontmatter.book_id === bookId || entry.frontmatter.scope === 'user')
}

function sortPending(a: MemoryEntry, b: MemoryEntry): number {
  if (b.frontmatter.created_at !== a.frontmatter.created_at) return b.frontmatter.created_at.localeCompare(a.frontmatter.created_at)
  return b.frontmatter.confidence - a.frontmatter.confidence
}

function digestFrontmatter(bookId: string, group: DigestGroup, id: string, existing?: MemoryFrontmatter): MemoryFrontmatter {
  const ts = nowIso()
  return {
    ...(existing ?? {}),
    id,
    scope: 'book',
    book_id: bookId,
    type: group.type,
    confidence: Math.max(existing?.confidence ?? 0, 0.92),
    tags: Array.from(new Set([...(existing?.tags ?? []), 'migration_digest', group.name])),
    source: existing?.source ?? 'user_remember',
    source_event: existing?.source_event ?? 'memory_organizer',
    status: 'active',
    created_at: existing?.created_at ?? ts,
    approved_at: ts,
  }
}

function mergeDigestLines(existingBody: string | undefined, incoming: string[]): { lines: string[]; changed: boolean } {
  const existingLines = existingBody ? parseDigestLines(existingBody) : []
  const merged: string[] = []
  const seen = new Set<string>()

  for (const line of [...incoming, ...existingLines]) {
    const key = normalizeLine(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(line)
    if (merged.length >= MAX_DIGEST_LINES) break
  }

  const before = existingLines.join('\n')
  const after = merged.join('\n')
  return { lines: merged, changed: before !== after }
}

export async function organizePendingMemories(dataDir: string, bookId: string): Promise<MemoryOrganizerResult> {
  const pending = listMemories(dataDir, 'pending')
    .filter(entry => isPendingForBook(entry, bookId))
    .sort(sortPending)

  const result: MemoryOrganizerResult = {
    processed: 0,
    archived: 0,
    createdDigests: 0,
    updatedDigests: 0,
    skippedLowConfidence: 0,
    skippedNoGroup: 0,
    pendingRemaining: 0,
  }

  const grouped = new Map<DigestGroup['name'], MemoryEntry[]>()
  const processableIds = new Set<string>()

  for (const entry of pending) {
    if (entry.frontmatter.confidence < MIN_AUTO_MERGE_CONFIDENCE) {
      result.skippedLowConfidence += 1
      continue
    }
    const group = groupForMemory(entry)
    if (!group) {
      result.skippedNoGroup += 1
      continue
    }
    const list = grouped.get(group.name) ?? []
    list.push(entry)
    grouped.set(group.name, list)
    processableIds.add(entry.frontmatter.id)
  }

  for (const group of DIGEST_GROUPS) {
    const entries = grouped.get(group.name) ?? []
    if (entries.length === 0) continue

    const id = digestId(bookId, group.name)
    const existing = readMemory(dataDir, id)
    const incomingLines = entries.map(memoryDigestLine)
    const merged = mergeDigestLines(existing?.body, incomingLines)
    const body = renderDigestBody(group.title, merged.lines)

    if (existing) {
      if (merged.changed || existing.frontmatter.status !== 'active') {
        await updateMemory(dataDir, id, {
          ...digestFrontmatter(bookId, group, id, existing.frontmatter),
          body,
        })
        result.updatedDigests += 1
      }
    } else {
      writeMemory(dataDir, digestFrontmatter(bookId, group, id), body)
      result.createdDigests += 1
    }
  }

  for (const id of processableIds) {
    await moveMemory(dataDir, id, 'archived')
    result.archived += 1
  }

  result.processed = processableIds.size
  result.pendingRemaining = listMemories(dataDir, 'pending').filter(entry => isPendingForBook(entry, bookId)).length
  return result
}
