import { describe, it, expect } from 'vitest'
import { type PromptSection, buildSystemPrompt, buildAuthorPrompt, buildBrainstormPrompt } from '../src/agent/prompt-builder.js'

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
