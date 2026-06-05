import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { ensureDir, safeReadJson, writeJson } from '../utils/file-io.js'
import { listMemories, writeMemory, type MemoryEntry } from '../memory/memory-service.js'
import { parseMarkdownMemory } from '../memory/markdown-io.js'
import type { ChatHistoryMessage } from '../routes/chat-history.js'
import type { AssistantSegment } from '../routes/stream-segments.js'

export type ObservationSource = 'runtime' | 'history_segment'
export type WorkingSetStatus = 'active' | 'stale'

export interface ObservationResource {
  relativePath?: string
  size?: number
  mtimeMs?: number
  sha256?: string
}

export interface ToolObservationEvent {
  schemaVersion: 1
  id: string
  ts: string
  bookId: string
  source: ObservationSource
  toolName: string
  args: Record<string, unknown>
  status: 'done' | 'error'
  resultPreview: string
  resultHash: string
  resource?: ObservationResource
  sourceMessageIndex?: number
  sourceSegmentIndex?: number
}

export interface WorkingSetEntry {
  id: string
  eventId: string
  toolName: string
  label: string
  status: WorkingSetStatus
  observedAt: string
  args: Record<string, unknown>
  excerpt: string
  resultHash: string
  source?: ObservationResource
  staleReason?: string
}

export interface WorkingSet {
  schemaVersion: 1
  bookId: string
  updatedAt: string
  entries: WorkingSetEntry[]
}

export interface ObservationMigrationResult {
  migratedEvents: number
  indexedMemories: number
  materializedMemories: number
  manifestPath: string
}

interface MemoryManifestEntry {
  id: string
  scope: 'book' | 'user' | 'session'
  type: string
  status: 'pending' | 'active' | 'archived'
  confidence: number
  tags: string[]
  source: string
  bookId?: string
  filePath: string
  bodyHash: string
  updatedAt: string
}

const OBSERVATION_TOOLS = new Set([
  'read_file',
  'read_outline',
  'read_game_outline',
  'read_graph',
  'search_lore',
  'query_unresolved_setups',
  'browse_examples',
  'list_files',
  'load_skill',
])

const WRITE_TOOLS = new Set([
  'save_draft',
  'save_outline',
  'save_game_outline',
  'save_lore',
  'save_script',
  'add_plot_node',
  'add_edge',
  'remove_edge',
  'confirm_path',
  'prune_branch',
  'merge_branches',
])

const MAX_WORKING_SET_ENTRIES = 16
const EVENT_RESULT_PREVIEW_CHARS = 2400
const PROMPT_EXCERPT_CHARS = 700

function bookDir(dataDir: string, bookId: string): string {
  return path.join(dataDir, bookId)
}

export function inkflowDir(dataDir: string, bookId: string): string {
  return ensureDir(path.join(bookDir(dataDir, bookId), '.inkflow'))
}

function observationsDir(dataDir: string, bookId: string): string {
  return ensureDir(path.join(inkflowDir(dataDir, bookId), 'observations'))
}

export function observationEventsPath(dataDir: string, bookId: string): string {
  return path.join(observationsDir(dataDir, bookId), 'tool_events.jsonl')
}

export function workingSetPath(dataDir: string, bookId: string): string {
  return path.join(observationsDir(dataDir, bookId), 'working_set.json')
}

function migrationManifestPath(dataDir: string, bookId: string): string {
  return path.join(inkflowDir(dataDir, bookId), 'migration_manifest.json')
}

function memoryManifestPath(dataDir: string, bookId: string): string {
  return path.join(inkflowDir(dataDir, bookId), 'memory_manifest.json')
}

function sha256(text: string | Buffer): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseArgsPreview(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function resultPreview(result: unknown): string {
  return String(result ?? '').slice(0, EVENT_RESULT_PREVIEW_CHARS)
}

function labelFor(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'load_skill' && typeof args.skill_name === 'string') return args.skill_name
  if (toolName === 'browse_examples') {
    const category = typeof args.category === 'string' ? args.category : ''
    const tags = Array.isArray(args.tags) ? args.tags.filter(tag => typeof tag === 'string').join(',') : ''
    return [category, tags].filter(Boolean).join(' / ') || 'examples'
  }
  if (toolName === 'read_graph') return 'plot_graph'
  if (toolName === 'query_unresolved_setups') return typeof args.current_chapter === 'string' ? `unresolved:${args.current_chapter}` : 'unresolved_setups'
  if (toolName === 'read_outline') return typeof args.volume === 'number' ? `outline:volume-${args.volume}` : 'outline'
  if (toolName === 'read_game_outline') return 'game_outline'

  const value = args.relative_path
    ?? args.file_path
    ?? args.path
    ?? args.skill_name
    ?? args.category
    ?? args.chapter_id
    ?? args.chapterId
    ?? args.package_id
    ?? args.query
    ?? args.name
  if (typeof value === 'string' && value.trim()) return value.trim()
  return toolName
}

