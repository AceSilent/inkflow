/**
 * Project Memory — per-book, episodic, read+write during session.
 * Stores decided facts, plot progress, character states, world state.
 */
import path from 'path'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'

const PROJECT_MEMORY_FILES = [
  'decided_facts.json',
  'plot_progress.json',
  'world_state.json',
  'character_states.json',
]

function projectMemoryDir(dataDir: string, bookId: string): string {
  return ensureDir(path.join(dataDir, bookId, 'memory'))
}

export function loadProjectMemory(dataDir: string, bookId: string): Record<string, unknown> {
  const memDir = projectMemoryDir(dataDir, bookId)
  const result: Record<string, unknown> = {}
  for (const fname of PROJECT_MEMORY_FILES) {
    const data = safeReadJson(path.join(memDir, fname))
    if (data) result[fname.replace('.json', '')] = data
  }
  return result
}

export function saveProjectMemoryField(
  dataDir: string, bookId: string, field: string, data: unknown
): void {
  writeJson(path.join(projectMemoryDir(dataDir, bookId), `${field}.json`), data)
}

export function updateDecidedFacts(
  dataDir: string, bookId: string, facts: Record<string, string>
): void {
  const fp = path.join(projectMemoryDir(dataDir, bookId), 'decided_facts.json')
  const existing = safeReadJson<Record<string, string>>(fp) ?? {}
  Object.assign(existing, facts)
  writeJson(fp, existing)
}

export interface PlotProgressEntry {
  chapter_id: string
  summary: string
  ts: number
}

/**
 * Insert or replace the plot_progress entry for this chapter. If an entry
 * already exists for chapter_id (chapter resubmitted after revision), it's
 * overwritten in place rather than duplicated — otherwise a chapter that
 * passes editorial 3 times accumulates 3 stale snapshots.
 */
export function updatePlotProgress(
  dataDir: string, bookId: string, chapterId: string, summary: string
): void {
  const fp = path.join(projectMemoryDir(dataDir, bookId), 'plot_progress.json')
  const progress = safeReadJson<PlotProgressEntry[]>(fp) ?? []
  const entry: PlotProgressEntry = { chapter_id: chapterId, summary, ts: Date.now() / 1000 }
  const idx = progress.findIndex(p => p.chapter_id === chapterId)
  if (idx >= 0) progress[idx] = entry
  else progress.push(entry)
  writeJson(fp, progress)
}

/**
 * Merge per-character state lines from a chapter into character_states.json.
 * Each character keeps a short rolling history (last N entries) so the agent
 * can see how a character evolved over recent chapters without re-reading
 * the full drafts. New chapter overwrites the same chapter_id entry.
 */
export const CHARACTER_STATE_HISTORY = 5

export interface CharacterStateEntry {
  chapter_id: string
  state: string
  ts: number
}

export function updateCharacterStates(
  dataDir: string, bookId: string, chapterId: string, states: Record<string, string>
): void {
  if (!states || Object.keys(states).length === 0) return
  const fp = path.join(projectMemoryDir(dataDir, bookId), 'character_states.json')
  const store = safeReadJson<Record<string, CharacterStateEntry[]>>(fp) ?? {}
  const ts = Date.now() / 1000
  for (const [name, state] of Object.entries(states)) {
    if (!state) continue
    const history = store[name] ?? []
    const idx = history.findIndex(e => e.chapter_id === chapterId)
    const entry: CharacterStateEntry = { chapter_id: chapterId, state, ts }
    if (idx >= 0) history[idx] = entry
    else history.push(entry)
    // Cap history per character so a 100-chapter run doesn't bloat the file.
    store[name] = history.slice(-CHARACTER_STATE_HISTORY)
  }
  writeJson(fp, store)
}
