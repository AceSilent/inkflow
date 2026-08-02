/**
 * Durable, attributed chapter revisions.
 *
 * Historical InkFlow builds only copied the pre-save draft to a timestamped
 * Markdown file. Those files remain readable as `legacy` revisions. New saves
 * add a JSON sidecar so the UI and Author Agent can distinguish user edits,
 * Agent edits, restores, and their parent revisions without guessing.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { createTwoFilesPatch, diffLines } from 'diff'
import { createBackup } from './safety.js'

export const DRAFT_HISTORY_DIR = '.draft_history'
export const MAX_DRAFT_VERSIONS = 200
export const DRAFT_REVISION_SCHEMA_VERSION = 1

export type DraftRevisionActor = 'user' | 'agent' | 'system' | 'legacy'
export type DraftRevisionSource = 'workbench' | 'save_draft' | 'restore' | 'legacy'

export interface DraftRevisionMeta {
  schema_version: 1
  id: string
  chapter_id: string
  created_at: string
  actor: DraftRevisionActor
  source: DraftRevisionSource
  parent_revision_id: string | null
  content_hash: string
  bytes: number
  chars: number
  lines: number
  restored_from?: string
  note?: string
  is_current?: boolean
}

export interface DraftDiffChange {
  type: 'equal' | 'add' | 'remove'
  lines: string[]
}

export interface DraftRevisionDiff {
  from: DraftRevisionMeta
  to: DraftRevisionMeta
  additions: number
  deletions: number
  changes: DraftDiffChange[]
  unified_diff: string
}

export interface SaveDraftRevisionInput {
  bookDir: string
  targetPath: string
  content: string
  actor: Exclude<DraftRevisionActor, 'legacy'>
  source: Exclude<DraftRevisionSource, 'legacy'>
  expectedHash?: string
  restoredFrom?: string
  note?: string
}

export class DraftRevisionConflictError extends Error {
  readonly currentHash: string

  constructor(currentHash: string) {
    super('Draft changed after it was loaded')
    this.name = 'DraftRevisionConflictError'
    this.currentHash = currentHash
  }
}

function chapterHistoryDir(bookDir: string, chapterId: string): string {
  return path.join(bookDir, DRAFT_HISTORY_DIR, chapterId)
}

function revisionMarkdownPath(bookDir: string, chapterId: string, revisionId: string): string {
  return path.join(chapterHistoryDir(bookDir, chapterId), `${revisionId}.md`)
}

function revisionMetaPath(bookDir: string, chapterId: string, revisionId: string): string {
  return path.join(chapterHistoryDir(bookDir, chapterId), `${revisionId}.json`)
}

/**
 * Derive a stable chapter ID from a draft filename. `ch01.md` -> `ch01`.
 */
export function chapterIdFromFilename(filename: string): string | null {
  const m = filename.match(/^(ch\d{1,4})\.md$/i)
  return m ? m[1].toLowerCase() : null
}

export function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

function tsStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.(\d+)Z$/, '-$1Z')
}

