/**
 * Memory Context Builder — assembles memory context for injection into system prompt.
 * Combines core memory (cross-book) and project memory (current book).
 */
import { loadCoreMemory, getWritingPrinciples, getUserPreferences } from './core-memory.js'
import { loadProjectMemory } from './project-memory.js'

export function buildMemoryContext(dataDir: string, bookId: string): string {
  const parts: string[] = []

  // ── Core memory (read-only, sorted by confidence) ──
  const principles = getWritingPrinciples(dataDir)
  if (principles.length > 0) {
    const top = principles.slice(0, 10)
    const rules = top.map(p => `- [${(p.confidence ?? 0).toFixed(1)}] ${p.principle}`).join('\n')
    parts.push(`[核心记忆·写作原则]\n${rules}`)
  }

  const prefs = getUserPreferences(dataDir)
  if (Object.keys(prefs).length > 0) {
    const prefLines = Object.entries(prefs).map(([k, v]) => `- ${k}: ${v}`).join('\n')
    parts.push(`[核心记忆·用户偏好]\n${prefLines}`)
  }

  const core = loadCoreMemory(dataDir)
  if (core.craft_skills) {
    const skills = core.craft_skills
    let skillText: string
    if (Array.isArray(skills)) {
      skillText = (skills as string[]).slice(0, 5).map(s => `- ${s}`).join('\n')
    } else if (typeof skills === 'object') {
      skillText = Object.entries(skills as Record<string, unknown>)
        .slice(0, 5)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')
    } else {
      skillText = String(skills).slice(0, 300)
    }
    parts.push(`[核心记忆·技能积累]\n${skillText}`)
  }

  if (core.anti_patterns) {
    const antis = core.anti_patterns
    let antiText: string
    if (Array.isArray(antis)) {
      antiText = (antis as string[]).slice(0, 5).map(a => `- [X] ${a}`).join('\n')
    } else if (typeof antis === 'object') {
      antiText = Object.entries(antis as Record<string, unknown>)
        .slice(0, 5)
        .map(([k, v]) => `- [X] ${k}: ${v}`)
        .join('\n')
    } else {
      antiText = String(antis).slice(0, 300)
    }
    parts.push(`[核心记忆·反模式]\n${antiText}`)
  }

  // ── Project memory (current book only) ──
  const project = loadProjectMemory(dataDir, bookId)

  if (project.decided_facts) {
    const facts = project.decided_facts as Record<string, string>
    const factText = Object.entries(facts).slice(0, 10).map(([k, v]) => `- ${k}: ${v}`).join('\n')
    parts.push(`[项目记忆·已确定设定]\n${factText}`)
  }

  if (project.plot_progress) {
    const progress = project.plot_progress as Array<{ chapter_id: string; summary: string }>
    const recent = progress.slice(-5)
    const progText = recent.map(p => `- ${p.chapter_id}: ${(p.summary ?? '').slice(0, 100)}`).join('\n')
    parts.push(`[项目记忆·剧情进展]\n${progText}`)
  }

  if (project.character_states) {
    const chars = project.character_states
    const charText = JSON.stringify(chars).slice(0, 500)
    parts.push(`[项目记忆·角色状态]\n${charText}`)
  }

  return parts.join('\n\n')
}