function workingSetIdentity(input: {
  toolName: string
  args: Record<string, unknown>
  label: string
  source?: ObservationResource
}): string {
  if (input.source?.relativePath) return `${input.toolName}:path:${input.source.relativePath}`

  const args = input.args
  if (input.toolName === 'load_skill' && typeof args.skill_name === 'string') {
    return `${input.toolName}:skill:${args.skill_name}`
  }
  if (input.toolName === 'browse_examples') {
    const category = typeof args.category === 'string' ? args.category : ''
    const tags = Array.isArray(args.tags) ? args.tags.filter(tag => typeof tag === 'string').sort().join(',') : ''
    return `${input.toolName}:${category}:${tags}`
  }
  if (input.toolName === 'read_outline') return `${input.toolName}:${args.volume ?? 'all'}`
  if (input.toolName === 'read_game_outline') return input.toolName
  if (input.toolName === 'read_graph') return input.toolName
  if (input.toolName === 'query_unresolved_setups') return `${input.toolName}:${args.current_chapter ?? 'all'}`
  if (input.toolName === 'search_lore' && typeof args.query === 'string') return `${input.toolName}:${args.query}`
  if (input.toolName === 'list_files') return `${input.toolName}:${args.relative_path ?? args.path ?? ''}`

  return `${input.toolName}:${input.label}:${stableJson(args)}`
}

function trimWorkingSetEntries(entries: WorkingSetEntry[]): WorkingSetEntry[] {
  const active = entries.filter(entry => entry.status === 'active')
  const stale = entries.filter(entry => entry.status === 'stale')
  return [...active, ...stale].slice(0, MAX_WORKING_SET_ENTRIES)
}

function draftRelativePathFromSaveDraftArgs(args: Record<string, unknown>): string | null {
  const filePath = typeof args.file_path === 'string' ? path.basename(args.file_path) : ''
  if (!filePath) return null
  return path.posix.join('04_Drafts', filePath)
}

function resourceForTool(dataDir: string, bookId: string, toolName: string, args: Record<string, unknown>): ObservationResource | undefined {
  if (toolName !== 'read_file') return undefined
  const relativePath = typeof args.relative_path === 'string' ? args.relative_path : ''
  if (!relativePath) return undefined
  const root = bookDir(dataDir, bookId)
  const absPath = path.resolve(root, relativePath)
  if (!absPath.startsWith(path.resolve(root))) return { relativePath }
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return { relativePath }
  const stat = fs.statSync(absPath)
  const bytes = fs.readFileSync(absPath)
  return {
    relativePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256(bytes),
  }
}

function makeEventId(input: {
  bookId: string
  source: ObservationSource
  toolName: string
  args: Record<string, unknown>
  resultPreview: string
  sourceMessageIndex?: number
  sourceSegmentIndex?: number
}): string {
  const seed = [
    input.bookId,
    input.source,
    input.toolName,
    stableJson(input.args),
    input.resultPreview,
    input.sourceMessageIndex ?? '',
    input.sourceSegmentIndex ?? '',
  ].join('\n')
  return `obs_${sha256(seed).slice(0, 20)}`
}

function buildEvent(input: {
  dataDir: string
  bookId: string
  source: ObservationSource
  toolName: string
  args: Record<string, unknown>
  result: unknown
  status?: 'done' | 'error'
  sourceMessageIndex?: number
  sourceSegmentIndex?: number
}): ToolObservationEvent {
  const preview = resultPreview(input.result)
  return {
    schemaVersion: 1,
    id: makeEventId({
      bookId: input.bookId,
      source: input.source,
      toolName: input.toolName,
      args: input.args,
      resultPreview: preview,
      sourceMessageIndex: input.sourceMessageIndex,
      sourceSegmentIndex: input.sourceSegmentIndex,
    }),
    ts: nowIso(),
    bookId: input.bookId,
    source: input.source,
    toolName: input.toolName,
    args: input.args,
    status: input.status ?? 'done',
    resultPreview: preview,
    resultHash: sha256(preview),
    resource: resourceForTool(input.dataDir, input.bookId, input.toolName, input.args),
    sourceMessageIndex: input.sourceMessageIndex,
    sourceSegmentIndex: input.sourceSegmentIndex,
  }
}

