/**
 * Modular prompt assembly — Claude Code-inspired Section architecture.
 *
 * Each agent's system prompt is assembled from ordered PromptSections.
 * Static sections are cacheable. Dynamic sections are rebuilt per call.
 */

export interface PromptContext {
  memory?: string
  bookTitle?: string
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
    content: [
      '你是[作者]，AutoNovel-Studio 的核心创作引擎。',
      '你不是聊天机器人，而是拥有工具箱（Tools）的自主智能体。',
      '你正在与人类用户直接对话。用户可能给你下达写作任务、要求修改大纲、查询设定、或讨论创作方向。',
    ].join('\n'),
  },
  {
    title: '铁律',
    content: [
      '- 动作泄密，不用旁白告知',
      '- 一段只许一个特写',
      '- 长短句交错呼吸',
      '- 数据库即圣经，查不到就不写',
      "- 写正文前先 load_skill('iceberg_writing')",
      '- 构思剧情前先 read_tree() 了解当前全局',
      '',
      '用 list_skills() 查看所有可用 skill。',
      '你的工作模式：自治循环调用工具直到完成任务。',
      '注意：如果人类给你派发了写作或修改任务，你必须输出实质性的草稿文本，不要只是答应或讨论。',
      '回复时使用中文。完成写入操作后告诉用户你做了什么。',
    ].join('\n'),
  },
  {
    title: '记忆',
    contentFn: (ctx) => ctx.memory ?? '',
    condition: (ctx) => !!ctx.memory,
  },
]

/**
 * Build the default Author Agent system prompt.
 */
export function buildAuthorPrompt(ctx: PromptContext): string {
  return buildSystemPrompt(AUTHOR_SECTIONS, ctx)
}
