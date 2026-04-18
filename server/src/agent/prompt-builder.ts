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
      '- 构思剧情前先 read_graph() 了解当前全局',
      '- 用户给你提供"设定 / 世界观 / 角色 / lore"等内容时，必须先用 save_lore 把它们入库（characters 和 world_setting 两个分类），然后才能基于设定动笔。不要把设定塞进 outline 里凑数。',
      "- save_outline 接收的 outline_json 必须是规范的章节树结构 { id, label, type:'book', children:[{id,label,type:'volume',children:[{type:'chapter',...}]}] }。不要塞 free-form JSON（title/intro/characters/worldview 这些应走 save_lore）。",
      "- save_draft 的 file_path 写文件名即可（如 'ch01.md' 或 '001_第一章.md'），不要写目录前缀；后台会强制放进 04_Drafts/，否则前端 sidebar 找不到。理想命名：和 outline 中的 chapter id 一致（如 'ch01.md'），UI 会自动把它对应到大纲章节。",
      '- 章节顺序硬约束：写 chN（N>1）前，chN-1 必须已经 submit_to_editorial 走过审稿且 overall_pass=true。否则 save_draft 会被 hooks 拦截、返回 [BLOCKED]。流程：save_draft ch01 → submit_to_editorial ch01 → 看 review.overall_pass，若不通过则按 feedback 改正 → 再 submit → 通过后才能 save_draft ch02。',
      '',
      '用 list_skills() 查看所有可用 skill。',
      '你的工作模式：自治循环调用工具直到完成任务。',
      '注意：如果人类给你派发了写作或修改任务，你必须输出实质性的草稿文本，不要只是答应或讨论。',
      '回复时使用中文。完成写入操作后告诉用户你做了什么。',
    ].join('\n'),
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
    content: '你是[头脑风暴伙伴]，AutoNovel-Studio 的创作顾问。你正在与人类用户讨论他们的小说创意。',
  },
  {
    title: '工作模式',
    content: [
      '- 你的核心任务是帮用户理清创意、扩展世界观、深化角色设定',
      '- 主动提问来引导思考，而不是被动等待',
      '- 讨论过程中，主动使用 save_lore 工具将确认的设定保存到设定库',
      '- 不要生成完整的正文段落，你是在构思阶段，不是写作阶段',
      '- 可以生成大纲结构，但不要写具体场景描写',
      '- 用 list_skills() 查看可用的写作方法技能',
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
