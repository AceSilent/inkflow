import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { type ToolContext, type ToolDefinition } from './base-tool.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { runScriptSelfCheck } from './script-self-check.js'

export const scriptValidateTool: ToolDefinition = {
  name: 'validate_script',
  description: '校验游戏文案脚本 JSON 文件：schema 检查 + 可达性分析 + 自检规则。读取 03_Scripts/{package_id}.json 并报告问题。',
  parameters: z.object({
    package_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).describe('要校验的故事包 ID'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async ({ package_id }: { package_id: string }, ctx: ToolContext) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const scriptsDir = path.resolve(bookDir, '03_Scripts')
    const scriptPath = path.resolve(scriptsDir, `${package_id}.json`)

    if (!scriptPath.startsWith(scriptsDir + path.sep)) {
      return 'Error: Access denied — path outside book directory.'
    }
    if (!fs.existsSync(scriptPath)) {
      return `Error: Script file not found: 03_Scripts/${package_id}.json`
    }

    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'))
    } catch (e) {
      return `Error: Failed to parse JSON — ${e}`
    }

    const parseResult = StoryPackageSchema.safeParse(raw)
    if (!parseResult.success) {
      const errorLines = parseResult.error.issues.map(issue => `- ${issue.path.join('.')}: ${issue.message}`)
      return `Schema validation failed:\n${errorLines.join('\n')}`
    }

    const selfCheck = runScriptSelfCheck(parseResult.data)
    if (selfCheck.passed) return 'All checks passed.'

    const lines = selfCheck.issues.map(issue => `[sev${issue.severity}] ${issue.type}: ${issue.message}`)
    return `${selfCheck.blockReview ? 'BLOCKED' : 'WARNINGS'}:\n${lines.join('\n')}`
  },
}