function parseTimestampFromId(id: string, fallbackMs: number): string {
  const match = id.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})-(\d{3})Z/)
  if (!match) return new Date(fallbackMs).toISOString()
  const [, year, month, day, hour, minute, second, millis] = match
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`).toISOString()
}

function lineCount(content: string): number {
  if (content.length === 0) return 0
  return content.split('\n').length
}

function buildMeta(
  id: string,
  chapterId: string,
  content: string,
  input: {
    createdAt?: string
    actor: DraftRevisionActor
    source: DraftRevisionSource
    parentRevisionId?: string | null
    restoredFrom?: string
    note?: string
  },
): DraftRevisionMeta {
  return {
    schema_version: DRAFT_REVISION_SCHEMA_VERSION,
    id,
    chapter_id: chapterId,
    created_at: input.createdAt ?? new Date().toISOString(),
    actor: input.actor,
    source: input.source,
    parent_revision_id: input.parentRevisionId ?? null,
    content_hash: contentHash(content),
    bytes: Buffer.byteLength(content, 'utf8'),
    chars: content.length,
    lines: lineCount(content),
    ...(input.restoredFrom ? { restored_from: input.restoredFrom } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
}

function isRevisionMeta(value: unknown): value is DraftRevisionMeta {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<DraftRevisionMeta>
  return item.schema_version === DRAFT_REVISION_SCHEMA_VERSION
    && typeof item.id === 'string'
    && typeof item.chapter_id === 'string'
    && typeof item.created_at === 'string'
    && typeof item.content_hash === 'string'
    && ['user', 'agent', 'system', 'legacy'].includes(item.actor ?? '')
    && ['workbench', 'save_draft', 'restore', 'legacy'].includes(item.source ?? '')
}

function readStoredMeta(
  bookDir: string,
  chapterId: string,
  revisionId: string,
): DraftRevisionMeta | null {
  const metaPath = revisionMetaPath(bookDir, chapterId, revisionId)
  if (!fs.existsSync(metaPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    return isRevisionMeta(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readRevisionContent(
  bookDir: string,
  chapterId: string,
  revisionId: string,
): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(revisionId)) return null
  const file = revisionMarkdownPath(bookDir, chapterId, revisionId)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null
  return fs.readFileSync(file, 'utf8')
}

function listStoredRevisions(bookDir: string, chapterId: string): DraftRevisionMeta[] {
  const dir = chapterHistoryDir(bookDir, chapterId)
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .map(file => {
      const id = file.slice(0, -3)
      const content = fs.readFileSync(path.join(dir, file), 'utf8')
      const stored = readStoredMeta(bookDir, chapterId, id)
      if (stored) return stored
      const stat = fs.statSync(path.join(dir, file))
      return buildMeta(id, chapterId, content, {
        createdAt: parseTimestampFromId(id, stat.mtimeMs),
        actor: 'legacy',
        source: 'legacy',
      })
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function findRevisionByHash(
  bookDir: string,
  chapterId: string,
  hash: string,
): DraftRevisionMeta | null {
  return listStoredRevisions(bookDir, chapterId)
    .find(revision => revision.content_hash === hash) ?? null
}

function nextRevisionId(bookDir: string, chapterId: string): string {
  const base = tsStamp()
  const dir = chapterHistoryDir(bookDir, chapterId)
  let id = base
  let suffix = 1
  while (fs.existsSync(path.join(dir, `${id}.md`))) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  return id
}

function storeRevision(
  bookDir: string,
  chapterId: string,
  content: string,
  input: {
    createdAt?: string
    actor: DraftRevisionActor
    source: DraftRevisionSource
    parentRevisionId?: string | null
    restoredFrom?: string
    note?: string
  },
): DraftRevisionMeta {
  const dir = chapterHistoryDir(bookDir, chapterId)
  fs.mkdirSync(dir, { recursive: true })
  const id = nextRevisionId(bookDir, chapterId)
  const meta = buildMeta(id, chapterId, content, input)
  fs.writeFileSync(revisionMarkdownPath(bookDir, chapterId, id), content, 'utf8')
  fs.writeFileSync(revisionMetaPath(bookDir, chapterId, id), JSON.stringify(meta, null, 2), 'utf8')
  pruneOldVersions(dir)
  return meta
}

function ensureBaselineRevision(
  bookDir: string,
  chapterId: string,
  targetPath: string,
): DraftRevisionMeta | null {
  if (!fs.existsSync(targetPath)) return null
  const content = fs.readFileSync(targetPath, 'utf8')
  const matching = findRevisionByHash(bookDir, chapterId, contentHash(content))
  if (matching) return matching
  const stat = fs.statSync(targetPath)
  return storeRevision(bookDir, chapterId, content, {
    createdAt: stat.mtime.toISOString(),
    actor: 'legacy',
    source: 'legacy',
    note: '升级版本历史时登记的现有正文',
  })
}

function writeFileAtomic(targetPath: string, content: string): void {
  const tempPath = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tempPath, content, 'utf8')
  try {
    fs.renameSync(tempPath, targetPath)
  } finally {
    fs.rmSync(tempPath, { force: true })
  }
}

/**
 * Save a chapter and record the resulting revision. expectedHash is an
 * optimistic-concurrency token; a stale editor receives a conflict instead of
 * silently overwriting an Agent or user save.
 */
export function saveDraftRevision(input: SaveDraftRevisionInput): DraftRevisionMeta {
  const chapterId = chapterIdFromFilename(path.basename(input.targetPath))
  if (!chapterId) throw new Error('Draft filename must use ch{N}.md')

  const currentContent = fs.existsSync(input.targetPath)
    ? fs.readFileSync(input.targetPath, 'utf8')
    : ''
  const currentHash = contentHash(currentContent)
  if (input.expectedHash !== undefined && input.expectedHash !== currentHash) {
    throw new DraftRevisionConflictError(currentHash)
  }

  const parent = ensureBaselineRevision(input.bookDir, chapterId, input.targetPath)
  if (fs.existsSync(input.targetPath) && currentContent === input.content && parent) {
    return { ...parent, is_current: true }
  }

  fs.mkdirSync(path.dirname(input.targetPath), { recursive: true })
  createBackup(input.targetPath)
  writeFileAtomic(input.targetPath, input.content)

  return {
    ...storeRevision(input.bookDir, chapterId, input.content, {
      actor: input.actor,
      source: input.source,
      parentRevisionId: parent?.id ?? null,
      restoredFrom: input.restoredFrom,
      note: input.note,
    }),
    is_current: true,
  }
}

/**
 * Backward-compatible archive entry point used by older callers and tests.
 * New saves should use saveDraftRevision() so the resulting revision is
 * attributed instead of only copying the prior content.
 */
export function archivePriorDraft(bookDir: string, targetPath: string): string | null {
  if (!fs.existsSync(targetPath)) return null
  const chapterId = chapterIdFromFilename(path.basename(targetPath))
  if (!chapterId) return null
  const content = fs.readFileSync(targetPath, 'utf8')
  const existing = findRevisionByHash(bookDir, chapterId, contentHash(content))
  if (existing) return revisionMarkdownPath(bookDir, chapterId, existing.id)
  const revision = storeRevision(bookDir, chapterId, content, {
    actor: 'legacy',
    source: 'legacy',
  })
  return revisionMarkdownPath(bookDir, chapterId, revision.id)
}

/** List revisions newest-first. The live draft is marked is_current. */
export function listDraftVersions(
  bookDir: string,
  chapterId: string,
  currentDraftPath?: string,
): DraftRevisionMeta[] {
  const revisions = listStoredRevisions(bookDir, chapterId)
  if (!currentDraftPath || !fs.existsSync(currentDraftPath)) return revisions

  const currentContent = fs.readFileSync(currentDraftPath, 'utf8')
  const hash = contentHash(currentContent)
  const matching = revisions.find(revision => revision.content_hash === hash)
  if (matching) {
    return revisions.map(revision => ({
      ...revision,
      is_current: revision.id === matching.id,
    }))
  }

  const stat = fs.statSync(currentDraftPath)
  return [
    {
      ...buildMeta('current', chapterId, currentContent, {
        createdAt: stat.mtime.toISOString(),
        actor: 'legacy',
        source: 'legacy',
      }),
      is_current: true,
    },
    ...revisions,
  ]
}

/** Legacy filename listing retained for callers that only need archive names. */
export function listDraftHistory(bookDir: string, chapterId: string): string[] {
  return listStoredRevisions(bookDir, chapterId).map(revision => `${revision.id}.md`)
}

export function readDraftVersion(
  bookDir: string,
  chapterId: string,
  revisionId: string,
  currentDraftPath: string,
): { meta: DraftRevisionMeta; content: string } | null {
  if (revisionId === 'current') {
    if (!fs.existsSync(currentDraftPath)) return null
    const content = fs.readFileSync(currentDraftPath, 'utf8')
    const current = listDraftVersions(bookDir, chapterId, currentDraftPath)
      .find(revision => revision.is_current)
    if (!current) return null
    return { meta: current, content }
  }

  const content = readRevisionContent(bookDir, chapterId, revisionId)
  if (content === null) return null
  const meta = listStoredRevisions(bookDir, chapterId)
    .find(revision => revision.id === revisionId)
  return meta ? { meta, content } : null
}

function splitDiffLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function compareDraftVersions(
  bookDir: string,
  chapterId: string,
  fromRevisionId: string,
  toRevisionId: string,
  currentDraftPath: string,
): DraftRevisionDiff | null {
  const from = readDraftVersion(bookDir, chapterId, fromRevisionId, currentDraftPath)
  const to = readDraftVersion(bookDir, chapterId, toRevisionId, currentDraftPath)
  if (!from || !to) return null

  let additions = 0
  let deletions = 0
  const changes = diffLines(from.content, to.content)
    .map(part => {
      const lines = splitDiffLines(part.value)
      if (part.added) additions += lines.length
      if (part.removed) deletions += lines.length
      return {
        type: part.added ? 'add' : part.removed ? 'remove' : 'equal',
        lines,
      } satisfies DraftDiffChange
    })
    .filter(change => change.lines.length > 0)

  return {
    from: from.meta,
    to: to.meta,
    additions,
    deletions,
    changes,
    unified_diff: createTwoFilesPatch(
      `${chapterId}@${from.meta.id}`,
      `${chapterId}@${to.meta.id}`,
      from.content,
      to.content,
      from.meta.created_at,
      to.meta.created_at,
      { context: 3 },
    ),
  }
}

export function restoreDraftVersion(
  bookDir: string,
  chapterId: string,
  revisionId: string,
  currentDraftPath: string,
  expectedHash: string,
): DraftRevisionMeta | null {
  const target = readDraftVersion(bookDir, chapterId, revisionId, currentDraftPath)
  if (!target) return null
  return saveDraftRevision({
    bookDir,
    targetPath: currentDraftPath,
    content: target.content,
    actor: 'user',
    source: 'restore',
    expectedHash,
    restoredFrom: revisionId,
  })
}

/** Drop oldest version pairs beyond the cap. */
function pruneOldVersions(dir: string): void {
  const markdown = fs.readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .sort()
  if (markdown.length <= MAX_DRAFT_VERSIONS) return
  for (const old of markdown.slice(0, markdown.length - MAX_DRAFT_VERSIONS)) {
    const id = old.slice(0, -3)
    fs.rmSync(path.join(dir, old), { force: true })
    fs.rmSync(path.join(dir, `${id}.json`), { force: true })
  }
}
