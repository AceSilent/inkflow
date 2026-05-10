import path from 'path'
import { safeReadJson } from '../utils/file-io.js'
import { collectChapters } from '../utils/outline.js'
import type { EditorialContext } from './pipeline.js'

function formatCharacters(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return ''
  const lines: string[] = []
  for (const [name, val] of entries) {
    if (val && typeof val === 'object') {
      const summary = JSON.stringify(val)
      lines.push(`- ${name}: ${summary.length > 400 ? summary.slice(0, 400) + '…' : summary}`)
    } else {
      lines.push(`- ${name}: ${String(val)}`)
    }
  }
  return lines.join('\n')
}

function formatWorldLore(data: unknown): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (typeof data !== 'object') return String(data)
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      const body = typeof v === 'string' ? v : JSON.stringify(v)
      return `- **${k}**: ${body.length > 500 ? body.slice(0, 500) + '…' : body}`
    })
    .join('\n')
}

function formatOutlineContext(outline: unknown, chapterId: string): string {
  const chapters = collectChapters(outline)
  const idx = chapters.findIndex(c => c.id === chapterId)
  if (idx < 0) return ''

  const parts: string[] = []
  if (idx > 0) {
    const prev = chapters[idx - 1]
    parts.push(`【前一章 ${prev.id}${prev.label ? ' · ' + prev.label : ''}】\n${prev.summary ?? '(无摘要)'}`)
  }
  const cur = chapters[idx]
  parts.push(`【本章 ${cur.id}${cur.label ? ' · ' + cur.label : ''}】\n${cur.summary ?? '(无摘要)'}`)
  return parts.join('\n\n')
}

function formatStyleProfile(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const profile = data as Record<string, any>
  const metrics = profile.metrics ?? {}
  const rules = Array.isArray(profile.style_rules) ? profile.style_rules.slice(0, 5) : []
  const anti = Array.isArray(profile.anti_patterns) ? profile.anti_patterns.slice(0, 6) : []
  return [
    `平均句长 ${metrics.avg_sentence_chars ?? '?'} 字；平均段落 ${metrics.avg_paragraph_chars ?? '?'} 字；比喻密度 ${metrics.metaphor_density_per_1000_chars ?? '?'} /千字；破折号 ${metrics.dash_count ?? 0} 个。`,
    '规则：',
    ...rules.map((r: string) => `- ${r}`),
    '禁区：',
    ...anti.map((r: string) => `- ${r}`),
  ].join('\n')
}

export function loadEditorialContextByDir(bookDir: string, chapterId: string): Pick<EditorialContext, 'charactersInfo' | 'worldLore' | 'outlineContext' | 'styleProfile'> {
  const characters = safeReadJson(path.join(bookDir, '01_Global_Settings', 'characters.json'))
  const worldLore = safeReadJson(path.join(bookDir, '01_Global_Settings', 'world_lore.json'))
  const outline = safeReadJson(path.join(bookDir, '02_Outlines', 'outline.json'))
  const styleProfile = safeReadJson(path.join(bookDir, '01_Global_Settings', 'style_profile.json'))

  return {
    charactersInfo: formatCharacters(characters),
    worldLore: formatWorldLore(worldLore),
    outlineContext: formatOutlineContext(outline, chapterId),
    styleProfile: formatStyleProfile(styleProfile),
  }
}
