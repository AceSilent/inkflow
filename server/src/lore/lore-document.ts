import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { safeReadJson, writeJson } from '../utils/file-io.js'
import { appendAuditLog, createBackup, withFileLock } from '../tools/safety.js'

export const LORE_SCHEMA_VERSION = 1
export const LORE_CATEGORIES = ['story_bible', 'world_setting', 'characters'] as const
export type LoreCategory = typeof LORE_CATEGORIES[number]
export type LoreStatus = 'draft' | 'confirmed' | 'deprecated'

export interface LoreSourceRef {
  source_name: string
  source_section?: string
  source_type: 'attachment' | 'book_file' | 'conversation' | 'legacy'
}

export interface LoreEntry {
  id: string
  title: string
  entry_type: string
  status: LoreStatus
  tags: string[]
  aliases: string[]
  content: string
  updated_at: string
  source_refs?: LoreSourceRef[]
}

export interface LoreDocument {
  schema_version: 1
  category: LoreCategory
  revision: number
  entries: LoreEntry[]
}

export class LoreRevisionConflictError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(`Lore revision conflict: expected ${expectedRevision}, found ${actualRevision}`)
    this.name = 'LoreRevisionConflictError'
  }
}

export const loreEntrySchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  entry_type: z.string().min(1).max(100),
  status: z.enum(['draft', 'confirmed', 'deprecated']),
  tags: z.array(z.string().min(1).max(80)).max(30),
  aliases: z.array(z.string().min(1).max(120)).max(30),
  content: z.string().max(100_000),
  updated_at: z.string().max(64),
  source_refs: z.array(z.object({
    source_name: z.string().min(1).max(255),
    source_section: z.string().max(300).optional(),
    source_type: z.enum(['attachment', 'book_file', 'conversation', 'legacy']),
  })).max(30).optional(),
})

export const loreDocumentSchema = z.object({
  schema_version: z.literal(LORE_SCHEMA_VERSION),
  category: z.enum(LORE_CATEGORIES),
  revision: z.number().int().nonnegative(),
  entries: z.array(loreEntrySchema).max(1000),
}).superRefine((document, ctx) => {
  const seen = new Set<string>()
  document.entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['entries', index, 'id'],
        message: `duplicate lore entry id '${entry.id}'`,
      })
    }
    seen.add(entry.id)
  })
})

const LABELS: Record<string, string> = {
  book_title: '书名',
  genre: '题材',
  tone: '基调',
  core_premise: '核心前提',
  golden_finger: '核心机制',
  cultivation_system: '力量体系',
  setting: '世界与地点',
  opening_unit: '开篇单元',
  writing_principles: '创作原则',
  prism_medical_society: '棱镜医学会',
  supernatural_elements: '超自然要素',
  sacrificial_mechanism: '献祭机制',
  nature: '性质',
  surveillance_method: '监控方式',
  purification_protocol: '净化规程',
  manifestation_style: '显现方式',
  occult_clues: '隐秘线索',
  the_killers: '执行者',
  instigation_logic: '诱导逻辑',
  surface: '表层表现',
  mechanism: '运行机制',
  rule_hidden: '隐藏规则',
  long_arc: '长期线索',
  principle: '原理',
  stages: '阶段',
  social_titles: '世俗称谓',
  imagery: '意象',
  qingxu_temple: '清虚观',
  world_structure: '世界结构',
  truth: '真相',
  themes: '主题',
  ending: '结局',
  role: '角色定位',
  identity: '身份',
  background: '经历',
  traits: '性格与特征',
  secret: '秘密',
  ability: '能力',
  cultivation: '修行状态',
  relationship_with_alan: '与艾伦的关系',
  modus_operandi: '行动方式',
  plot: '剧情功能',
  function: '叙事功能',
  arc: '人物弧',
}

