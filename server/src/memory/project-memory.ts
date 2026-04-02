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

export function updatePlotProgress(
  dataDir: string, bookId: string, chapterId: string, summary: string
): void {
  const memDir = projectMemoryDir(dataDir, bookId)
  const fp = path.join(memDir, 'plot_progress.json')
  let progress: Array<{ chapter_id: string; summary: string; ts: number }> = []
  if (fs.existsSync(fp)) {
    try { progress = JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { /* fresh */ }
  }
  progress.push({ chapter_id: chapterId, summary, ts: Date.now() / 1000 })
  fs.writeFileSync(fp, JSON.stringify(progress, null, 2), 'utf-8')
}
