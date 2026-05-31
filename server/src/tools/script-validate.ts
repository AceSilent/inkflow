import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { type ToolDefinition, type ToolContext } from './base-tool.js'
import { StoryPackageSchema } from '../schemas/index.js'
import { runScriptSelfCheck } from './script-self-check.js'

export const scriptValidateTool: ToolDefinition = {
  name: 'validate_script',
  description: '校验剧本 YAML 文件：schema 检查 + 可达性分析 + 自检规则。读取 03_Scripts/{package_id}.yaml 并报告所有问题。',
  parameters: z.object({
    package_id: z.string().describe('要校验的故事包 ID'),
  }),
  permissionLevel: 'read',
  category: '读取',
  execute: async (args: { package_id: string }, ctx: ToolContext) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const yamlPath = path.resolve(bookDir, '03_Scripts', `${args.package_id}.yaml`)

    if (!yamlPath.startsWith(path.resolve(bookDir))) {
      return 'Error: Access denied — path outside project directory.'
    }

    if (!fs.existsSync(yamlPath)) {
      return `Error: Script file not found: 03_Scripts/${args.package_id}.yaml`
    }

    let raw: unknown
    try {
      raw = parseYaml(fs.readFileSync(yamlPath, 'utf-8'))
    } catch (e) {
      return `Error: Failed to parse YAML — ${e}`
    }

    const parseResult = StoryPackageSchema.safeParse(raw)
    if (!parseResult.success) {
      const errorLines = parseResult.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`)
      return `Schema validation failed:\n${errorLines.join('\n')}`
    }

    const selfCheck = runScriptSelfCheck(parseResult.data)
    if (selfCheck.passed) return 'All checks passed.'

    const lines = selfCheck.issues.map(i => `[sev${i.severity}] ${i.type}: ${i.message}`)
    return `${selfCheck.blockReview ? 'BLOCKED' : 'WARNINGS'}:\n${lines.join('\n')}`
  },
}
