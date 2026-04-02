/**
 * Write tools — save_draft, save_outline, save_lore.
 * All write tools include safety: backup + audit log + path traversal check.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'
import { createBackup, appendAuditLog } from './safety.js'

export const saveDraftTool: ToolDefinition = {
  name: 'save_draft',
  description: '将草稿保存到书籍目录中的文件。',
  parameters: z.object({
    file_path: z.string().describe('相对于书籍目录的文件路径'),
    content: z.string().describe('要保存的内容'),
  }),
  permissionLevel: 'write',
  execute: async ({ file_path, content }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const target = path.resolve(bookDir, file_path)

    if (!target.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside book directory.'
    }

    const dir = path.dirname(target)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // Auto-backup before overwriting
    createBackup(target)

    fs.writeFileSync(target, content, 'utf-8')

    // Audit log
    const logFile = path.join(bookDir, 'audit_log.jsonl')
    appendAuditLog(logFile, 'save_draft', { file_path }, `saved ${content.length} chars`, true)

    return `Draft saved to ${file_path} (${content.length} chars)`
  },
}

export const saveOutlineTool: ToolDefinition = {
  name: 'save_outline',
  description: '保存/更新书籍大纲。',
  parameters: z.object({
    outline_json: z.string().describe('大纲的 JSON 字符串'),
  }),
  permissionLevel: 'write',
  execute: async ({ outline_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const outlineDir = path.join(bookDir, '02_Outlines')
    if (!fs.existsSync(outlineDir)) fs.mkdirSync(outlineDir, { recursive: true })
    const outlineFile = path.join(outlineDir, 'outline.json')

    let data: unknown
    try {
      data = JSON.parse(outline_json)
    } catch (e) {
      return `Error: Invalid JSON — ${e}`
    }

    createBackup(outlineFile)
    fs.writeFileSync(outlineFile, JSON.stringify(data, null, 2), 'utf-8')

    const logFile = path.join(bookDir, 'audit_log.jsonl')
    appendAuditLog(logFile, 'save_outline', {}, `saved ${outline_json.length} chars`, true)

    return `Outline saved (${outline_json.length} chars)`
  },
}

export const saveLoreTool: ToolDefinition = {
  name: 'save_lore',
  description: '保存/更新设定数据。支持 characters 和 world_setting 两个分类。',
  parameters: z.object({
    category: z.string().describe("分类: 'characters' 或 'world_setting'"),
    content_json: z.string().describe('设定数据的 JSON 字符串'),
  }),
  permissionLevel: 'write',
  execute: async ({ category, content_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const loreDir = path.join(bookDir, 'lore')
    const legacyDir = path.join(bookDir, '01_Global_Settings')
    if (!fs.existsSync(loreDir)) fs.mkdirSync(loreDir, { recursive: true })
    if (!fs.existsSync(legacyDir)) fs.mkdirSync(legacyDir, { recursive: true })

    const fileMap: Record<string, [string, string]> = {
      characters: ['characters.json', 'characters.json'],
      world_setting: ['world_setting.json', 'world_lore.json'],
    }

    if (!(category in fileMap)) {
      return `Error: Unknown category '${category}'. Use 'characters' or 'world_setting'.`
    }

    let data: unknown
    try {
      data = JSON.parse(content_json)
    } catch (e) {
      return `Error: Invalid JSON — ${e}`
    }

    const [loreName, legacyName] = fileMap[category]
    const jsonStr = JSON.stringify(data, null, 2)

    createBackup(path.join(loreDir, loreName))
    createBackup(path.join(legacyDir, legacyName))

    fs.writeFileSync(path.join(loreDir, loreName), jsonStr, 'utf-8')
    fs.writeFileSync(path.join(legacyDir, legacyName), jsonStr, 'utf-8')

    const logFile = path.join(bookDir, 'audit_log.jsonl')
    appendAuditLog(logFile, 'save_lore', { category }, 'saved', true)

    return `Lore '${category}' saved successfully.`
  },
}

export const readOutlineTool: ToolDefinition = {
  name: 'read_outline',
  description: '读取书籍大纲，可选筛选卷号。',
  parameters: z.object({
    volume: z.number().optional().describe('卷号（可选）'),
  }),
  permissionLevel: 'read',
  execute: async ({ volume }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const outlineFile = path.join(bookDir, '02_Outlines', 'outline.json')

    if (!fs.existsSync(outlineFile)) {
      return 'Error: Outline file not found.'
    }

    try {
      const data = JSON.parse(fs.readFileSync(outlineFile, 'utf-8'))
      if (volume !== undefined) {
        const volumes = data.volumes ?? []
        const found = volumes.find((v: { title?: string }) =>
          String(volume) === String(v.title ?? '')
        )
        if (found) return JSON.stringify(found, null, 2)
        return `Error: Volume ${volume} not found in outline.`
      }
      return JSON.stringify(data, null, 2)
    } catch (e) {
      return `Error reading outline: ${e}`
    }
  },
}
