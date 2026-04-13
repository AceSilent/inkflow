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
  description: '保存章节草稿到 04_Drafts/{ch{N}.md}。文件名必须是 ch{N}.md 形式（如 ch01.md），UI 才能把草稿对应到 outline 中相同 id 的 chapter 节点。',
  parameters: z.object({
    file_path: z.string()
      .regex(/^ch\d{1,4}\.md$/, "file_path 必须是 'ch{N}.md' 形式（如 ch01.md, ch02.md, ch137.md）。N 是阿拉伯数字章节序号，1-4 位，建议 2-3 位零填充以方便排序。")
      .describe("章节文件名，必须是 'ch{N}.md' 形式（如 ch01.md, ch02.md）。N 用零填充到 2-3 位。会自动放进 04_Drafts/。"),
    content: z.string().describe('要保存的章节正文'),
  }),
  permissionLevel: 'write',
  execute: async ({ file_path, content }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    // Always relocate into 04_Drafts/ — strip any path prefix the agent put in,
    // keep just the leaf filename. This is the difference between drafts the
    // sidebar can find and orphan files at the book root nobody sees.
    const baseName = path.basename(file_path)
    const target = path.resolve(bookDir, '04_Drafts', baseName)

    if (!target.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside book directory.'
    }

    const dir = path.dirname(target)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    createBackup(target)
    fs.writeFileSync(target, content, 'utf-8')

    const logFile = path.join(bookDir, 'audit_log.jsonl')
    const relPath = path.posix.join('04_Drafts', baseName)
    appendAuditLog(logFile, 'save_draft', { file_path: relPath }, `saved ${content.length} chars`, true)

    return `Draft saved to ${relPath} (${content.length} chars)`
  },
}

export const saveOutlineTool: ToolDefinition = {
  name: 'save_outline',
  description: [
    '保存/更新书籍大纲。outline_json 必须是规范章节树结构：',
    "{ id: <bookId>, label: '...', type: 'book', children: [",
    "  { id: 'vol1', type: 'volume', label: '...', children: [",
    "    { id: 'ch01', type: 'chapter', label: '...', summary: '...' }, ...",
    '  ]}, ...',
    ']}',
    "type 必须是 'book'/'volume'/'chapter'/'scene' 之一。chapter 的 id 必须是 'ch{N}' 形式（与 save_draft 的 ch{N}.md 对齐，UI 才能配对）。",
    '不要塞 free-form JSON（title/intro/characters/worldview 这些是设定，应走 save_lore）。',
  ].join('\n'),
  parameters: z.object({
    outline_json: z.string().describe('大纲 JSON 字符串，必须是规范章节树（见 description）'),
  }),
  permissionLevel: 'write',
  execute: async ({ outline_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const outlineDir = path.join(bookDir, '02_Outlines')
    if (!fs.existsSync(outlineDir)) fs.mkdirSync(outlineDir, { recursive: true })
    const outlineFile = path.join(outlineDir, 'outline.json')

    let data: any
    try {
      data = JSON.parse(outline_json)
    } catch (e) {
      return `Error: Invalid JSON — ${e}`
    }

    // Schema validation — reject free-form JSON so the UI tree editor can render.
    const validation = validateOutlineNode(data, 'root')
    if (validation) {
      return [
        'Error: outline_json schema invalid.',
        validation,
        "Required shape: { id, label, type:'book', children:[{ id, type:'volume', children:[{ id:'chXX', type:'chapter', label, summary }] }] }.",
        '世界观/角色/题材这类设定信息请用 save_lore 保存，不要塞进 outline。',
      ].join('\n')
    }

    createBackup(outlineFile)
    fs.writeFileSync(outlineFile, JSON.stringify(data, null, 2), 'utf-8')

    const logFile = path.join(bookDir, 'audit_log.jsonl')
    appendAuditLog(logFile, 'save_outline', {}, `saved ${outline_json.length} chars`, true)

    return `Outline saved (${outline_json.length} chars)`
  },
}

const VALID_OUTLINE_TYPES = new Set(['book', 'volume', 'chapter', 'scene'])

/** Returns null if `node` is a valid outline subtree, else an error string. */
function validateOutlineNode(node: any, where: string): string | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return `${where}: must be an object, got ${Array.isArray(node) ? 'array' : typeof node}`
  }
  if (typeof node.type !== 'string' || !VALID_OUTLINE_TYPES.has(node.type)) {
    return `${where}: missing or invalid 'type' (got ${JSON.stringify(node.type)}); must be one of book/volume/chapter/scene`
  }
  if (where === 'root' && node.type !== 'book') {
    return `root: type must be 'book', got '${node.type}'`
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    return `${where}: missing 'id' string`
  }
  if (node.type === 'chapter' && !/^ch\d{1,4}$/i.test(node.id)) {
    return `${where} (chapter): id must be 'ch{N}' (e.g. 'ch01'), got '${node.id}' — must align with save_draft's ch{N}.md`
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      return `${where}: 'children' must be an array if present`
    }
    for (let i = 0; i < node.children.length; i++) {
      const childErr = validateOutlineNode(node.children[i], `${where}.children[${i}]`)
      if (childErr) return childErr
    }
  }
  return null
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
