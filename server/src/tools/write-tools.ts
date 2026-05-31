/**
 * Write tools — save_script, save_outline, save_lore.
 * All write tools include safety: backup + audit log + path traversal check.
 */
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { stringify as yamlStringify, parse as yamlParse } from 'yaml'
import { type ToolDefinition } from './base-tool.js'
import { createBackup, appendAuditLog, withFileLock } from './safety.js'
import { ensureDir, safeReadJson } from '../utils/file-io.js'
import { generateLineIds } from '../services/line-id.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { StageSchema } from '../schemas/stage.js'
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
  description: [
    '保存剧本到 03_Scripts/{package_id}.yaml。必须传 stage_id + stage_json 逐 stage 写入。',
    'script_json 仅用于首次创建故事包（YAML 不存在时）；已有文件时会被拒绝。',
    '自动生成行 ID，校验 schema，运行自检规则。',
  ].join('\n'),
  parameters: z.object({
    package_id: z.string().describe('故事包 ID，用作文件名（不含扩展名）'),
    script_json: z.string().optional().describe('完整 StoryPackage JSON 字符串（整包写入模式）'),
    stage_id: z.string().optional().describe('要合并的 stage ID（单 stage 模式）'),
    stage_json: z.string().optional().describe('单个 Stage JSON 字符串（单 stage 模式，与 stage_id 配合）'),
  }),
  permissionLevel: 'write',
  category: '写入',
  execute: async ({ package_id, script_json, stage_id, stage_json }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const scriptsDir = ensureDir(path.join(bookDir, '03_Scripts'))
    const target = path.resolve(scriptsDir, `${package_id}.yaml`)

    if (!target.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside project directory.'
    }

    let pkg: any

    if (stage_id && stage_json) {
      // Single-stage merge mode
      let rawStage: unknown
      try {
        rawStage = JSON.parse(stage_json)
      } catch (e) {
        return `Error: Invalid stage_json — ${e}`
      }

      if (!fs.existsSync(target)) {
        return `Error: 03_Scripts/${package_id}.yaml not found. First use script_json to create the package, then use stage_id+stage_json to update individual stages.`
      }

      const existing = yamlParse(fs.readFileSync(target, 'utf-8'))
      if (!existing?.stages || !Array.isArray(existing.stages)) {
        return `Error: Existing YAML has no stages array.`
      }

      // Assign line IDs for the incoming stage
      const stageWithIds = assignSingleStageLineIds(package_id, stage_id, rawStage)
      const stageResult = StageSchema.safeParse(stageWithIds)
      if (!stageResult.success) {
        const errorLines = stageResult.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`)
        return `Error: Stage schema validation failed:\n${errorLines.join('\n')}`
      }

      const idx = existing.stages.findIndex((s: any) => s.id === stage_id)
      if (idx >= 0) {
        existing.stages[idx] = stageResult.data
      } else {
        existing.stages.push(stageResult.data)
      }

      const fullResult = StoryPackageSchema.safeParse(existing)
      if (!fullResult.success) {
        const errorLines = fullResult.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`)
        return `Error: Merged package schema validation failed:\n${errorLines.join('\n')}`
      }
      pkg = fullResult.data
    } else if (script_json) {
      // Full package write — only allowed when YAML doesn't exist yet
      if (fs.existsSync(target)) {
        return 'Error: 03_Scripts/' + package_id + '.yaml already exists. Use stage_id + stage_json to update individual stages. Full-package overwrite is blocked to prevent accidental data loss.'
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
        const errorLines = parseResult.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`)
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

    return withFileLock(target, async () => {
      createBackup(target)
      fs.writeFileSync(target, yamlStringify(pkg), 'utf-8')

      const logFile = path.join(bookDir, 'audit_log.jsonl')
      const detail = stage_id ? `merged stage ${stage_id} into ${package_id}.yaml` : `saved ${package_id}.yaml`
      appendAuditLog(logFile, 'save_script', { package_id, stage_id }, detail, true)

      const prefix = stage_id ? `Stage '${stage_id}' merged into` : 'Script saved to'
      return `${prefix} 03_Scripts/${package_id}.yaml${selfCheckSection}`
    })
  },
}

function assignSingleStageLineIds(packageId: string, stageId: string, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const s = raw as { id?: string; lines?: unknown[] }
  if (!Array.isArray(s.lines)) return raw
  return { ...s, id: stageId, lines: generateLineIds(packageId, stageId, s.lines as any) }
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
    '保存/更新项目大纲。outline_json 必须是规范三层结构：',
    "{ id: <projectId>, label: '...', type: 'project', children: [",
    "  { id: 'pkg1', type: 'story_package', label: '...', children: [",
    "    { id: 'arrival', type: 'stage', label: '...', summary: '...' }, ...",
    '  ]}, ...',
    ']}',
    "type 必须是 'project'/'story_package'/'stage'/'scene' 之一。stage 的 id 使用有意义的英文短名（如 arrival, branch_calm_wit, convergence）。",
    '不要塞 free-form JSON（世界观/角色/系统设定这些应走 save_lore）。',
    '可选字段：project 节点 synopsis（项目梗概）；story_package 节点 synopsis（故事包梗概）；stage 节点 summary（stage 摘要）。',
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
        "Required shape: { id, label, type:'project', children:[{ id, type:'story_package', children:[{ id, type:'stage', label, summary }] }] }.",
        '世界观/角色/系统设定这类信息请用 save_lore 保存，不要塞进 outline。',
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

const VALID_OUTLINE_TYPES = new Set(['project', 'story_package', 'stage', 'scene'])

/** Returns null if `node` is a valid outline subtree, else an error string. */
function validateOutlineNode(node: any, where: string): string | null {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return `${where}: must be an object, got ${Array.isArray(node) ? 'array' : typeof node}`
  }
  if (typeof node.type !== 'string' || !VALID_OUTLINE_TYPES.has(node.type)) {
    return `${where}: missing or invalid 'type' (got ${JSON.stringify(node.type)}); must be one of project/story_package/stage/scene`
  }
  if (where === 'root' && node.type !== 'project') {
    return `root: type must be 'project', got '${node.type}'`
  }
  if (typeof node.id !== 'string' || node.id.length === 0) {
    return `${where}: missing 'id' string`
  }
  // Optional narrative fields — scoped by node type.
  if (node.epigraph !== undefined) {
    if (node.type !== 'project') {
      return `${where}: 'epigraph' only allowed on project, got ${node.type}`
    }
    if (typeof node.epigraph !== 'string') {
      return `${where}: 'epigraph' must be a string`
    }
  }
  if (node.synopsis !== undefined) {
    if (node.type !== 'project' && node.type !== 'story_package') {
      return `${where}: 'synopsis' only allowed on project or story_package, got ${node.type}`
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
  description: "读取项目大纲，可选筛选故事包序号。大纲是当前标准 children 树：project.children[] 为 story_package，story_package.children[] 为 stage。",
  parameters: z.object({
    volume: z.number().optional().describe('故事包序号（可选，1-based）'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ volume }, ctx) => {
    const data = safeReadJson<any>(path.join(ctx.dataDir, ctx.bookId, '02_Outlines', 'outline.json'))
    if (!data) return 'Error: Outline file not found or unreadable.'

    if (volume !== undefined) {
      // Support both legacy 'volume' and new 'story_package' node types
      const volumes = Array.isArray(data.children)
        ? data.children.filter((v: any) => v?.type === 'volume' || v?.type === 'story_package')
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
