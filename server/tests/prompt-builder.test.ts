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
    expect(prompt).toContain('核心创作引擎')
    expect(prompt).toContain('load_skill')
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
    expect(prompt).toContain('阶段推进')
  })

  it('should front-load common AI-tone prohibitions before drafting', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('正文生成硬门槛')
    expect(prompt).toContain('密集镜头编排')
    expect(prompt).toContain('破折号')
    expect(prompt).toContain('强排比')
    expect(prompt).toContain('后置说明')
    expect(prompt).toContain('行动链')
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
