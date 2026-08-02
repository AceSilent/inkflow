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

const GENRE_ALIASES: Record<string, string[]> = {
  xuanhuan_jianghu: ['xuanhuan_jianghu', 'xuanhuan', '玄幻', '江湖', '玄幻江湖'],
  xianxia: ['xianxia', '仙侠', '修仙', '传统修仙', '志怪'],
  mystery_occult: ['mystery_occult', 'mystery', 'occult', '悬疑', '推理', '灵异', '民俗', '克系', '恐怖'],
  western_fantasy_lordship: ['western_fantasy_lordship', 'western_fantasy', 'fantasy', '西幻', '奇幻', '领主', '建设'],
  light_novel_fanfiction: ['light_novel_fanfiction', 'light_novel', 'fanfiction', '轻小说', '衍生', '同人', '日常喜剧'],
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

function searchableChapterMetadata(example: ExampleMeta): string {
  return [
    example.id,
    example.title,
    example.category,
    example.workId,
    example.workTitle,
    example.author,
    example.relativePath,
    ...example.tags,
  ].filter(Boolean).join('\n').toLowerCase()
}

function queryTerms(query: string | undefined): string[] {
  if (!query?.trim()) return []
  return Array.from(new Set(
    query
      .toLowerCase()
      .split(/[\s,，、;；|/]+/)
      .map(term => term.trim())
      .filter(Boolean),
  ))
}

function textQueryScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 1
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0)
}

function chapterQueryScore(example: ExampleMeta, terms: string[]): number {
  if (terms.length === 0) return 1
  const metadata = searchableChapterMetadata(example)
  const body = fs.readFileSync(example.filePath, 'utf-8').toLowerCase()
  return terms.reduce((score, term) => {
    if (metadata.includes(term)) return score + 4
    if (body.includes(term)) return score + 1
    return score
  }, 0)
}

function chapterMatchesWork(example: ExampleMeta, work: string): boolean {
  const normalized = work.trim().toLowerCase()
  if (!normalized) return true
  return [example.workId, example.workTitle]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(normalized))
}

function normalizeGenre(genre: string | undefined): string {
  const normalized = genre?.trim().toLowerCase()
  if (!normalized) return ''
  for (const [id, aliases] of Object.entries(GENRE_ALIASES)) {
    if (aliases.some(alias => alias.toLowerCase() === normalized)) return id
  }
  return normalized
}

function discoverCuratedCategories(manifestPath = CURATED_MANIFEST_PATH): CuratedCategory[] {
  if (!fs.existsSync(manifestPath)) return []
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as CuratedManifest
  return manifest.categories
}

export function discoverCuratedExemplars(manifestPath = CURATED_MANIFEST_PATH): CuratedWork[] {
  return discoverCuratedCategories(manifestPath).flatMap(category =>
    category.works.map(work => ({
      ...work,
      categoryId: category.id,
      categoryTitle: category.title,
    })),
  )
}

function buildChapterGenreLookup(): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const work of discoverCuratedExemplars()) {
    if (!work.categoryId) continue
    lookup.set(work.id.toLowerCase(), work.categoryId)
    lookup.set(work.title.toLowerCase(), work.categoryId)
  }
  return lookup
}

function chapterGenre(example: ExampleMeta, lookup: Map<string, string>): string {
  const mapped = [example.workId, example.workTitle]
    .filter(Boolean)
    .map(value => lookup.get(value!.toLowerCase()))
    .find(Boolean)
  if (mapped) return mapped

  const category = example.category.toLowerCase()
  if (category === 'xianxia') return 'xianxia'
  if (category === 'fantasy') return 'western_fantasy_lordship'
  return normalizeGenre(category)
}

