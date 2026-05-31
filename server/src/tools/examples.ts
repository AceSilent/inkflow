/**
 * Exemplar tools — read-only micro-example retrieval for writing craft.
 *
 * Examples are intentionally short and annotated. The goal is to transfer
 * technique, not to copy prose into generated chapters.
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { type ToolDefinition } from './base-tool.js'
import { appendAuditLog, createBackup } from './safety.js'
import { ensureDir } from '../utils/file-io.js'

const EXAMPLES_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts/examples',
)

interface ExampleMeta {
  id: string
  category: string
  tags: string[]
  title: string
  filePath: string
}

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (!match) return { meta: {}, body: content.trim() }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { meta, body: content.slice(match[0].length).trim() }
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function discoverExamples(examplesDir = EXAMPLES_DIR): ExampleMeta[] {
  if (!fs.existsSync(examplesDir)) return []
  const files = fs.readdirSync(examplesDir)
    .filter(f => f.endsWith('.md'))
    .sort()

  return files.map(file => {
    const filePath = path.join(examplesDir, file)
    const { meta } = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'))
    return {
      id: meta.id || file.replace(/\.md$/, ''),
      category: meta.category || 'general',
      tags: parseTags(meta.tags),
      title: meta.title || file.replace(/\.md$/, ''),
      filePath,
    }
  })
}

function renderExample(example: ExampleMeta): string {
  const { body } = parseFrontmatter(fs.readFileSync(example.filePath, 'utf-8'))
  return [
    `## ${example.title}`,
    `id: ${example.id}`,
    `category: ${example.category}`,
    `tags: ${example.tags.join(', ') || 'none'}`,
    '',
    body,
  ].join('\n')
}

export const browseExamplesTool: ToolDefinition = {
  name: 'browse_examples',
  description: '按 category/tags 检索短范文正反例。用于学习写作手法，不用于照搬原文。返回 1-3 条高度相关的微型示例。',
  parameters: z.object({
    category: z.string().optional().describe("示例分类，如 'ai_tone'、'opening'、'dialogue'、'battle'。留空则搜索全部。"),
    tags: z.array(z.string()).optional().describe("标签过滤，如 ['camera_blocking', 'webnovel_clean']。任一标签命中即可。"),
    limit: z.number().int().min(1).max(5).optional().describe('最多返回几条，默认 3。'),
  }),
  permissionLevel: 'read',
  category: '范文库',
  execute: async ({ category, tags, limit }) => {
    const normalizedTags = new Set((tags ?? []).map((t: string) => t.toLowerCase()))
    const examples = discoverExamples()
      .filter(e => !category || e.category === category)
      .filter(e => normalizedTags.size === 0 || e.tags.some(t => normalizedTags.has(t.toLowerCase())))
      .slice(0, limit ?? 3)

    if (examples.length === 0) {
      return 'No matching examples. Try category: ai_tone, opening, dialogue, battle.'
    }

    return [
      '范文库使用原则：只学习结构、节奏、信息分配和修订方向；不要复用具体句子、设定或桥段。',
      '',
      ...examples.map(renderExample),
    ].join('\n\n---\n\n')
  },
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

function analyzeStyle(referenceText: string) {
  const paragraphs = referenceText
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
  const sentences = referenceText
    .split(/[。！？!?；;]/)
    .map(s => s.trim())
    .filter(Boolean)
  const chars = referenceText.replace(/\s/g, '').length
  const dialogueCount = countMatches(referenceText, /[“"][^”"]+[”"]/g)
  const metaphorCount = countMatches(referenceText, /像|仿佛|宛如|好像|似乎/g)
  const jokeMarkers = countMatches(referenceText, /吐槽|离谱|什么鬼|不是|这也|就这|草|绷|行吧|算了/g)
  const dashCount = countMatches(referenceText, /——/g)
  const aiDeathWords = Array.from(new Set(
    (referenceText.match(/那是|像是|仿佛|似乎|宛如|一丝|一抹|一道|不禁|不可思议|无形|某种/g) ?? [])
  ))

  return {
    generated_at: new Date().toISOString(),
    source: 'analyze_style_profile',
    metrics: {
      total_chars: chars,
      paragraph_count: paragraphs.length,
      sentence_count: sentences.length,
      avg_sentence_chars: sentences.length ? Math.round(chars / sentences.length) : 0,
      avg_paragraph_chars: paragraphs.length ? Math.round(chars / paragraphs.length) : 0,
      dialogue_ratio: chars ? Number((dialogueCount / Math.max(1, sentences.length)).toFixed(3)) : 0,
      metaphor_density_per_1000_chars: chars ? Number((metaphorCount * 1000 / chars).toFixed(2)) : 0,
      joke_marker_density_per_1000_chars: chars ? Number((jokeMarkers * 1000 / chars).toFixed(2)) : 0,
      dash_count: dashCount,
    },
    style_rules: [
      '正文优先用干净网文直叙推进处境、判断和行动，镜头调度可以有但不能连续密集。',
      '干净不等于碎句流水账；短句负责压力，较长句负责承接信息、行动和判断。',
      '轻吐槽服务人物反应，不要每个信息点都包装成比喻或段子。',
      `参考文本平均句长约 ${sentences.length ? Math.round(chars / sentences.length) : 0} 字，写作时避免连续长句堆叠。`,
      `参考文本平均段落约 ${paragraphs.length ? Math.round(chars / paragraphs.length) : 0} 字，段落要短而有推进。`,
      dashCount > 0 ? '参考文本存在少量破折号，但审稿仍按破折号解释滥用严格检查。' : '参考文本几乎不用破折号，正文应避免破折号解释。',
    ],
    anti_patterns: [
      '开篇连续“人物动作 -> 环境质感 -> 视线移动 -> 心理总结”的镜头链。',
      '同一段连续多个强比喻、拟人或网络段子式修辞。',
      '连续短段只写“站起/看见/低头/皱眉/往前走”等动作清单，缺少判断、冲突和选择。',
      '用“仿佛、像是、某种、无形、一丝、一抹”虚化情绪或环境。',
      ...aiDeathWords.slice(0, 8).map(w => `参考/输入中出现过但需克制的高风险词：${w}`),
    ],
    opening_guidance: '第一屏先交代明确困境、主角判断和下一步压力；少摆镜头，少炫句。',
    humor_guidance: '吐槽要贴着主角当下处境，短促、口语化，不能替代行动和冲突推进。',
    action_psychology_guidance: '动作、环境、心理穿插时，一段只承载一个重点，不连续堆“看见/听见/感到/意识到”。',
  }
}

export const analyzeStyleProfileTool: ToolDefinition = {
  name: 'analyze_style_profile',
  description: [
    '分析用户提供的参考文本，生成并保存本项目 style_profile.json。',
    '用于把范文库从原文参考升级为文风控制面：句长、段落、对话、吐槽、比喻密度、AI腔禁区。',
    '只提取风格指纹和写作约束，不复用原文句子。',
  ].join('\n'),
  parameters: z.object({
    reference_text: z.string().min(100).describe('参考文本原文，可由用户附件或粘贴内容提供。只用于风格分析，不得照抄。'),
  }),
  permissionLevel: 'write',
  category: '范文库',
  execute: async ({ reference_text }, ctx) => {
    const bookDir = path.join(ctx.dataDir, ctx.bookId)
    const target = path.join(ensureDir(path.join(bookDir, '01_Global_Settings')), 'style_profile.json')
    const profile = analyzeStyle(reference_text)
    createBackup(target)
    fs.writeFileSync(target, JSON.stringify(profile, null, 2), 'utf-8')
    appendAuditLog(
      path.join(bookDir, 'audit_log.jsonl'),
      'analyze_style_profile',
      { reference_chars: reference_text.length },
      'saved style_profile.json',
      true,
    )
    return [
      'Style profile saved to 01_Global_Settings/style_profile.json.',
      `avg_sentence_chars=${profile.metrics.avg_sentence_chars}`,
      `metaphor_density_per_1000_chars=${profile.metrics.metaphor_density_per_1000_chars}`,
      '写正文前请按 style_rules 和 anti_patterns 控制文风，不要复用参考原文。',
    ].join('\n')
  },
}