export function loadObservationEvents(dataDir: string, bookId: string): ToolObservationEvent[] {
  const filePath = observationEventsPath(dataDir, bookId)
  if (!fs.existsSync(filePath)) return []
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as ToolObservationEvent } catch { return null }
    })
    .filter((event): event is ToolObservationEvent => !!event)
}

function appendObservationEvents(dataDir: string, bookId: string, events: ToolObservationEvent[]): number {
  if (events.length === 0) return 0
  const existingIds = new Set(loadObservationEvents(dataDir, bookId).map(event => event.id))
  const fresh = events.filter(event => !existingIds.has(event.id))
  if (fresh.length === 0) return 0
  const filePath = observationEventsPath(dataDir, bookId)
  fs.appendFileSync(filePath, fresh.map(event => JSON.stringify(event)).join('\n') + '\n', 'utf8')
  return fresh.length
}

export function loadWorkingSet(dataDir: string, bookId: string): WorkingSet {
  return safeReadJson<WorkingSet>(workingSetPath(dataDir, bookId)) ?? {
    schemaVersion: 1,
    bookId,
    updatedAt: nowIso(),
    entries: [],
  }
}

function writeWorkingSet(dataDir: string, bookId: string, workingSet: WorkingSet): void {
  writeJson(workingSetPath(dataDir, bookId), workingSet)
}

function applyEventToWorkingSet(workingSet: WorkingSet, event: ToolObservationEvent): WorkingSet {
  let entries = [...workingSet.entries]

  if (WRITE_TOOLS.has(event.toolName)) {
    entries = invalidateEntries(entries, event)
  }

  if (OBSERVATION_TOOLS.has(event.toolName) && event.status === 'done') {
    const entry: WorkingSetEntry = {
      id: `ws_${event.id.slice(4)}`,
      eventId: event.id,
      toolName: event.toolName,
      label: labelFor(event.toolName, event.args),
      status: 'active',
      observedAt: event.ts,
      args: event.args,
      excerpt: event.resultPreview.replace(/\s+/g, ' ').slice(0, PROMPT_EXCERPT_CHARS),
      resultHash: event.resultHash,
      source: event.resource,
    }
    const identity = workingSetIdentity({
      toolName: entry.toolName,
      args: entry.args,
      label: entry.label,
      source: entry.source,
    })
    entries = [
      entry,
      ...entries.filter(existing => existing.id !== entry.id && workingSetIdentity(existing) !== identity),
    ]
  }

  return {
    schemaVersion: 1,
    bookId: workingSet.bookId,
    updatedAt: nowIso(),
    entries: trimWorkingSetEntries(entries),
  }
}

function invalidateEntries(entries: WorkingSetEntry[], event: ToolObservationEvent): WorkingSetEntry[] {
  if (event.toolName === 'save_draft') {
    const relPath = draftRelativePathFromSaveDraftArgs(event.args)
    if (!relPath) return entries
    return entries.map(entry => {
      if (entry.source?.relativePath !== relPath && entry.label !== relPath) return entry
      return { ...entry, status: 'stale', staleReason: `Invalidated by ${event.toolName}` }
    })
  }

  if (event.toolName === 'save_outline') return staleByTool(entries, ['read_outline'], event.toolName)
  if (event.toolName === 'save_game_outline') return staleByTool(entries, ['read_game_outline'], event.toolName)
  if (event.toolName === 'save_lore') return staleByTool(entries, ['search_lore'], event.toolName)
  if (['add_plot_node', 'add_edge', 'remove_edge', 'confirm_path', 'prune_branch', 'merge_branches'].includes(event.toolName)) {
    return staleByTool(entries, ['read_graph', 'query_unresolved_setups'], event.toolName)
  }
  return entries
}

function staleByTool(entries: WorkingSetEntry[], toolNames: string[], reasonTool: string): WorkingSetEntry[] {
  const names = new Set(toolNames)
  return entries.map(entry => names.has(entry.toolName)
    ? { ...entry, status: 'stale', staleReason: `Invalidated by ${reasonTool}` }
    : entry)
}

function rebuildWorkingSet(dataDir: string, bookId: string): WorkingSet {
  const events = loadObservationEvents(dataDir, bookId)
  let workingSet: WorkingSet = { schemaVersion: 1, bookId, updatedAt: nowIso(), entries: [] }
  for (const event of events) {
    workingSet = applyEventToWorkingSet(workingSet, event)
  }
  writeWorkingSet(dataDir, bookId, workingSet)
  return workingSet
}

