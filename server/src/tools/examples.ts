/**
 * Exemplar tools — read-only example retrieval for writing craft.
 *
 * The library has two layers:
 *  - short annotated examples for precise craft diagnosis;
 *  - chapter-level exemplars for deeper reading before drafting.
 *
 * The goal is to transfer technique, not to copy prose into generated chapters.
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
const CHAPTER_EXAMPLES_DIR = path.join(EXAMPLES_DIR, 'chapters')
const CURATED_MANIFEST_PATH = path.join(EXAMPLES_DIR, 'curated_manifest.json')

interface ExampleMeta {
  id: string
  category: string
  tags: string[]
  title: string
  filePath: string
  workId?: string
  workTitle?: string
  author?: string
  license?: string
  sourceName?: string
  sourceUrl?: string
  relativePath?: string
}

interface CuratedManifest {
  schema_version: number
  purpose: string
  copyright_policy: string
  excluded: Array<{ title: string; reason: string }>
  categories: CuratedCategory[]
}

interface CuratedCategory {
  id: string
  title: string
  description: string
  works: CuratedWork[]
}

interface CuratedWork {
  id: string
  title: string
  author: string
  study_status: string
  tags: string[]
  learn: string[]
  avoid: string[]
  recommended_chapter_types: string[]
  source_note?: string
  categoryId?: string
  categoryTitle?: string
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
      license: meta.license,
    }
  })
}

function walkMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath)
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') return [fullPath]
    return []
  }).sort()
}

export function discoverChapterExamples(chapterDir = CHAPTER_EXAMPLES_DIR): ExampleMeta[] {
  return walkMarkdownFiles(chapterDir).map(filePath => {
    const { meta } = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'))
    return {
      id: meta.id || path.basename(filePath, '.md'),
      category: meta.category || 'general',
      tags: parseTags(meta.tags),
      title: meta.title || path.basename(filePath, '.md'),
      filePath,
      workId: meta.work_id,
      workTitle: meta.work_title,
      author: meta.author,
      license: meta.license,
      sourceName: meta.source_name,
      sourceUrl: meta.source_url,
      relativePath: meta.relative_path,
    }
  })
}

function personalStudyExamplesDir(dataDir: string): string {
  return path.join(path.dirname(dataDir), 'personal_study', 'exemplars')
}

function discoverAllChapterExamples(dataDir: string): ExampleMeta[] {
  return [
    ...discoverChapterExamples(CHAPTER_EXAMPLES_DIR),
    ...discoverChapterExamples(personalStudyExamplesDir(dataDir)),
  ]
}

export function discoverCuratedExemplars(manifestPath = CURATED_MANIFEST_PATH): CuratedWork[] {
  if (!fs.existsSync(manifestPath)) return []
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as CuratedManifest
  return manifest.categories.flatMap(category =>
    category.works.map(work => ({
      ...work,
      categoryId: category.id,
      categoryTitle: category.title,
    })),
  )
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

function renderCuratedEntry(work: CuratedWork): string {
  return [
    `- ${work.title} / ${work.author}`,
    `  category: ${work.categoryTitle || work.categoryId || 'unknown'}`,
    `  status: ${work.study_status}`,
    `  tags: ${work.tags.join(', ') || 'none'}`,
    work.source_note ? `  来源备注: ${work.source_note}` : '',
    `  学什么: ${work.learn.join('；')}`,
    `  不学什么: ${work.avoid.join('；')}`,
    `  推荐章节类型: ${work.recommended_chapter_types.join('；')}`,
  ].join('\n')
}

function renderChapterCatalogEntry(example: ExampleMeta): string {
  return [
    `- id: ${example.id}`,
    `  title: ${[example.workTitle, example.title].filter(Boolean).join(' / ')}`,
    `  category: ${example.category}`,
    `  tags: ${example.tags.join(', ') || 'none'}`,
    `  license: ${example.license || 'unknown'}`,
    example.sourceName ? `  source: ${example.sourceName}${example.sourceUrl ? ` (${example.sourceUrl})` : ''}` : '',
    `  read: read_exemplar_chapter(id='${example.id}')`,
  ].filter(Boolean).join('\n')
}

export const browseExamplesTool: ToolDefinition = {
  name: 'browse_examples',
  description: [
    '按 category/tags 检索范文。',
    '默认返回短范文正反例；scope=curated 时返回高质量候选书目；scope=chapter 时返回章节级范文目录项，再用 read_exemplar_chapter 按 id 阅读整章。',
    '用于学习写作手法，不用于照搬原文。',
  ].join('\n'),
  parameters: z.object({
    scope: z.enum(['micro', 'curated', 'chapter']).optional().describe("检索范围：'micro' 返回短例子；'curated' 返回高质量候选书目；'chapter' 返回章节级范文目录。默认 micro。"),
    category: z.string().optional().describe("示例分类，如 'ai_tone'、'opening'、'dialogue'、'battle'。留空则搜索全部。"),
    tags: z.array(z.string()).optional().describe("标签过滤，如 ['camera_blocking', 'webnovel_clean']。任一标签命中即可。"),
    limit: z.number().int().min(1).max(12).optional().describe('最多返回几条，短例默认 3，章节目录默认 5。'),
  }),
  permissionLevel: 'read',
  category: '范文库',
  execute: async ({ scope, category, tags, limit }, ctx) => {
    const normalizedTags = new Set((tags ?? []).map((t: string) => t.toLowerCase()))
    const normalizedCategory = typeof category === 'string' ? category.toLowerCase() : ''
    if (scope === 'curated') {
      const works = discoverCuratedExemplars()
        .filter(work => !normalizedCategory ||
          work.categoryId?.toLowerCase() === normalizedCategory ||
          work.categoryTitle?.toLowerCase().includes(normalizedCategory) ||
          work.tags.some(tag => tag.toLowerCase() === normalizedCategory))
        .filter(work => normalizedTags.size === 0 || work.tags.some(tag => normalizedTags.has(tag.toLowerCase())))
        .slice(0, limit ?? 8)

      if (works.length === 0) {
        return 'No matching curated exemplars. Try category: xuanhuan_jianghu, xianxia, mystery_occult, western_fantasy_lordship.'
      }

      return [
        '高质量候选范文清单使用原则：这里只是书目和学习目标，不含正文。需要章节时由用户本机 personal_study 库或合法来源导入；阅读后只学结构、节奏、信息分配和文风取舍。',
        '',
        ...works.map(renderCuratedEntry),
      ].join('\n')
    }

    if (scope === 'chapter') {
      const examples = discoverAllChapterExamples(ctx.dataDir)
        .filter(e => !category || e.category === category)
        .filter(e => normalizedTags.size === 0 || e.tags.some(t => normalizedTags.has(t.toLowerCase())))
        .slice(0, limit ?? 5)

      if (examples.length === 0) {
        return 'No matching chapter exemplars. Try category: fantasy, historical, action, relationship, satire, wuxia, social.'
      }

      return [
        '章节级范文库使用原则：先浏览目录，必要时再用 read_exemplar_chapter 读取整章；如果相同 id 的范文已经在当前上下文或工作集里，不要重复读取。',
        '只学习结构、节奏、信息分配和场景推进；不要复用具体句子、设定或桥段。',
        '',
        ...examples.map(renderChapterCatalogEntry),
      ].join('\n')
    }

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

export const readExemplarChapterTool: ToolDefinition = {
  name: 'read_exemplar_chapter',
  description: [
    '按 id 读取章节级范文全文。',
    '只在当前任务确实需要章节级参照、且该 id 尚未出现在上下文时调用。',
    '用于学习结构、节奏、信息分配和场景推进；不得照搬具体句子、设定或桥段。',
  ].join('\n'),
  parameters: z.object({
    id: z.string().min(1).describe("章节范文 id，例如 'journey-to-the-west-001'。先用 browse_examples(scope='chapter') 获取。"),
  }),
  permissionLevel: 'read',
  category: '范文库',
  execute: async ({ id }, ctx) => {
    const example = discoverAllChapterExamples(ctx.dataDir).find(item => item.id === id)
    if (!example) {
      return `Error: unknown exemplar chapter id ${id}. Use browse_examples(scope='chapter') first.`
    }
    const { body } = parseFrontmatter(fs.readFileSync(example.filePath, 'utf-8'))
    return [
      '章节级范文使用原则：阅读后只提炼结构、节奏、信息分配、场景推进和章节钩子；不要复用具体句子、设定或桥段。',
      `id: ${example.id}`,
      `work: ${example.workTitle || example.workId || 'unknown'}`,
      `title: ${example.title}`,
      `category: ${example.category}`,
      `tags: ${example.tags.join(', ') || 'none'}`,
      `license: ${example.license || 'unknown'}`,
      example.sourceName ? `source: ${example.sourceName}${example.sourceUrl ? ` (${example.sourceUrl})` : ''}` : '',
      '',
      body,
    ].filter(Boolean).join('\n')
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
    '分析用户提供的参考文本，生成并保存本书 style_profile.json。',
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
