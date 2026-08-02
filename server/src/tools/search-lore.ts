/**
 * Lore read tools — compact search plus explicit full-entry/section reads.
 */
import { z } from 'zod'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'
import { readLoreDocument, type LoreCategory, type LoreEntry } from '../lore/lore-document.js'

function matches(entry: LoreEntry, query: string): boolean {
  const haystack = [
    entry.id,
    entry.title,
    entry.entry_type,
    entry.status,
    ...entry.tags,
    ...entry.aliases,
    entry.content,
  ].join('\n').toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function categoryLabel(category: LoreCategory): string {
  if (category === 'characters') return 'Character'
  if (category === 'story_bible') return 'Story Bible'
  return 'World Lore'
}

function compactExcerpt(content: string, query: string, maxChars = 2400): string {
  if (content.length <= maxChars) return content
  const index = content.toLowerCase().indexOf(query.toLowerCase())
  const start = Math.max(0, index >= 0 ? index - Math.floor(maxChars * 0.28) : 0)
  const end = Math.min(content.length, start + maxChars)
  return `${start > 0 ? '…\n' : ''}${content.slice(start, end)}${end < content.length ? '\n…' : ''}`
}

function formatMatch(category: LoreCategory, entry: LoreEntry, query: string): string {
  const label = categoryLabel(category)
  const metadata = [
    entry.entry_type,
    entry.status,
    entry.aliases.length ? `aliases=${entry.aliases.join('、')}` : '',
    entry.tags.length ? `tags=${entry.tags.join('、')}` : '',
  ].filter(Boolean).join(' · ')
  const source = entry.source_refs?.length
    ? `sources=${entry.source_refs.map(ref =>
        `${ref.source_name}${ref.source_section ? `#${ref.source_section}` : ''}`
      ).join('；')}`
    : ''
  const excerpt = compactExcerpt(entry.content, query)
  const more = entry.content.length > excerpt.replace(/^…\n|\n…$/g, '').length
    ? `\n[Use read_lore_entry with category=${category}, entry_id=${entry.id} for the complete entry.]`
    : ''
  return `${label}: ${entry.title} [id=${entry.id}]\n${metadata}\n${source}\n${excerpt}${more}`.trim()
}

function extractMarkdownSection(content: string, heading: string): string | null {
  const lines = content.split(/\r?\n/)
  const target = heading.trim().toLowerCase()
  let start = -1
  let level = 0

  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match || match[2].trim().toLowerCase() !== target) continue
    start = index
    level = match[1].length
    break
  }
  if (start < 0) return null

  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    const match = lines[index].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= level) {
      end = index
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

export const searchLoreTool: ToolDefinition = {
  name: 'search_lore',
  description: '在设定数据库中搜索角色、地点、物品等信息。',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    category: z.enum(['story_bible', 'world_setting', 'characters']).optional()
      .describe('可选：只搜索总纲、世界观或角色库'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ query, category }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const categories = category
      ? [category as LoreCategory]
      : (['story_bible', 'world_setting', 'characters'] as LoreCategory[])
    const results = categories
      .flatMap(category =>
        readLoreDocument(bookDir, category).entries
          .filter(entry => matches(entry, query))
          .map(entry => formatMatch(category, entry, query))
      )

    if (results.length === 0) {
      return `No matching lore entries found for '${query}'.`
    }
    return results.join('\n\n')
  },
}

export const readLoreEntryTool: ToolDefinition = {
  name: 'read_lore_entry',
  description: '按稳定 id 读取一条完整设定；长条目可指定 Markdown 小节标题，只读该节。先用 search_lore 找到 category 和 id。',
  parameters: z.object({
    category: z.enum(['story_bible', 'world_setting', 'characters']),
    entry_id: z.string().min(1).max(128),
    section: z.string().min(1).max(300).optional()
      .describe('可选：Markdown 小节标题，需与标题文字一致'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ category, entry_id, section }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const entry = readLoreDocument(bookDir, category as LoreCategory).entries
      .find(candidate => candidate.id === entry_id)
    if (!entry) return `Error: Lore entry '${entry_id}' not found in '${category}'.`

    let content = entry.content
    if (section) {
      const extracted = extractMarkdownSection(content, section)
      if (!extracted) return `Error: Section '${section}' not found in lore entry '${entry_id}'.`
      content = extracted
    }
    const sources = entry.source_refs?.length
      ? `\nSources: ${entry.source_refs.map(ref =>
          `${ref.source_name}${ref.source_section ? `#${ref.source_section}` : ''}`
        ).join('；')}`
      : ''
    return `${categoryLabel(category as LoreCategory)}: ${entry.title} [id=${entry.id}]\n${entry.entry_type} · ${entry.status}${sources}\n\n${content}`.trim()
  },
}