export function recordToolObservation(
  dataDir: string,
  bookId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  status: 'done' | 'error' = 'done',
): ToolObservationEvent {
  const event = buildEvent({ dataDir, bookId, source: 'runtime', toolName, args, result, status })
  appendObservationEvents(dataDir, bookId, [event])
  const next = applyEventToWorkingSet(loadWorkingSet(dataDir, bookId), event)
  writeWorkingSet(dataDir, bookId, next)
  return event
}

function migrateEventsFromHistory(dataDir: string, bookId: string): ToolObservationEvent[] {
  const historyPath = path.join(bookDir(dataDir, bookId), 'author_chat_history.json')
  const history = safeReadJson<ChatHistoryMessage[]>(historyPath) ?? []
  const events: ToolObservationEvent[] = []

  history.forEach((message, messageIndex) => {
    const segments = (message as ChatHistoryMessage & { segments?: AssistantSegment[] }).segments
    if (message.role !== 'assistant' || !Array.isArray(segments)) return
    segments.forEach((segment, segmentIndex) => {
      if (segment.type !== 'tool_call') return
      if (segment.status !== 'done') return
      if (!OBSERVATION_TOOLS.has(segment.name) && !WRITE_TOOLS.has(segment.name)) return
      events.push(buildEvent({
        dataDir,
        bookId,
        source: 'history_segment',
        toolName: segment.name,
        args: parseArgsPreview(segment.argsPreview),
        result: segment.result ?? '',
        status: 'done',
        sourceMessageIndex: messageIndex,
        sourceSegmentIndex: segmentIndex,
      }))
    })
  })

  return events
}

function findSessionSummaries(dataDir: string, bookId: string): MemoryEntry[] {
  const dir = path.join(dataDir, bookId, 'session_summaries')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const filePath = path.join(dir, file)
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseMarkdownMemory(raw)
      return frontmatter ? { frontmatter, body, filePath } : null
    })
    .filter((entry): entry is MemoryEntry => !!entry)
}

function memoryHeading(entry: MemoryEntry): string {
  return entry.body.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.frontmatter.type
}

function memoryDigestLine(entry: MemoryEntry): string {
  const body = entry.body
    .replace(/^#[^\n]*\n+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `- ${memoryHeading(entry)}：${body.slice(0, 180)}${body.length > 180 ? '...' : ''}`
}

function memoryMatches(entry: MemoryEntry, keywords: string[]): boolean {
  const haystack = [
    entry.frontmatter.type,
    ...(entry.frontmatter.tags ?? []),
    memoryHeading(entry),
    entry.body.slice(0, 240),
  ].join(' ').toLowerCase()
  return keywords.some(keyword => haystack.includes(keyword.toLowerCase()))
}

function digestId(bookId: string, name: string): string {
  const safeBook = bookId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'book'
  return `mem_${safeBook}_migration_${name}`
}

function materializeMigrationMemoryDigests(dataDir: string, bookId: string): number {
  const all = listMemories(dataDir, 'all')
  const existingIds = new Set(all.map(entry => entry.frontmatter.id))
  const pending = all
    .filter(entry =>
      entry.frontmatter.status === 'pending'
      && entry.frontmatter.confidence >= 0.75
      && (entry.frontmatter.book_id === bookId || entry.frontmatter.scope === 'user'),
    )
    .sort((a, b) => {
      if (b.frontmatter.confidence !== a.frontmatter.confidence) return b.frontmatter.confidence - a.frontmatter.confidence
      return a.frontmatter.created_at.localeCompare(b.frontmatter.created_at)
    })

  if (pending.length === 0) return 0

  const groups = [
    {
      name: 'world',
      type: 'fact',
      title: '迁移记忆：世界与核心设定',
      keywords: ['世界', '设定', '主角', '角色', '警署', '格雷赫文', 'fact', 'setting', 'character'],
    },
    {
      name: 'outline',
      type: 'plot_note',
      title: '迁移记忆：大纲与剧情结构',
      keywords: ['大纲', '第一卷', '章节', '剧情', 'plot', 'outline', 'volume', 'pacing'],
    },
    {
      name: 'style',
      type: 'preference',
      title: '迁移记忆：作者偏好与协作方式',
      keywords: ['偏好', 'ai腔', '旁白', '讲解', '同步', 'workflow', 'style', 'preference'],
    },
  ]

  let written = 0
  const used = new Set<string>()
  for (const group of groups) {
    const id = digestId(bookId, group.name)
    if (existingIds.has(id)) continue
    const entries = pending
      .filter(entry => !used.has(entry.frontmatter.id) && memoryMatches(entry, group.keywords))
      .slice(0, 6)
    if (entries.length === 0) continue
    for (const entry of entries) used.add(entry.frontmatter.id)

    writeMemory(dataDir, {
      id,
      scope: 'book',
      book_id: bookId,
      type: group.type,
      confidence: 0.92,
      tags: ['migration_digest', group.name],
      source: 'user_remember',
      source_event: 'migration_digest',
      status: 'active',
      created_at: nowIso(),
      approved_at: nowIso(),
    }, [
      `# ${group.title}`,
      '',
      ...entries.map(memoryDigestLine),
    ].join('\n'))
    written += 1
  }

  return written
}

function legacyMemoryId(relativePath: string): string {
  return `legacy_${relativePath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`
}

function findLegacyProjectMemoryFiles(dataDir: string, bookId: string): MemoryManifestEntry[] {
  const root = bookDir(dataDir, bookId)
  const memoryDir = path.join(root, 'memory')
  if (!fs.existsSync(memoryDir)) return []
  const out: MemoryManifestEntry[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const relativePath = path.relative(root, fullPath)
      const content = fs.readFileSync(fullPath)
      out.push({
        id: legacyMemoryId(relativePath),
        scope: 'book',
        type: 'legacy_project_memory',
        status: 'active',
        confidence: 1,
        tags: ['legacy_project_memory'],
        source: 'project_memory_v1',
        bookId,
        filePath: relativePath,
        bodyHash: sha256(content),
        updatedAt: fs.statSync(fullPath).mtime.toISOString(),
      })
    }
  }
  walk(memoryDir)
  return out
}

