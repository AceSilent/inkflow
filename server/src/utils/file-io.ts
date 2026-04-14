/**
 * File I/O helpers consolidated from ~30 scattered try/catch + JSON.parse +
 * mkdirSync-if-missing copies across routes, tools, memory, snapshots, etc.
 *
 * Keep this module dependency-free (just `fs` + `path`) so anything in the
 * server can import it without circular-dep risk.
 */
import fs from 'fs'
import path from 'path'

/**
 * Read a JSON file. Returns `null` on:
 *   - missing file
 *   - I/O error
 *   - malformed JSON
 *
 * Use this when "file might not be there yet" or "file might be corrupted by
 * an interrupted write" is a normal state, not an exceptional one — which
 * is most read-side persistence in this codebase. Callers that need to
 * distinguish the failure modes should call fs.* directly.
 *
 * The generic lets callers cast at the call site (`safeReadJson<MyShape>(p)`)
 * without an extra `as` after the call.
 */
export function safeReadJson<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

/**
 * Make sure `dir` exists, creating intermediate directories. No-op if it
 * already exists. Returns the same path so callers can chain:
 *
 *   const fp = path.join(ensureDir(memDir), 'file.json')
 */
export function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Write a JSON file with consistent 2-space pretty-printing, ensuring the
 * parent dir exists. Wraps the most common pattern of write-side persistence.
 */
export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
