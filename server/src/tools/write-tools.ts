/**
 * Write tools — save_draft, save_outline, save_lore.
 * All write tools include safety: backup + audit log + path traversal check.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolDefinition } from './base-tool.js'
import { createBackup, appendAuditLog, withFileLock } from './safety.js'
import { archivePriorDraft } from './draft-history.js'
import { ensureDir, safeReadJson } from '../utils/file-io.js'
import { formatDraftSelfCheck, runDraftSelfCheck } from './draft-self-check.js'
import { generateLineIds } from '../services/line-id.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { StageSchema } from '../schemas/stage.js'
import { runScriptSelfCheck } from './script-self-check.js'
import { defaultGameOutline, validateGameOutlineRoot } from '../game-outline.js'

/**
 * Target lower bound for a reviewable novel chapter. We allow saving shorter
 * drafts as work-in-progress, but editorial submission must clear this floor.
 */
export const MIN_REVIEW_DRAFT_CHARS = 2500

function formatScriptSelfCheck(issues: { type: string; severity: number; message: string; stageId?: string }[]): string {
  return issues.map(issue => `[sev${issue.severity}] ${issue.type}: ${issue.message}`).join('\n')
}

export const saveGameOutlineTool: ToolDefinition = {
  name: 'save_game_outline',
  description: [
    '保存/更新游戏文案结构到 02_Outlines/game_outline.json，仅供 game_script 模式使用。',
    'outline_json 必须是规范游戏结构树：game_project -> arc -> story_package -> stage。',
    "节点 type 必须是 'game_project'/'arc'/'story_package'/'stage'；story_package 可带 package_id，stage 可带 stage_id。",
  ].join('\n'),
  parameters: z.object({
    outline_json: z.string().describe('游戏文案结构 JSON 字符串'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ outline_json }, ctx) => {
    if (ctx.mode !== 'game_script') {
      return 'Error: save_game_outline is only available in game_script mode. Use save_outline for novel chapters.'
    }

    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const outlineFile = path.join(ensureDir(path.join(bookDir, '02_Outlines')), 'game_outline.json')

    let data: unknown
    try {
      data = JSON.parse(outline_json)
    } catch (e) {
      return `Error: Invalid JSON — ${e}`
    }

    const validation = validateGameOutlineRoot(data)
    if (validation) {
      return [
        'Error: game outline schema invalid.',
        validation,
        "Required shape: { id, label, type:'game_project', children:[{ id, type:'arc', children:[{ id, type:'story_package', package_id, children:[{ id, type:'stage', stage_id }] }] }] }.",
      ].join('\n')
    }

    return withFileLock(outlineFile, () => {
      createBackup(outlineFile)
      fs.writeFileSync(outlineFile, JSON.stringify(data, null, 2), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      appendAuditLog(logFile, 'save_game_outline', {}, `saved ${outline_json.length} chars`, true)

      return `Game outline saved (${outline_json.length} chars)`
    })
  },
}

export const readGameOutlineTool: ToolDefinition = {
  name: 'read_game_outline',
  description: '读取游戏文案结构树，文件为 02_Outlines/game_outline.json；不存在时返回空 game_project。',
  parameters: z.object({}),
  permissionLevel: 'read',
  category: '读取',
  execute: async (_args, ctx) => {
    const data = safeReadJson<any>(path.join(ctx.dataDir, ctx.bookId, '02_Outlines', 'game_outline.json'))
      ?? defaultGameOutline(ctx.bookId)
    return JSON.stringify(data, null, 2)
  },
}

export const saveScriptTool: ToolDefinition = {
  name: 'save_script',
  description: [
    '保存游戏文案脚本到 03_Scripts/{package_id}.json，仅供 game_script 模式使用。',
    '首次创建传 script_json；已有文件后必须传 stage_id + stage_json 逐 stage 合并，避免整包覆盖。',
    '自动补 line.id，校验 story package / stage schema，并运行 validate_script 同源的自检规则。',
  ].join('\n'),
  parameters: z.object({
    package_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).describe('故事包 ID，用作文件名（不含扩展名）'),
    script_json: z.string().optional().describe('完整 StoryPackage JSON 字符串，仅用于首次创建'),
    stage_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional().describe('要合并的 stage ID'),
    stage_json: z.string().optional().describe('单个 Stage JSON 字符串，与 stage_id 配合'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ package_id, script_json, stage_id, stage_json }, ctx) => {
    if (ctx.mode !== 'game_script') {
      return 'Error: save_script is only available in game_script mode. Use save_draft for novel chapters.'
    }

    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const scriptsDir = ensureDir(path.join(bookDir, '03_Scripts'))
    const scriptsRoot = path.resolve(scriptsDir)
    const target = path.resolve(scriptsRoot, `${package_id}.json`)

    if (!target.startsWith(scriptsRoot + path.sep)) {
      return 'Error: Access denied — path outside book directory.'
    }

    let pkg: any

    if (stage_id && stage_json) {
      if (!fs.existsSync(target)) {
        return `Error: 03_Scripts/${package_id}.json not found. First use script_json to create the package, then use stage_id + stage_json to update individual stages.`
      }

      let rawStage: unknown
      try {
        rawStage = JSON.parse(stage_json)
      } catch (e) {
        return `Error: Invalid stage_json — ${e}`
      }

      let existing: any
      try {
        existing = JSON.parse(fs.readFileSync(target, 'utf-8'))
      } catch (e) {
        return `Error: Existing script JSON cannot be parsed — ${e}`
      }
      if (!Array.isArray(existing?.stages)) return 'Error: Existing script has no stages array.'

      const stageWithIds = assignSingleStageLineIds(package_id, stage_id, rawStage)
      const stageResult = StageSchema.safeParse(stageWithIds)
      if (!stageResult.success) {
        const errorLines = stageResult.error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
        return `Error: Stage schema validation failed:\n${errorLines.join('\n')}`
      }

      const idx = existing.stages.findIndex((stage: any) => stage.id === stage_id)
      if (idx >= 0) existing.stages[idx] = stageResult.data
      else existing.stages.push(stageResult.data)

      const fullResult = StoryPackageSchema.safeParse(existing)
      if (!fullResult.success) {
        const errorLines = fullResult.error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
        return `Error: Merged package schema validation failed:\n${errorLines.join('\n')}`
      }
      pkg = fullResult.data
    } else if (script_json) {
      if (fs.existsSync(target)) {
        return `Error: 03_Scripts/${package_id}.json already exists. Use stage_id + stage_json to update individual stages. Full-package overwrite is blocked.`
      }

      let rawScript: unknown
      try {
        rawScript = JSON.parse(script_json)
      } catch (e) {
        return `Error: Invalid JSON — ${e}`
      }

      const scriptWithIds = assignLineIds(package_id, rawScript)
      const parseResult = StoryPackageSchema.safeParse(scriptWithIds)
      if (!parseResult.success) {
        const errorLines = parseResult.error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
        return `Error: Schema validation failed:\n${errorLines.join('\n')}`
      }
      pkg = parseResult.data
    } else {
      return 'Error: Must provide stage_id + stage_json. Full-package script_json is only allowed for initial creation.'
    }

    const selfCheck = runScriptSelfCheck(pkg)
    const selfCheckSection = selfCheck.issues.length > 0
      ? `\n\n${selfCheck.blockReview ? 'BLOCKED' : 'WARNINGS'}:\n${formatScriptSelfCheck(selfCheck.issues)}`
      : ''

    return withFileLock(target, () => {
      createBackup(target)
      fs.writeFileSync(target, JSON.stringify(pkg, null, 2), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      const detail = stage_id ? `merged stage ${stage_id} into ${package_id}.json` : `saved ${package_id}.json`
      appendAuditLog(logFile, 'save_script', { package_id, stage_id }, detail, true)

      const prefix = stage_id ? `Stage '${stage_id}' merged into` : 'Script saved to'
      return `${prefix} 03_Scripts/${package_id}.json${selfCheckSection}`
    })
  },
}

function assignSingleStageLineIds(packageId: string, stageId: string, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const stage = raw as { id?: string; lines?: unknown[] }
  if (!Array.isArray(stage.lines)) return raw
  return { ...stage, id: stageId, lines: generateLineIds(packageId, stageId, stage.lines as any) }
}

function assignLineIds(packageId: string, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as any).stages)) return raw
  const pkg = raw as { stages: unknown[] }
  return {
    ...pkg,
    stages: pkg.stages.map((stage: unknown) => {
      if (typeof stage !== 'object' || stage === null) return stage
      const item = stage as { id?: string; lines?: unknown[] }
      if (!item.id || !Array.isArray(item.lines)) return stage
      return { ...item, lines: generateLineIds(packageId, item.id, item.lines as any) }
    }),
  }
}

