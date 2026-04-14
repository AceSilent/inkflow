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
    parts.push(`[项目记忆·剧情进展]\n${formatPlotProgressTiered(progress)}`)
  }

  if (project.character_states) {
    parts.push(`[项目记忆·角色状态]\n${formatCharacterStatesTiered(
      project.character_states as Record<string, Array<{ chapter_id: string; state: string }>>,
    )}`)
  }

  return parts.join('\n\n')
}

// ── Tiered formatters ──
// 50+ chapter books: dumping every entry blows the prompt budget. Tier the
// output so recent stuff is full-fidelity and older stuff degrades to one
// line each. Earliest stuff ages out entirely.

const RECENT_FULL_CHAPTERS = 5     // last N: full summary
const OLDER_COMPACT_CHAPTERS = 15  // before that: one-line trail
const RECENT_CHAR_STATES = 3       // per-character: last N state lines in full

export function formatPlotProgressTiered(
  progress: Array<{ chapter_id: string; summary: string }>,
): string {
  if (progress.length === 0) return '(暂无章节摘要)'
  const lines: string[] = []

  // Compute non-overlapping windows. The naive slice(-N) approach overlaps
  // older/recent when total < RECENT_FULL_CHAPTERS, so we clamp explicitly.
  const recentCount = Math.min(progress.length, RECENT_FULL_CHAPTERS)
  const recent = progress.slice(progress.length - recentCount)
  const olderEnd = progress.length - recentCount
  const olderStart = Math.max(0, olderEnd - OLDER_COMPACT_CHAPTERS)
  const older = progress.slice(olderStart, olderEnd)

  if (older.length > 0) {
    lines.push(`(更早 ${older.length} 章简写)`)
    for (const p of older) {
      // Single-line trail: chapter id + first ~40 chars of summary.
      const trail = (p.summary ?? '').replace(/\s+/g, ' ').slice(0, 40)
      lines.push(`  · ${p.chapter_id}: ${trail}${(p.summary ?? '').length > 40 ? '…' : ''}`)
    }
  }

  if (recent.length > 0) {
    lines.push(`(最近 ${recent.length} 章全摘要)`)
    for (const p of recent) {
      lines.push(`- ${p.chapter_id}: ${(p.summary ?? '').slice(0, 200)}`)
    }
  }

  // Earliest chapters past the OLDER_COMPACT_CHAPTERS window are dropped
  // entirely from this tier; they live in the on-disk plot_progress.json
  // for archival but don't reach the prompt.
  const dropped = progress.length - older.length - recent.length
  if (dropped > 0) {
    lines.unshift(`(最早 ${dropped} 章已超出注入窗口，仅保留在 plot_progress.json)`)
  }

  return lines.join('\n')
}

export function formatCharacterStatesTiered(
  states: Record<string, Array<{ chapter_id: string; state: string }>>,
): string {
  const names = Object.keys(states)
  if (names.length === 0) return '(暂无角色状态)'
  const lines: string[] = []
  for (const name of names) {
    const history = states[name] ?? []
    if (history.length === 0) continue
    const recent = history.slice(-RECENT_CHAR_STATES)
    if (recent.length === 1) {
      lines.push(`- ${name} [${recent[0].chapter_id}]: ${recent[0].state}`)
    } else {
      lines.push(`- ${name}:`)
      for (const e of recent) {
        lines.push(`    [${e.chapter_id}] ${e.state}`)
      }
    }
  }
  return lines.join('\n')
}
