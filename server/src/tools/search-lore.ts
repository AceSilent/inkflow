/**
 * SearchLore tool — searches characters/world_lore JSON files.
 */
import { z } from 'zod'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'
import { safeReadJson } from '../utils/file-io.js'

function searchJsonFile(filePath: string, query: string, label: string): string[] {
  const data = safeReadJson<Record<string, unknown>>(filePath)
  if (!data) return []
  const results: string[] = []
  const q = query.toLowerCase()
  for (const [name, value] of Object.entries(data)) {
    if (name.toLowerCase().includes(q) || JSON.stringify(value).toLowerCase().includes(q)) {
      results.push(`${label}: ${name}\n${JSON.stringify(value, null, 2)}`)
    }
  }
  return results
}

export const searchLoreTool: ToolDefinition = {
  name: 'search_lore',
  description: '在设定数据库中搜索角色、地点、物品等信息。',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ query }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const loreDir = path.join(bookDir, '01_Global_Settings')

    const results = [
      ...searchJsonFile(path.join(loreDir, 'characters.json'), query, 'Character'),
      ...searchJsonFile(path.join(loreDir, 'world_lore.json'), query, 'World Lore'),
    ]

    if (results.length === 0) {
      return `No matching lore entries found for '${query}'.`
    }
    return results.join('\n\n')
  },
}