function writeMemoryManifest(dataDir: string, bookId: string): number {
  const root = bookDir(dataDir, bookId)
  const allMarkdown = [
    ...listMemories(dataDir, 'all').filter(entry =>
      entry.frontmatter.scope === 'user'
      || entry.frontmatter.book_id === bookId
      || entry.filePath.includes(`${path.sep}${bookId}${path.sep}`),
    ),
    ...findSessionSummaries(dataDir, bookId),
  ]
  const seen = new Set<string>()
  const markdownEntries: MemoryManifestEntry[] = allMarkdown
    .filter(entry => {
      const key = entry.filePath
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(entry => ({
      id: entry.frontmatter.id,
      scope: entry.frontmatter.scope,
      type: entry.frontmatter.type,
      status: entry.frontmatter.status,
      confidence: entry.frontmatter.confidence,
      tags: entry.frontmatter.tags ?? [],
      source: entry.frontmatter.source,
      bookId: entry.frontmatter.book_id,
      filePath: path.relative(root, entry.filePath),
      bodyHash: sha256(entry.body),
      updatedAt: fs.statSync(entry.filePath).mtime.toISOString(),
    }))

  const entries: MemoryManifestEntry[] = [
    ...markdownEntries,
    ...findLegacyProjectMemoryFiles(dataDir, bookId),
  ]
    .sort((a, b) => a.id.localeCompare(b.id))

  writeJson(memoryManifestPath(dataDir, bookId), {
    schemaVersion: 1,
    bookId,
    generatedAt: nowIso(),
    entries,
  })
  return entries.length
}

export function ensureObservationMigration(dataDir: string, bookId: string): ObservationMigrationResult {
  inkflowDir(dataDir, bookId)
  const migratedEvents = appendObservationEvents(dataDir, bookId, migrateEventsFromHistory(dataDir, bookId))
  rebuildWorkingSet(dataDir, bookId)
  const materializedMemories = materializeMigrationMemoryDigests(dataDir, bookId)
  const indexedMemories = writeMemoryManifest(dataDir, bookId)
  const manifestPath = migrationManifestPath(dataDir, bookId)
  writeJson(manifestPath, {
    schemaVersion: 1,
    bookId,
    migratedAt: nowIso(),
    migratedEvents,
    indexedMemories,
    materializedMemories,
  })
  return { migratedEvents, indexedMemories, materializedMemories, manifestPath }
}

export function renderWorkingSetForPrompt(dataDir: string, bookId: string, limit = 8): string {
  const entries = loadWorkingSet(dataDir, bookId).entries
    .filter(entry => entry.status === 'active')
    .slice(0, limit)
  if (entries.length === 0) return ''

  return [
    '以下是新版工作台观察，由工具事件账本生成，不是长期记忆。继续围绕这些材料讨论时可先使用；需要逐字核对、文件已变更或用户明确要求时，再读取原文。',
    '',
    ...entries.map(entry => `- ${entry.toolName}(${entry.label})：${entry.excerpt}`),
  ].join('\n')
}
