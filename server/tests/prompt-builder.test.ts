import { describe, it, expect } from 'vitest'
import { type PromptSection, buildSystemPrompt, buildAuthorPrompt, buildBrainstormPrompt, buildGameScriptPrompt } from '../src/agent/prompt-builder.js'

describe('buildSystemPrompt', () => {
  it('should concatenate sections', () => {
    const sections: PromptSection[] = [
      { title: '身份', content: '你是作者。' },
      { title: '规则', content: '写好文章。' },
    ]
    const result = buildSystemPrompt(sections, {})
    expect(result).toContain('# 身份')
    expect(result).toContain('# 规则')
    expect(result).toContain('你是作者。')
  })

  it('should skip sections where condition is false', () => {
    const sections: PromptSection[] = [
      { title: 'Always', content: 'always here' },
      { title: 'Memory', content: 'memory data', condition: (ctx) => !!ctx.memory },
    ]
    expect(buildSystemPrompt(sections, {})).not.toContain('memory data')
    expect(buildSystemPrompt(sections, { memory: 'facts' })).toContain('memory data')
  })

  it('should use contentFn for dynamic content', () => {
    const sections: PromptSection[] = [
      { title: 'Memory', contentFn: (ctx) => `[MEMORY] ${ctx.memory ?? 'none'}` },
    ]
    expect(buildSystemPrompt(sections, { memory: 'test' })).toContain('[MEMORY] test')
  })

  it('should preserve section order', () => {
    const sections: PromptSection[] = [
      { title: 'A', content: 'aaa' },
      { title: 'B', content: 'bbb' },
      { title: 'C', content: 'ccc' },
    ]
    const result = buildSystemPrompt(sections, {})
    expect(result.indexOf('aaa')).toBeLessThan(result.indexOf('bbb'))
    expect(result.indexOf('bbb')).toBeLessThan(result.indexOf('ccc'))
  })
})

describe('buildAuthorPrompt', () => {
  it('should include core identity', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('共同作者')
    expect(prompt).toContain('load_skill')
  })

  it('states that bound author chats must not create another book', () => {
    const prompt = buildAuthorPrompt({})

    expect(prompt).toContain('不要调用 create_book')
    expect(prompt).toContain('已绑定作品')
  })

  it('includes a CLAUDE.md-like runtime contract for project lifecycle decisions', () => {
    const prompt = buildAuthorPrompt({ creativeStage: '当前阶段：设定库' })

    expect(prompt).toContain('# 运行规约')
    expect(prompt).toContain('像 CLAUDE.md 一样约束每一轮')
    expect(prompt).toContain('已绑定作品只能继续当前书')
    expect(prompt).toContain('先判断用户这一轮是在讨论、查询、批评、修订、写作还是落盘')
    expect(prompt).toContain('不要用夸赞替代回应')
    expect(prompt).toContain('不要急着把话题推到写正文')
  })

  it('should include memory when provided', () => {
    const prompt = buildAuthorPrompt({ memory: '[核心记忆] 测试原则' })
    expect(prompt).toContain('# 记忆')
    expect(prompt).toContain('核心记忆')
  })

  it('should exclude memory when empty', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).not.toContain('# 记忆')
  })

  it('should hint that independent read tools can be batched in one turn', () => {
    // The provider now advertises parallel tool_use blocks — the Author
    // prompt must tell the LLM this is preferred to serial read-round-trips.
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('并发')
    expect(prompt).toMatch(/read_file|read_graph/)
  })

  it('should include creative stage when provided', () => {
    const prompt = buildAuthorPrompt({ creativeStage: '当前阶段：剧情图' })
    expect(prompt).toContain('# 创作阶段')
    expect(prompt).toContain('当前阶段：剧情图')
  })

  it('keeps transient workbench state out of static prompt sections', () => {
    const prompt = buildAuthorPrompt({ recentObservations: '来自当前热区历史：刚读过 04_Drafts/ch01.md' })
    expect(prompt).not.toContain('# 最近工具观察')
    expect(prompt).not.toContain('来自当前热区历史')
  })

  it('keeps writing preferences soft in the default prompt', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('# 写作偏好')
    expect(prompt).toContain('默认偏好')
    expect(prompt).toContain('密集镜头编排')
    expect(prompt).toContain('破折号')
    expect(prompt).toContain('强排比')
    expect(prompt).toContain('后置说明')
    expect(prompt).toContain('行动链')
    expect(prompt).not.toContain('正文生成硬门槛')
    expect(prompt).not.toContain('# 保存前自检')
  })

  it('includes scene-first opening craft in the default prompt', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('行文心法')
    expect(prompt).toContain('边进事边渗设定')
    expect(prompt).toContain('先介绍后进事')
    expect(prompt).toContain('第一句')
    expect(prompt).toContain('具体的人、动作、场景')
    expect(prompt).toContain('悬念前置，解释后置')
    expect(prompt).toContain('章节名')
    expect(prompt).toContain('钩子')
  })

  it('reminds the author to study exemplar chapters only when needed', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('read_exemplar_chapter')
    expect(prompt).toContain("browse_examples(scope='curated'")
    expect(prompt).toContain('章节级范文')
    expect(prompt).toContain('已经在上下文')
    expect(prompt).toContain('不要重复读取')
  })

  it('keeps scene-first craft away from metaphor-heavy AI style', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('可见事实')
    expect(prompt).toContain('不要把抽象判断翻译成比喻句')
    expect(prompt).toContain('少用“像”')
    expect(prompt).not.toContain('具体物象')
    expect(prompt).not.toContain('更有力')
  })

  it('includes save self-check only when explicitly requested by the caller', () => {
    const prompt = buildAuthorPrompt({ includeSaveSelfCheck: true })
    expect(prompt).toContain('# 保存前自检')
    expect(prompt).toContain('保存草稿前自检')
  })
})

describe('Brainstorm Prompt', () => {
  it('should build brainstorm prompt with correct sections', () => {
    const prompt = buildBrainstormPrompt({})
    expect(prompt).toContain('头脑风暴伙伴')
    expect(prompt).toContain('save_lore')
    expect(prompt).not.toContain('铁律')
  })

  it('should include memory section when provided', () => {
    const prompt = buildBrainstormPrompt({ memory: '之前的设定内容' })
    expect(prompt).toContain('之前的设定内容')
  })
})

describe('Game Script Prompt', () => {
  it('should build a game copywriting prompt without replacing the novel author prompt', () => {
    const prompt = buildGameScriptPrompt({ memory: '用户喜欢克制的对白' })
    expect(prompt).toContain('游戏文案')
    expect(prompt).toContain('互动对白')
    expect(prompt).toContain('任务文本')
    expect(prompt).toContain('用户喜欢克制的对白')
    expect(prompt).toContain('save_lore')
    expect(prompt).toContain('save_script')
    expect(prompt).toContain('validate_script')
  })
})
