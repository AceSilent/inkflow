/**
 * Core Memory — cross-book, persistent, read-only in session.
 * Stores writing principles, user preferences, craft skills, anti-patterns.
 * Updated ONLY via Memory Reflection at volume completion.
 */
import path from 'path'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'

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
  return ensureDir(path.resolve(dataDir, '..', 'global', 'core_memory'))
}

export function loadCoreMemory(dataDir: string): Record<string, unknown> {
  const gdir = globalDir(dataDir)
  const result: Record<string, unknown> = {}
  for (const fname of CORE_MEMORY_FILES) {
    const data = safeReadJson(path.join(gdir, fname))
    if (data) result[fname.replace('.json', '')] = data
  }
  return result
}

export function getWritingPrinciples(dataDir: string): WritingPrinciple[] {
  const principles = safeReadJson<WritingPrinciple[]>(
    path.join(globalDir(dataDir), 'writing_principles.json'),
  ) ?? []
  return principles.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
}

export function getUserPreferences(dataDir: string): Record<string, unknown> {
  return safeReadJson<Record<string, unknown>>(
    path.join(globalDir(dataDir), 'user_preferences.json'),
  ) ?? {}
}

export function saveCoreMemoryFile(dataDir: string, fname: string, data: unknown): void {
  writeJson(path.join(globalDir(dataDir), fname), data)
}
