/**
 * Write tools — save_script, save_outline, save_lore.
 * All write tools include safety: backup + audit log + path traversal check.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { stringify as yamlStringify } from 'yaml'
import { type ToolDefinition } from './base-tool.js'
import { createBackup, appendAuditLog, withFileLock } from './safety.js'
import { ensureDir, safeReadJson } from '../utils/file-io.js'
import { generateLineIds } from '../services/line-id.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { runScriptSelfCheck } from './script-self-check.js'

/**
 * Minimum character count for a draft to qualify for editorial review.
 * Kept here so editorial.ts and workbench.ts can import it without a new module.
 */
export const MIN_REVIEW_DRAFT_CHARS = 2500

function formatScriptSelfCheck(issues: { type: string; severity: number; message: string; stageId?: string }[]): string {
  return issues.map(i => `[sev${i.severity}] ${i.type}: ${i.message}`).join('\n')
}

export const saveScriptTool: ToolDefinition = {
  name: 'save_script',
  description: '保存故事剧本为 YAML 文件到 03_Scripts/{package_id}.yaml。自动为每个 stage 的 lines 生成行 ID，校验 StoryPackage schema，并运行自检规则报告潜在问题。',
  parameters: z.object({
    package_id: z.string().describe('故事包 ID，用作文件名（不含扩展名）'),
    script_json: z.string().describe('StoryPackage JSON 字符串'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ package_id, script_json }, ctx) => {
    let rawScript: unknown
    try {
      rawScript = JSON.parse(script_json)
    } catch (e) {
      return `Error: Invalid JSON — ${e}`
    }

    // Assign line IDs before schema validation so the schema sees complete data.
    const scriptWithIds = assignLineIds(package_id, rawScript)

    const parseResult = StoryPackageSchema.safeParse(scriptWithIds)
    if (!parseResult.success) {
      const errorLines = parseResult.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`)
      return `Error: Schema validation failed:\n${errorLines.join('\n')}`
    }

    const pkg = parseResult.data
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const scriptsDir = ensureDir(path.join(bookDir, '03_Scripts'))
    const target = path.resolve(scriptsDir, `${package_id}.yaml`)

    if (!target.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside book directory.'
    }

    const selfCheck = runScriptSelfCheck(pkg)
    const selfCheckSection = selfCheck.issues.length > 0
      ? `\n\n${selfCheck.blockReview ? 'BLOCKED' : 'WARNINGS'}:\n${formatScriptSelfCheck(selfCheck.issues)}`
      : ''

    return withFileLock(target, async () => {
      createBackup(target)
      fs.writeFileSync(target, yamlStringify(pkg), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      appendAuditLog(logFile, 'save_script', { package_id }, `saved ${package_id}.yaml`, true)

      return `Script saved to 03_Scripts/${package_id}.yaml${selfCheckSection}`
    })
  },
}

function assignLineIds(packageId: string, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as any).stages)) {
    return raw
  }
  const pkg = raw as { stages: unknown[] }
  return {
    ...pkg,
    stages: pkg.stages.map((stage: unknown) => {
      if (typeof stage !== 'object' || stage === null) return stage
      const s = stage as { id?: string; lines?: unknown[] }
      if (!s.id || !Array.isArray(s.lines)) return stage
      return { ...s, lines: generateLineIds(packageId, s.id, s.lines as any) }
    }),
  }
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
    '可选字段：book 节点 epigraph（题词）与 synopsis（全书梗概）；volume 节点 synopsis（卷梗概）；chapter 节点 summary（章摘要）。',
  ].join('\n'),
  parameters: z.object({
    outline_json: z.string().describe('大纲 JSON 字符串，必须是规范章节树（见 description）'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ outline_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const outlineFile = path.join(ensureDir(path.join(bookDir, '02_Outlines')), 'outline.json')

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

    // Serialize concurrent writes to outline.json (unlikely but possible if
    // the Author emits two save_outline tool calls in one turn).
    return withFileLock(outlineFile, () => {
      createBackup(outlineFile)
      fs.writeFileSync(outlineFile, JSON.stringify(data, null, 2), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      appendAuditLog(logFile, 'save_outline', {}, `saved ${outline_json.length} chars`, true)

      return `Outline saved (${outline_json.length} chars)`
    })
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
  // Optional narrative fields — scoped by node type.
  if (node.epigraph !== undefined) {
    if (node.type !== 'book') {
      return `${where}: 'epigraph' only allowed on book type, got ${node.type}`
    }
    if (typeof node.epigraph !== 'string') {
      return `${where}: 'epigraph' must be a string`
    }
  }
  if (node.synopsis !== undefined) {
    if (node.type !== 'book' && node.type !== 'volume') {
      return `${where}: 'synopsis' only allowed on book or volume, got ${node.type}`
    }
    if (typeof node.synopsis !== 'string') {
      return `${where}: 'synopsis' must be a string`
    }
  }
  if (node.summary !== undefined && typeof node.summary !== 'string') {
    return `${where}: 'summary' must be a string`
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
    category: z.enum(['characters', 'world_setting'])
      .describe("分类：'characters'（角色库）或 'world_setting'（世界观/设定）"),
    content_json: z.string().describe('设定数据的 JSON 字符串'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ category, content_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const loreDir = ensureDir(path.join(bookDir, '01_Global_Settings'))

    // File names match what readers (routes/data.ts, tools/search-lore.ts,
    // feishu/commands.ts, editorial) already look for in 01_Global_Settings/.
    const fileMap: Record<string, string> = {
      characters: 'characters.json',
      world_setting: 'world_lore.json',
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

    const target = path.join(loreDir, fileMap[category])
    // Serialize same-category concurrent writes. Different categories
    // (characters vs world_setting) still run fully in parallel.
    return withFileLock(target, () => {
      createBackup(target)
      fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      appendAuditLog(logFile, 'save_lore', { category }, 'saved', true)

      return `Lore '${category}' saved successfully.`
    })
  },
}

export const readOutlineTool: ToolDefinition = {
  name: 'read_outline',
  description: "读取书籍大纲，可选筛选卷号。大纲是当前标准 children 树：book.children[] 为 volume，volume.children[] 为 chapter。",
  parameters: z.object({
    volume: z.number().optional().describe('卷号（可选）'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ volume }, ctx) => {
    const data = safeReadJson<any>(path.join(ctx.dataDir, ctx.bookId, '02_Outlines', 'outline.json'))
    if (!data) return 'Error: Outline file not found or unreadable.'

    if (volume !== undefined) {
      const volumes = Array.isArray(data.children)
        ? data.children.filter((v: any) => v?.type === 'volume')
        : []
      const volIndex = Number(volume) - 1
      const found = volumes.find((v: any, index: number) =>
        index === volIndex
        || String(volume) === String(v.id ?? '').replace(/^vol/i, '')
        || String(volume) === String(v.label ?? '').replace(/[^\d]/g, '')
      )
      return found ? JSON.stringify(found, null, 2) : `Error: Volume ${volume} not found in outline.`
    }
    return JSON.stringify(data, null, 2)
  },
}
