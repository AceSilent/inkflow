/**
 * Modular prompt assembly — Claude Code-inspired Section architecture.
 *
 * Each agent's system prompt is assembled from ordered PromptSections.
 * Static sections are cacheable. Dynamic sections are rebuilt per call.
 */
import { unresolvedSetups } from '../services/plot-graph.js'
import fs from 'fs'
import path from 'path'

const CORE_SKILL_FILES = [
  'skill_iceberg_writing.md',
  'skill_scene_rhythm.md',
  'skill_chapter_arc_design.md',
]

const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'),
  '../../../prompts',
)

function readPromptFile(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim()
}

function loadCoreSkills(): string {
  return CORE_SKILL_FILES.map(f => {
    const raw = fs.readFileSync(path.join(PROMPTS_DIR, f), 'utf8')
    return raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim()
  }).join('\n\n---\n\n')
}

export interface PromptContext {
  memory?: string
  bookTitle?: string
  plotLedger?: string
  styleProfile?: string
  creativeStage?: string
  [key: string]: unknown
}

export interface PromptSection {
  title: string
  content?: string
  contentFn?: (ctx: PromptContext) => string
  condition?: (ctx: PromptContext) => boolean
}

/**
 * Build a system prompt from ordered sections.
 * Static sections are always included; dynamic sections are conditional.
 */
export function buildSystemPrompt(sections: PromptSection[], ctx: PromptContext): string {
  const parts: string[] = []

  for (const section of sections) {
    if (section.condition && !section.condition(ctx)) continue

    const body = section.contentFn ? section.contentFn(ctx) : section.content ?? ''
    if (!body) continue

    parts.push(`# ${section.title}\n${body}`)
  }

  return parts.join('\n\n')
}

/**
 * The default Author Agent prompt sections.
 */
export const AUTHOR_SECTIONS: PromptSection[] = [
  {
    title: '身份',
    contentFn: () => readPromptFile('author_system.md'),
  },
  {
    title: '写作硬门槛',
    contentFn: () => readPromptFile('writing_guardrails.md'),
  },
  {
    title: '保存前自检',
    contentFn: () => readPromptFile('self_check_before_save.md'),
  },
  {
    title: '核心创作技法',
    contentFn: () => loadCoreSkills(),
  },
  {
    title: '创作阶段',
    contentFn: (ctx) => (ctx.creativeStage as string | undefined) ?? '',
    condition: (ctx) => !!ctx.creativeStage,
  },
  {
    title: '工具箱',
    contentFn: (ctx) => {
      const summary = ctx.toolSummary as string | undefined
      return summary ?? ''
    },
    condition: (ctx) => !!ctx.toolSummary,
  },
  {
    title: '剧情账本',
    contentFn: (ctx) => (ctx.plotLedger as string | undefined) ?? '',
    condition: (ctx) => !!ctx.plotLedger,
  },
  {
    title: '文风控制面',
    contentFn: (ctx) => (ctx.styleProfile as string | undefined) ?? '',
    condition: (ctx) => !!ctx.styleProfile,
  },
  {
    title: '记忆',
    contentFn: (ctx) => ctx.memory ?? '',
    condition: (ctx) => !!ctx.memory,
  },
]

/**
 * The Brainstorm Mode prompt sections — creative discussion partner.
 */
export const BRAINSTORM_SECTIONS: PromptSection[] = [
  {
    title: '身份',
    content: '你是[头脑风暴伙伴]，InkFlow 的创作顾问。你正在与人类用户讨论他们的游戏剧本创意。',
  },
  {
    title: '工作模式',
    content: [
      '- 你的核心任务是帮用户理清创意、扩展世界观、深化角色设定',
      '- 主动提问来引导思考，而不是被动等待',
      '- 讨论过程中，主动使用 save_lore 工具将确认的设定保存到设定库',
      '- 不要生成完整的正文段落，你是在构思阶段，不是写作阶段',
      '- 可以生成大纲结构，但不要写具体场景描写',
      '- 核心创作技法已内置。如需查看其他专项技法可用 list_skills()',
      '- 回复使用中文',
    ].join('\n'),
  },
  {
    title: '记忆',
    contentFn: (ctx) => ctx.memory ?? '',
    condition: (ctx) => !!ctx.memory,
  },
]

/**
 * Build the Brainstorm Mode system prompt.
 */
export function buildBrainstormPrompt(ctx: PromptContext): string {
  return buildSystemPrompt(BRAINSTORM_SECTIONS, ctx)
}

/**
 * Build the default Author Agent system prompt.
 */
export function buildAuthorPrompt(ctx: PromptContext): string {
  return buildSystemPrompt(AUTHOR_SECTIONS, ctx)
}

export function buildStyleProfileStatus(bookDir: string): string {
  const file = path.join(bookDir, '01_Global_Settings', 'style_profile.json')
  if (!fs.existsSync(file)) return ''
  try {
    const profile = JSON.parse(fs.readFileSync(file, 'utf8'))
    const metrics = profile.metrics ?? {}
    const rules = Array.isArray(profile.style_rules) ? profile.style_rules.slice(0, 5) : []
    const anti = Array.isArray(profile.anti_patterns) ? profile.anti_patterns.slice(0, 6) : []
    return [
      '【本项目文风指纹】',
      `平均句长：${metrics.avg_sentence_chars ?? '?'} 字；平均段落：${metrics.avg_paragraph_chars ?? '?'} 字；比喻密度：${metrics.metaphor_density_per_1000_chars ?? '?'} / 千字；破折号数量：${metrics.dash_count ?? 0}。`,
      '',
      '写作规则：',
      ...rules.map((r: string) => `- ${r}`),
      '',
      '文风禁区：',
      ...anti.map((r: string) => `- ${r}`),
      profile.opening_guidance ? `\n开篇：${profile.opening_guidance}` : '',
    ].filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

/**
 * Build the "剧情账本·未回收伏笔" status block from the book's plot_graph.json.
 *
 * Returns:
 *   - empty string when no graph exists or no unresolved setups remain
 *   - a multi-line ledger listing every unresolved setup node with its id,
 *     title, earliest-reference chapter, optional distance-to-current span,
 *     and optional description.
 *
 * `currentChapter` is optional — when omitted or non-parseable, the "距今 N 章"
 * span is dropped and the ledger still renders.
 */
export function buildPlotGraphStatus(bookDir: string, currentChapter?: string): string {
  const unresolved = unresolvedSetups(bookDir)
  if (unresolved.length === 0) return ''

  const curNum = currentChapter
    ? parseInt(currentChapter.replace(/^ch/i, ''), 10)
    : NaN

  const lines: string[] = [
    '【剧情账本·未回收伏笔】',
    `你已在之前章节埋下 ${unresolved.length} 个伏笔尚未回收。写新章时请考虑是否该收账：`,
    '',
  ]
  for (const s of unresolved) {
    const earliestCh = [...s.references].sort()[0]
    let spanTxt = ''
    if (earliestCh && !isNaN(curNum)) {
      const setupNum = parseInt(earliestCh.replace(/^ch/i, ''), 10)
      if (!isNaN(setupNum)) {
        const span = curNum - setupNum
        spanTxt = `，距今 ${span} 章`
      }
    }
    lines.push(`- [${s.id}] "${s.title}"（埋于 ${earliestCh ?? '?'}${spanTxt}）`)
    if (s.description) lines.push(`  描述：${s.description}`)
  }
  return lines.join('\n')
}
