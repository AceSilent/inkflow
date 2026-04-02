/**
 * Core Memory — cross-book, persistent, read-only in session.
 * Stores writing principles, user preferences, craft skills, anti-patterns.
 * Updated ONLY via Memory Reflection at volume completion.
 */
import fs from 'fs'
import path from 'path'

export interface WritingPrinciple {
  principle: string
  confidence: number
  source?: string
  created_at?: number
}

const CORE_MEMORY_FILES = [
  'writing_principles.json',
  'user_preferences.json',
  'craft_skills.json',
  'anti_patterns.json',
]

function globalDir(dataDir: string): string {
  const dir = path.resolve(dataDir, '..', 'global', 'core_memory')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function loadCoreMemory(dataDir: string): Record<string, unknown> {
  const gdir = globalDir(dataDir)
  const result: Record<string, unknown> = {}
  for (const fname of CORE_MEMORY_FILES) {
    const fp = path.join(gdir, fname)
    if (fs.existsSync(fp)) {
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf-8'))
        if (data) result[fname.replace('.json', '')] = data
      } catch { /* skip corrupt files */ }
    }
  }
  return result
}

export function getWritingPrinciples(dataDir: string): WritingPrinciple[] {
  const fp = path.join(globalDir(dataDir), 'writing_principles.json')
  if (!fs.existsSync(fp)) return []
  try {
    const principles: WritingPrinciple[] = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return principles.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  } catch {
    return []
  }
}

export function getUserPreferences(dataDir: string): Record<string, unknown> {
  const fp = path.join(globalDir(dataDir), 'user_preferences.json')
  if (!fs.existsSync(fp)) return {}
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'))
  } catch {
    return {}
  }
}

export function saveCoreMemoryFile(dataDir: string, fname: string, data: unknown): void {
  const fp = path.join(globalDir(dataDir), fname)
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8')
}
