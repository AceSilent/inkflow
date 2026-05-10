/**
 * Per-book snapshot system — snapshot the book directory before each user
 * turn, keep the last MAX_SNAPSHOTS, restore by id.
 *
 * Layout:
 *   books/{bookId}/.snapshots/snap_{ts}/        — copy of book content at point-in-time
 *   books/{bookId}/.snapshots/snap_{ts}/_meta.json  — { id, created_at, label }
 *
 * Excluded from snapshots: .snapshots/ itself, *.bak, audit_log.jsonl (rotates).
 */
import fs from 'fs'
import path from 'path'
import { safeReadJson, writeJson } from '../utils/file-io.js'

export const SNAPSHOTS_DIR = '.snapshots'
export const MAX_SNAPSHOTS = 10
const META_FILE = '_meta.json'

export interface SnapshotMeta {
  id: string
  created_at: string
  label: string
}

function bookDir(dataDir: string, bookId: string): string {
  return path.join(dataDir, bookId)
}

function snapsRoot(dataDir: string, bookId: string): string {
  return path.join(bookDir(dataDir, bookId), SNAPSHOTS_DIR)
}

function snapPath(dataDir: string, bookId: string, snapId: string): string {
  return path.join(snapsRoot(dataDir, bookId), snapId)
}

/** True for paths we should never include inside a snapshot (or restore from). */
function isExcluded(absPath: string): boolean {
  const base = path.basename(absPath)
  if (base === SNAPSHOTS_DIR) return true
  if (base === '.draft_history') return true
  if (base.endsWith('.bak')) return true
  if (base === 'audit_log.jsonl') return true
  // Rotated audit logs (audit_log.jsonl.1, .2, .3) follow the same exclusion.
  if (/^audit_log\.jsonl\.\d+$/.test(base)) return true
  return false
}

/**
 * Snapshot the current state of `books/{bookId}/` under .snapshots/snap_{ts}/.
 * Prunes oldest snapshots if the count exceeds MAX_SNAPSHOTS.
 * The label is a short preview shown in the UI (typically the user's prompt).
 */
export function createSnapshot(dataDir: string, bookId: string, label: string): SnapshotMeta {
  const root = bookDir(dataDir, bookId)
  if (!fs.existsSync(root)) throw new Error(`Book '${bookId}' not found`)

  const id = `snap_${Date.now()}`
  const dest = snapPath(dataDir, bookId, id)
  fs.mkdirSync(dest, { recursive: true })

  // `dest` lives inside `root`; copying root -> dest directly throws
  // ERR_FS_CP_EINVAL before Node applies the filter. Copy top-level entries
  // instead so `.snapshots` can be skipped before recursion starts.
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const src = path.join(root, entry.name)
    if (isExcluded(src)) continue
    fs.cpSync(src, path.join(dest, entry.name), {
      recursive: true,
      filter: (p) => !isExcluded(p),
    })
  }

  const meta: SnapshotMeta = {
    id,
    created_at: new Date().toISOString(),
    label: label.slice(0, 200),
  }
  writeJson(path.join(dest, META_FILE), meta)

  pruneOldSnapshots(dataDir, bookId)
  return meta
}

/** List snapshots for a book, newest first. */
export function listSnapshots(dataDir: string, bookId: string): SnapshotMeta[] {
  const root = snapsRoot(dataDir, bookId)
  if (!fs.existsSync(root)) return []
  const out: SnapshotMeta[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const meta = safeReadJson<SnapshotMeta>(path.join(root, entry.name, META_FILE))
    if (meta) out.push(meta)
  }
  out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return out
}

/**
 * Restore a snapshot in-place. Wipes current book content (except .snapshots
 * and excluded-from-snapshot files) before copying the snap content back.
 * The .snapshots directory itself is preserved so the user keeps their other
 * checkpoints; only the working copy is rewound.
 */
export function restoreSnapshot(dataDir: string, bookId: string, snapId: string): void {
  const src = snapPath(dataDir, bookId, snapId)
  const root = bookDir(dataDir, bookId)
  if (!fs.existsSync(src)) throw new Error(`Snapshot '${snapId}' not found`)

  // 1. Wipe current book content, preserving snapshots/ and excluded files
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name)
    if (isExcluded(p)) continue
    fs.rmSync(p, { recursive: true, force: true })
  }

  // 2. Copy snap content back, skipping the snap's own _meta.json
  fs.cpSync(src, root, {
    recursive: true,
    filter: (s) => path.basename(s) !== META_FILE,
  })
}

/** Delete a snapshot. */
export function deleteSnapshot(dataDir: string, bookId: string, snapId: string): void {
  const p = snapPath(dataDir, bookId, snapId)
  if (!fs.existsSync(p)) return
  fs.rmSync(p, { recursive: true, force: true })
}

function pruneOldSnapshots(dataDir: string, bookId: string): void {
  const all = listSnapshots(dataDir, bookId)
  if (all.length <= MAX_SNAPSHOTS) return
  // listSnapshots is newest-first; drop the tail
  for (const old of all.slice(MAX_SNAPSHOTS)) {
    deleteSnapshot(dataDir, bookId, old.id)
  }
}