function humanizeKey(key: string): string {
  return LABELS[key] || key.replace(/_/g, ' ')
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function entryId(category: LoreCategory, seed: string, used: Set<string>): string {
  const ascii = seed
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  const base = ascii || `${category === 'characters' ? 'character' : 'lore'}-${stableHash(seed)}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function valueToMarkdown(value: unknown, depth = 2): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'object') return scalarText(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    if (value.every(item => item === null || typeof item !== 'object')) {
      return value.map(item => `- ${scalarText(item)}`).join('\n')
    }
    return value.map((item, index) => {
      const title = item && typeof item === 'object'
        ? String((item as Record<string, unknown>).name || (item as Record<string, unknown>).title || `条目 ${index + 1}`)
        : `条目 ${index + 1}`
      return `${'#'.repeat(Math.min(depth, 6))} ${title}\n\n${valueToMarkdown(item, depth + 1)}`
    }).join('\n\n')
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => {
      const heading = '#'.repeat(Math.min(depth, 6))
      return `${heading} ${humanizeKey(key)}\n\n${valueToMarkdown(item, depth + 1)}`
    })
    .join('\n\n')
}

function worldEntryType(key: string): string {
  if (/system|mechanism|rule|principle|golden_finger|cultivation/i.test(key)) return '规则与体系'
  if (/setting|location|city|temple|world/i.test(key)) return '世界与地点'
  if (/society|faction|organization|church/i.test(key)) return '组织与阵营'
  if (/opening|arc|plot|history/i.test(key)) return '历史与事件'
  if (/tone|genre|book_title|writing/i.test(key)) return '作品方向'
  return '世界设定'
}

function canonicalEntry(raw: unknown, category: LoreCategory, used: Set<string>, seed: string): LoreEntry {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const title = String(input.title || input.name || humanizeKey(seed)).trim() || humanizeKey(seed)
  const idSeed = String(input.id || seed || title)
  const status = ['draft', 'confirmed', 'deprecated'].includes(String(input.status))
    ? String(input.status) as LoreStatus
    : 'confirmed'
  return {
    id: entryId(category, idSeed, used),
    title,
    entry_type: String(input.entry_type || input.role || (category === 'characters' ? '角色' : worldEntryType(seed))).trim(),
    status,
    tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean).slice(0, 30) : [],
    aliases: Array.isArray(input.aliases) ? input.aliases.map(String).filter(Boolean).slice(0, 30) : [],
    content: typeof input.content === 'string'
      ? input.content
      : valueToMarkdown(
          Object.fromEntries(
            Object.entries(input).filter(([key]) =>
              ![
                'id',
                'name',
                'title',
                'entry_type',
                'status',
                'tags',
                'aliases',
                'content',
                'updated_at',
                'source_refs',
              ].includes(key)
            )
          )
        ),
    updated_at: typeof input.updated_at === 'string' ? input.updated_at : '',
    source_refs: Array.isArray(input.source_refs)
      ? input.source_refs
          .filter(item => item && typeof item === 'object')
          .map(item => {
            const ref = item as Record<string, unknown>
            const sourceType = ['attachment', 'book_file', 'conversation', 'legacy'].includes(String(ref.source_type))
              ? String(ref.source_type) as LoreSourceRef['source_type']
              : 'legacy'
            return {
              source_name: String(ref.source_name || '').trim(),
              ...(ref.source_section ? { source_section: String(ref.source_section).trim() } : {}),
              source_type: sourceType,
            }
          })
          .filter(ref => ref.source_name)
          .slice(0, 30)
      : undefined,
  }
}

function normalizeCanonicalDocument(category: LoreCategory, data: Record<string, unknown>): LoreDocument {
  const used = new Set<string>()
  const rawEntries = Array.isArray(data.entries) ? data.entries : []
  return {
    schema_version: LORE_SCHEMA_VERSION,
    category,
    revision: Number.isInteger(data.revision) && Number(data.revision) >= 0 ? Number(data.revision) : 0,
    entries: rawEntries.map((entry, index) => canonicalEntry(entry, category, used, `entry-${index + 1}`)),
  }
}

function normalizeLegacyCharacters(data: unknown): LoreDocument {
  const used = new Set<string>()
  const entries: LoreEntry[] = []
  if (!data || typeof data !== 'object') {
    return emptyLoreDocument('characters')
  }

  const root = data as Record<string, unknown>
  const characterList = Array.isArray(root.characters) ? root.characters : null
  if (characterList) {
    characterList.forEach((character, index) => {
      const record = character && typeof character === 'object' ? character as Record<string, unknown> : {}
      const seed = String(record.id || record.name || `character-${index + 1}`)
      entries.push(canonicalEntry(record, 'characters', used, seed))
    })
  }

  Object.entries(root)
    .filter(([key]) => key !== 'characters')
    .forEach(([key, value]) => {
      if (key === 'book_title') {
        entries.push(canonicalEntry({
          title: '作品角色说明',
          entry_type: '总览',
          content: `作品：${scalarText(value)}`,
        }, 'characters', used, key))
        return
      }
      const record = value && typeof value === 'object'
        ? { ...(value as Record<string, unknown>), id: key }
        : { id: key, title: humanizeKey(key), content: scalarText(value) }
      entries.push(canonicalEntry(record, 'characters', used, key))
    })

  return { ...emptyLoreDocument('characters'), entries }
}

function normalizeLegacyWorld(category: Exclude<LoreCategory, 'characters'>, data: unknown): LoreDocument {
  const used = new Set<string>()
  if (!data || typeof data !== 'object') return emptyLoreDocument(category)
  const entries = Object.entries(data as Record<string, unknown>).map(([key, value]) =>
    canonicalEntry({
      id: key,
      title: humanizeKey(key),
      entry_type: worldEntryType(key),
      content: valueToMarkdown(value),
    }, category, used, key)
  )
  return { ...emptyLoreDocument(category), entries }
}

export function emptyLoreDocument(category: LoreCategory): LoreDocument {
  return {
    schema_version: LORE_SCHEMA_VERSION,
    category,
    revision: 0,
    entries: [],
  }
}

export function normalizeLoreDocument(category: LoreCategory, data: unknown): LoreDocument {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (record.schema_version === LORE_SCHEMA_VERSION && Array.isArray(record.entries)) {
      return normalizeCanonicalDocument(category, record)
    }
    if ('id' in record && ('title' in record || 'name' in record) && ('content' in record || 'entry_type' in record)) {
      const used = new Set<string>()
      return {
        ...emptyLoreDocument(category),
        entries: [canonicalEntry(record, category, used, String(record.id || record.title || record.name))],
      }
    }
  }
  return category === 'characters'
    ? normalizeLegacyCharacters(data)
    : normalizeLegacyWorld(category, data)
}

export function loreFilePath(bookDir: string, category: LoreCategory): string {
  return path.join(
    bookDir,
    '01_Global_Settings',
    category === 'characters'
      ? 'characters.json'
      : category === 'story_bible'
        ? 'story_bible.json'
        : 'world_lore.json',
  )
}

export function readLoreDocument(bookDir: string, category: LoreCategory): LoreDocument {
  return normalizeLoreDocument(category, safeReadJson(loreFilePath(bookDir, category)))
}

export function mergeLoreDocuments(current: LoreDocument, incoming: LoreDocument): LoreDocument {
  const byId = new Map(current.entries.map(entry => [entry.id, entry]))
  for (const entry of incoming.entries) byId.set(entry.id, entry)
  return {
    ...current,
    entries: [...byId.values()],
  }
}

interface UpdateLoreOptions {
  expectedRevision?: number
  auditTool: string
  auditArgs?: Record<string, unknown>
}

export async function updateLoreDocument(
  bookDir: string,
  category: LoreCategory,
  updater: (current: LoreDocument) => LoreDocument,
  options: UpdateLoreOptions,
): Promise<LoreDocument> {
  const target = loreFilePath(bookDir, category)
  return withFileLock(target, () => {
    const current = readLoreDocument(bookDir, category)
    if (
      options.expectedRevision !== undefined &&
      options.expectedRevision !== current.revision
    ) {
      throw new LoreRevisionConflictError(options.expectedRevision, current.revision)
    }

    const proposed = normalizeLoreDocument(category, updater(current))
    const next: LoreDocument = {
      ...proposed,
      schema_version: LORE_SCHEMA_VERSION,
      category,
      revision: current.revision + 1,
      entries: proposed.entries.map(entry => ({
        ...entry,
        updated_at: entry.updated_at || new Date().toISOString(),
      })),
    }
    const parsed = loreDocumentSchema.parse(next)
    createBackup(target)
    writeJson(target, parsed)
    appendAuditLog(
      path.join(bookDir, 'audit_log.jsonl'),
      options.auditTool,
      { category, ...(options.auditArgs || {}) },
      `saved revision ${parsed.revision} (${parsed.entries.length} entries)`,
      true,
    )
    return parsed
  })
}

export function renderLoreDocumentForPrompt(document: LoreDocument, entryLimit = 1000): string {
  return document.entries
    .filter(entry => entry.status !== 'deprecated')
    .slice(0, entryLimit)
    .map(entry => {
      const metadata = [
        entry.entry_type,
        entry.status === 'draft' ? '草案' : '已确认',
        entry.aliases.length ? `别名：${entry.aliases.join('、')}` : '',
        entry.tags.length ? `标签：${entry.tags.join('、')}` : '',
      ].filter(Boolean).join(' · ')
      return `### ${entry.title}\n${metadata}\n\n${entry.content}`.trim()
    })
    .join('\n\n')
}

export function migrateLoreDocumentFile(bookDir: string, category: LoreCategory): boolean {
  const target = loreFilePath(bookDir, category)
  const raw = safeReadJson<Record<string, unknown>>(target)
  if (!raw || (raw.schema_version === LORE_SCHEMA_VERSION && Array.isArray(raw.entries))) return false
  const backup = `${target}.pre-lore-v1.bak`
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup)
  const migrated = normalizeLoreDocument(category, raw)
  migrated.revision = 1
  const now = new Date().toISOString()
  migrated.entries = migrated.entries.map(entry => ({ ...entry, updated_at: now }))
  writeJson(target, loreDocumentSchema.parse(migrated))
  return true
}
