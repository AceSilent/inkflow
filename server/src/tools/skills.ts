/**
 * Skill tools — dynamic skill discovery with YAML frontmatter.
 * Replaces the static SKILL_REGISTRY dict in Python.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { type ToolDefinition } from './base-tool.js'

// Resolve prompts dir relative to project root (server is in project/server/)
const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts'
)

export interface SkillMeta {
  name: string
  category: string
  description: string
  whenToUse: string
  filePath: string
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
  }
  return result
}

export function discoverSkills(promptsDir?: string): Record<string, SkillMeta> {
  const dir = promptsDir ?? PROMPTS_DIR
  const skills: Record<string, SkillMeta> = {}

  if (!fs.existsSync(dir)) return skills

  const files = fs.readdirSync(dir).filter(f => f.startsWith('skill_') && f.endsWith('.md'))

  for (const file of files.sort()) {
    const filePath = path.join(dir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const meta = parseFrontmatter(content)
    const name = meta.name || file.replace('skill_', '').replace('.md', '')
    skills[name] = {
      name,
      category: meta.category || 'other',
      description: meta.description || '',
      whenToUse: meta.when_to_use || '',
      filePath,
    }
  }
  return skills
}

export function loadSkillContent(skillName: string, promptsDir?: string): string {
  const skills = discoverSkills(promptsDir)
  const skill = skills[skillName]
  if (!skill) {
    return `Error: Unknown skill '${skillName}'. Available: ${Object.keys(skills).join(', ')}`
  }
  const content = fs.readFileSync(skill.filePath, 'utf-8')
  // Strip frontmatter and return clean content
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim()
}

// Vercel AI SDK tool definitions
export const loadSkillTool: ToolDefinition = {
  name: 'load_skill',
  description: '加载写作方法论 skill 的完整内容。在写作前使用。',
  parameters: z.object({ skill_name: z.string().describe('skill 名称') }),
  permissionLevel: 'read',
  execute: async ({ skill_name }) => loadSkillContent(skill_name),
}

export const listSkillsTool: ToolDefinition = {
  name: 'list_skills',
  description: '列出所有可用的写作 skill，按分类显示。',
  parameters: z.object({}),
  permissionLevel: 'read',
  execute: async () => {
    const skills = discoverSkills()
    const groups: Record<string, SkillMeta[]> = {}
    for (const s of Object.values(skills)) {
      ;(groups[s.category] ??= []).push(s)
    }
    const lines: string[] = []
    for (const cat of ['writing', 'plotting', 'worldbuilding', 'planning', 'other']) {
      if (!groups[cat]) continue
      lines.push(`[${cat.toUpperCase()}]`)
      for (const s of groups[cat]) {
        lines.push(`  - ${s.name}: ${s.description}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  },
}