function chapterMatchesGenre(example: ExampleMeta, genre: string, lookup: Map<string, string>): boolean {
  return !genre || chapterGenre(example, lookup) === genre
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

function renderLocalWorkEntry(examples: ExampleMeta[], genreLookup: Map<string, string>): string {
  const first = examples[0]
  const categories = Array.from(new Set(examples.map(item => item.category))).join(', ')
  const genres = Array.from(new Set(examples.map(item => chapterGenre(item, genreLookup)))).join(', ')
  const tags = Array.from(new Set(examples.flatMap(item => item.tags))).slice(0, 12).join(', ')
  return [
    `- ${first.workTitle || first.workId || first.title}${first.author ? ` / ${first.author}` : ''}`,
    `  work: ${first.workId || first.workTitle || first.id}`,
    `  chapters: ${examples.length}`,
    `  genres: ${genres || 'uncategorized'}`,
    `  categories: ${categories || 'general'}`,
    `  tags: ${tags || 'none'}`,
    `  browse: browse_examples(scope='chapter', work='${first.workId || first.workTitle || first.id}')`,
  ].join('\n')
}

export const browseExamplesTool: ToolDefinition = {
  name: 'browse_examples',
  description: [
    '自主浏览和检索写作范文库。',
    '不需要关键词也能按书籍题材阅读：scope=genres 查看题材，scope=library + genre 查看该题材下的本机作品，scope=chapter + genre/work 浏览章节，再用 read_exemplar_chapter 按 id 阅读整章。',
    'scope=curated 返回候选书目；scope=micro 返回短范文正反例。category 表示微型案例分类，genre 表示小说题材，不要混用。',
    '章节结果支持 offset 分页，不限制 Agent 只能浏览书库开头或只读一章。',
    '用于学习写作手法，不用于照搬原文。',
  ].join('\n'),
  parameters: z.object({
    scope: z.enum(['micro', 'genres', 'curated', 'library', 'chapter']).optional().describe("检索范围：'micro' 返回短例子；'genres' 返回题材目录；'curated' 返回候选书目；'library' 返回本机已有作品；'chapter' 返回可阅读全文的章节目录。默认 micro。"),
    genre: z.string().optional().describe("小说题材，如 'xianxia' / '仙侠'、'mystery_occult' / '悬疑灵异'、'western_fantasy_lordship' / '西幻领主'。可不提供 query，直接按题材浏览作品和章节。"),
    category: z.string().optional().describe("微型案例或章节元数据分类，如 'ai_tone'、'opening'、'dialogue'、'battle'。小说大类请使用 genre。"),
    tags: z.array(z.string()).optional().describe("标签过滤，如 ['camera_blocking', 'webnovel_clean']。任一标签命中即可。"),
    work: z.string().optional().describe("作品 id 或书名，可部分匹配。例如 'seventy-two-transformations' 或 '地煞七十二变'。"),
    query: z.string().min(1).optional().describe('可选关键词。章节范围会检索作品、作者、章节名、标签和正文内容；只想按题材翻阅时不要填写。'),
    offset: z.number().int().min(0).optional().describe('从第几条结果开始，用于继续翻阅目录。默认 0。'),
    limit: z.number().int().min(1).max(30).optional().describe('本页最多返回几条，短例默认 3，书库和章节目录默认 8。'),
  }),
  permissionLevel: 'read',
  category: '范文库',
  execute: async ({ scope, genre, category, tags, work, query, offset, limit }, ctx) => {
    const normalizedTags = new Set((tags ?? []).map((t: string) => t.toLowerCase()))
    const normalizedCategory = typeof category === 'string' ? category.toLowerCase() : ''
    const normalizedGenre = normalizeGenre(genre)
    const terms = queryTerms(query)
    const start = offset ?? 0
    const needsChapterLibrary = ['genres', 'library', 'chapter'].includes(scope ?? 'micro')
    const allChapters = needsChapterLibrary ? discoverAllChapterExamples(ctx.dataDir) : []
    const genreLookup = needsChapterLibrary ? buildChapterGenreLookup() : new Map<string, string>()

    if (scope === 'genres') {
      const categories = discoverCuratedCategories()
      return [
        '范文题材目录。local 表示本机可立即阅读全文的作品和章节数；candidates 只表示候选书目。',
        '选择题材后使用 browse_examples(scope=\'library\', genre=\'题材 id\')；无需关键词。',
        '',
        ...categories.map(item => {
          const localExamples = allChapters.filter(example =>
            chapterMatchesGenre(example, item.id, genreLookup))
          const localWorks = new Set(localExamples.map(example =>
            example.workId || example.workTitle || example.id))
          return [
            `- ${item.title}`,
            `  genre: ${item.id}`,
            `  local: ${localWorks.size} works / ${localExamples.length} chapters`,
            `  candidates: ${item.works.length}`,
            `  focus: ${item.description}`,
            `  browse: browse_examples(scope='library', genre='${item.id}')`,
          ].join('\n')
        }),
      ].join('\n')
    }

    if (scope === 'curated') {
      const matchingWorks = discoverCuratedExemplars()
        .filter(work => !normalizedGenre || work.categoryId === normalizedGenre)
        .filter(work => !normalizedCategory ||
          work.categoryId?.toLowerCase() === normalizedCategory ||
          work.categoryTitle?.toLowerCase().includes(normalizedCategory) ||
          work.tags.some(tag => tag.toLowerCase() === normalizedCategory))
        .filter(work => normalizedTags.size === 0 || work.tags.some(tag => normalizedTags.has(tag.toLowerCase())))
        .map(item => ({
          item,
          score: textQueryScore([
            item.id,
            item.title,
            item.author,
            item.categoryId,
            item.categoryTitle,
            ...item.tags,
            ...item.learn,
          ].filter(Boolean).join('\n').toLowerCase(), terms),
        }))
        .filter(entry => terms.length === 0 || entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.item)
      const works = matchingWorks.slice(start, start + (limit ?? 8))

      if (works.length === 0) {
        return '候选书目中没有匹配项。可去掉 category/tags，或先用 scope=genres 查看题材目录。注意：候选书目不含章节正文。'
      }

      return [
        '高质量候选范文清单使用原则：这里只是书目和学习目标，不含正文。需要章节时由用户本机 personal_study 库或合法来源导入；阅读后只学结构、节奏、信息分配和文风取舍。',
        `结果 ${start + 1}-${start + works.length} / ${matchingWorks.length}${start + works.length < matchingWorks.length ? `；继续浏览使用 offset=${start + works.length}` : ''}`,
        '',
        ...works.map(renderCuratedEntry),
      ].join('\n')
    }

    if (scope === 'library') {
      const workChapters = allChapters
        .filter(e => !work || chapterMatchesWork(e, work))
        .filter(e => chapterMatchesGenre(e, normalizedGenre, genreLookup))
      const strictlyFiltered = workChapters
        .filter(e => !normalizedCategory || e.category.toLowerCase() === normalizedCategory)
        .filter(e => normalizedTags.size === 0 || e.tags.some(t => normalizedTags.has(t.toLowerCase())))
      const filtersRelaxed = strictlyFiltered.length === 0 &&
        workChapters.length > 0 &&
        Boolean(normalizedCategory || normalizedTags.size > 0)
      const chapterPool = filtersRelaxed ? workChapters : strictlyFiltered
      const groupedWithScores = Array.from(
        chapterPool
          .reduce((map, example) => {
            const key = example.workId || example.workTitle || example.id
            const existing = map.get(key) ?? []
            existing.push(example)
            map.set(key, existing)
            return map
          }, new Map<string, ExampleMeta[]>()),
      )
        .map(([, examples]) => ({
          examples,
          score: terms.length === 0
            ? 1
            : Math.max(...examples.map(example => chapterQueryScore(example, terms))),
        }))
      const hasQueryMatches = groupedWithScores.some(entry => entry.score > 0)
      const grouped = groupedWithScores
        .filter(entry => !hasQueryMatches || entry.score > 0)
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score
          const personalRank = Number(b.examples[0].license === 'personal_study') - Number(a.examples[0].license === 'personal_study')
          if (personalRank !== 0) return personalRank
          return (a.examples[0].workTitle || a.examples[0].workId || a.examples[0].title)
            .localeCompare(b.examples[0].workTitle || b.examples[0].workId || b.examples[0].title, 'zh-CN')
        })
        .map(entry => entry.examples)
      const page = grouped.slice(start, start + (limit ?? 8))

      if (page.length === 0) {
        return '本机书库没有可用作品。请先检查 personal_study/exemplars 是否存在章节文件；scope=curated 只能查看候选书目，不能读取正文。'
      }

      return [
        '本机章节范文库。你可以自主选择作品、继续分页、检索章节并阅读全文；不需要用户另行授权。',
        filtersRelaxed ? '指定的 category/tags 没有命中，已自动放宽这些过滤条件。' : '',
        terms.length > 0 && !hasQueryMatches ? '关键词没有直接命中；下面列出当前可用作品，供继续按作品浏览。' : '',
        `结果 ${start + 1}-${start + page.length} / ${grouped.length}${start + page.length < grouped.length ? `；继续浏览使用 offset=${start + page.length}` : ''}`,
        '',
        ...page.map(examples => renderLocalWorkEntry(examples, genreLookup)),
      ].filter(Boolean).join('\n')
    }

    if (scope === 'chapter') {
      const workExamples = allChapters
        .filter(e => !work || chapterMatchesWork(e, work))
        .filter(e => chapterMatchesGenre(e, normalizedGenre, genreLookup))
      const strictlyFiltered = workExamples
        .filter(e => !normalizedCategory || e.category.toLowerCase() === normalizedCategory)
        .filter(e => normalizedTags.size === 0 || e.tags.some(t => normalizedTags.has(t.toLowerCase())))
      let filtersRelaxed = false
      let scoredExamples = strictlyFiltered
        .map(example => ({ example, score: chapterQueryScore(example, terms) }))
        .filter(entry => terms.length === 0 || entry.score > 0)

      if (scoredExamples.length === 0 && terms.length > 0 && (normalizedCategory || normalizedTags.size > 0)) {
        filtersRelaxed = true
        scoredExamples = workExamples
          .map(example => ({ example, score: chapterQueryScore(example, terms) }))
          .filter(entry => entry.score > 0)
      }

      const matchingExamples = scoredExamples
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score
          const personalRank = Number(b.example.license === 'personal_study') - Number(a.example.license === 'personal_study')
          if (personalRank !== 0) return personalRank
          return a.example.filePath.localeCompare(b.example.filePath, 'zh-CN')
        })
        .map(entry => entry.example)
      const examples = matchingExamples.slice(start, start + (limit ?? 8))

      if (examples.length === 0) {
        return '章节正文中没有匹配项。请缩短 query、改用一两个具体词，或先用 scope=library 查看本机有哪些作品。只有成功调用 read_exemplar_chapter 才算真正读过章节。'
      }

      return [
        '章节级范文库。可以按当前任务自主翻阅、比较或连续阅读；相同 id 已在当前上下文时优先复用，除非需要逐字核对或续读比较。',
        '只学习结构、节奏、信息分配和场景推进；不要复用具体句子、设定或桥段。',
        filtersRelaxed ? '指定的 category/tags 没有命中，已自动放宽这些过滤条件，并按正文关键词相关度排序。' : '',
        `结果 ${start + 1}-${start + examples.length} / ${matchingExamples.length}${start + examples.length < matchingExamples.length ? `；继续浏览使用 offset=${start + examples.length}` : ''}`,
        '',
        ...examples.map(renderChapterCatalogEntry),
      ].filter(Boolean).join('\n')
    }

    const matchingMicroExamples = discoverExamples()
      .filter(e => !category || e.category === category)
      .filter(e => normalizedTags.size === 0 || e.tags.some(t => normalizedTags.has(t.toLowerCase())))
      .map(example => ({
        example,
        score: textQueryScore(
          fs.readFileSync(example.filePath, 'utf-8').toLowerCase(),
          terms,
        ),
      }))
      .filter(entry => terms.length === 0 || entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.example)
    const examples = matchingMicroExamples.slice(start, start + (limit ?? 3))

    if (examples.length === 0) {
      return '微型正反例中没有匹配项。可尝试 category: ai_tone、opening、dialogue、battle，或去掉 query。微型案例不等于章节范文。'
    }

    return [
      '以下是内置微型正反例，不是书库章节全文。只学习结构、节奏、信息分配和修订方向；不要把它描述成“读过某本小说的范文章节”。',
      ...examples.map(renderExample),
    ].join('\n\n---\n\n')
  },
}

export const readExemplarChapterTool: ToolDefinition = {
  name: 'read_exemplar_chapter',
  description: [
    '按 id 读取章节级范文全文。',
    'Agent 可按当前写作、比较研究、续读或风格校准需要自主调用；没有固定阅读章数。',
    '同一 id 已在当前上下文时优先复用已有观察，需要逐字核对或重新比较时可以再次读取。',
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
      return `错误：未找到章节范文 ${id}。请先用 browse_examples(scope='chapter') 获取有效 id。`
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
