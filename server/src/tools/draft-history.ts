/**
 * Per-chapter draft history archive.
 *
 * The single `.bak` produced by createBackup() only holds one prior version —
 * a 5th rewrite of ch01 silently destroys versions 2-4. .draft_history/ keeps
 * up to MAX_DRAFT_VERSIONS prior contents per chapter so the user can roll
 * back through the agent's iterations.
 *
 * Layout:
 *   books/{bookId}/.draft_history/{chapterId}/{iso-ts}.md
 *
 * Old versions beyond the cap are dropped oldest-first.
 */
import fs from 'fs'
import path from 'path'

export const DRAFT_HISTORY_DIR = '.draft_history'
export const MAX_DRAFT_VERSIONS = 10

function chapterHistoryDir(bookDir: string, chapterId: string): string {
  return path.join(bookDir, DRAFT_HISTORY_DIR, chapterId)
}

/**
 * Derive a stable chapter ID from a draft filename. `ch01.md` → `ch01`.
 * Returns null if the filename doesn't look like a chapter draft, so callers
 * can skip archiving for unexpected inputs without crashing.
 */
export function chapterIdFromFilename(filename: string): string | null {
  const m = filename.match(/^(ch\d{1,4})\.md$/i)
  return m ? m[1].toLowerCase() : null
}

function tsStamp(): string {
  // ISO-ish, filesystem-safe (no colons): 20260414T210530-123Z
  const d = new Date()
  return d.toISOString().replace(/[-:]/g, '').replace(/\.(\d+)Z$/, '-$1Z')
}

/**
 * Archive the current contents of `targetPath` (if it exists) into the
 * chapter's history dir, then prune oldest versions beyond MAX_DRAFT_VERSIONS.
 *
 * Returns the archived file path, or null if nothing to archive (file didn't
 * exist or we couldn't derive a chapter id from the filename).
 */
export function archivePriorDraft(
  bookDir: string,
  targetPath: string,
): string | null {
  if (!fs.existsSync(targetPath)) return null

  const chapterId = chapterIdFromFilename(path.basename(targetPath))
  if (!chapterId) return null

  const dir = chapterHistoryDir(bookDir, chapterId)
  fs.mkdirSync(dir, { recursive: true })

  const archivePath = path.join(dir, `${tsStamp()}.md`)
  fs.copyFileSync(targetPath, archivePath)

  pruneOldVersions(dir)
  return archivePath
}

/** Drop oldest versions beyond MAX_DRAFT_VERSIONS (lexicographic = chronological). */
function pruneOldVersions(dir: string): void {
  const entries = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
  if (entries.length <= MAX_DRAFT_VERSIONS) return
  for (const old of entries.slice(0, entries.length - MAX_DRAFT_VERSIONS)) {
    fs.rmSync(path.join(dir, old), { force: true })
  }
}

/** List archived versions for a chapter, newest-first. */
export function listDraftHistory(bookDir: string, chapterId: string): string[] {
  const dir = chapterHistoryDir(bookDir, chapterId)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()
}