export const saveDraftTool: ToolDefinition = {
  name: 'save_draft',
  description: `保存章节草稿到 04_Drafts/{ch{N}.md}。文件名必须是 ch{N}.md 形式（如 ch01.md），UI 才能把草稿对应到 outline 中相同 id 的 chapter 节点。允许保存低于 ${MIN_REVIEW_DRAFT_CHARS} 字的半成品，但送审会被 submit_to_editorial 硬拦；保存后若低于门槛，请继续扩写。`,
  parameters: z.object({
    file_path: z.string()
      .regex(/^ch\d{1,4}\.md$/, "file_path 必须是 'ch{N}.md' 形式（如 ch01.md, ch02.md, ch137.md）。N 是阿拉伯数字章节序号，1-4 位，建议 2-3 位零填充以方便排序。")
      .describe("章节文件名，必须是 'ch{N}.md' 形式（如 ch01.md, ch02.md）。N 用零填充到 2-3 位。会自动放进 04_Drafts/。"),
    content: z.string().describe('要保存的章节正文'),
  }),
  permissionLevel: 'write',
  category: '写入',
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

    ensureDir(path.dirname(target))

    // Serialize concurrent writes targeting the SAME draft file. Different
    // chapters still run fully in parallel (lock keyed on absolute path).
    return withFileLock(target, () => {
      // Archive the prior version into .draft_history/{chapter}/ before the
      // single .bak gets clobbered. .bak handles "oops, my last write was bad";
      // .draft_history/ handles "I rewrote ch01 five times, give me version 3
      // back." Both cheap, both worth keeping.
      archivePriorDraft(bookDir, target)
      createBackup(target)
      fs.writeFileSync(target, content, 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      const relPath = path.posix.join('04_Drafts', baseName)
      appendAuditLog(logFile, 'save_draft', { file_path: relPath }, `saved ${content.length} chars`, true)

      const warning = content.length < MIN_REVIEW_DRAFT_CHARS
        ? `\nWarning: 当前草稿 ${content.length} 字，低于送审最低要求 ${MIN_REVIEW_DRAFT_CHARS} 字。可以作为半成品保存，但必须扩写到达标后再调用 submit_to_editorial。`
        : ''
      const selfCheck = runDraftSelfCheck(content, { minReviewChars: MIN_REVIEW_DRAFT_CHARS, bookDir })
      const selfCheckMessage = selfCheck.issues.length > 0
        ? `\n\n${formatDraftSelfCheck(selfCheck)}`
        : ''
      return `Draft saved to ${relPath} (${content.length} chars)${warning}${selfCheckMessage}`
    })
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
