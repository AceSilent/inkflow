/**
 * Project Memory — per-book, episodic, read+write during session.
 * Stores decided facts, plot progress, character states, world state.
 */
import fs from 'fs'
import path from 'path'

const PROJECT_MEMORY_FILES = [
  'decided_facts.json',
  'plot_progress.json',
  'world_state.json',
  'character_states.json',
]

function projectMemoryDir(dataDir: string, bookId: string): string {
  const dir = path.join(dataDir, bookId, 'memory')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function loadProjectMemory(dataDir: string, bookId: string): Record<string, unknown> {
  const memDir = projectMemoryDir(dataDir, bookId)
  const result: Record<string, unknown> = {}
  for (const fname of PROJECT_MEMORY_FILES) {
    const fp = path.join(memDir, fname)
    if (fs.existsSync(fp)) {
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8'))
        if (data) result[fname.replace('.json', '')] = data
      } catch { /* skip corrupt */ }
    }
  }
  return result
}

export function saveProjectMemoryField(
  dataDir: string, bookId: string, field: string, data: unknown
): void {
  const memDir = projectMemoryDir(dataDir, bookId)
  const fp = path.join(memDir, `${field}.json`)
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8')
}

export function updateDecidedFacts(
  dataDir: string, bookId: string, facts: Record<string, string>
): void {
  const memDir = projectMemoryDir(dataDir, bookId)
  const fp = path.join(memDir, 'decided_facts.json')
  let existing: Record<string, string> = {}
  if (fs.existsSync(fp)) {
    try { existing = JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { /* fresh */ }
  }
  Object.assign(existing, facts)
  fs.writeFileSync(fp, JSON.stringify(existing, null, 2), 'utf-8')
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
  const memDir = projectMemoryDir(dataDir, bookId)
  const fp = path.join(memDir, 'plot_progress.json')
  let progress: PlotProgressEntry[] = []
  if (fs.existsSync(fp)) {
    try { progress = JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { /* fresh */ }
  }
  const existingIdx = progress.findIndex(p => p.chapter_id === chapterId)
  const entry: PlotProgressEntry = { chapter_id: chapterId, summary, ts: Date.now() / 1000 }
  if (existingIdx >= 0) {
    progress[existingIdx] = entry
  } else {
    progress.push(entry)
  }
  fs.writeFileSync(fp, JSON.stringify(progress, null, 2), 'utf-8')
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
  const memDir = projectMemoryDir(dataDir, bookId)
  const fp = path.join(memDir, 'character_states.json')
  let store: Record<string, CharacterStateEntry[]> = {}
  if (fs.existsSync(fp)) {
    try { store = JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { /* fresh */ }
  }
  const ts = Date.now() / 1000
  for (const [name, state] of Object.entries(states)) {
    if (!state) continue
    const history = store[name] ?? []
    const existingIdx = history.findIndex(e => e.chapter_id === chapterId)
    const entry: CharacterStateEntry = { chapter_id: chapterId, state, ts }
    if (existingIdx >= 0) {
      history[existingIdx] = entry
    } else {
      history.push(entry)
    }
    // Cap history per character so a 100-chapter run doesn't bloat the file.
    store[name] = history.slice(-CHARACTER_STATE_HISTORY)
  }
  fs.writeFileSync(fp, JSON.stringify(store, null, 2), 'utf-8')
}
