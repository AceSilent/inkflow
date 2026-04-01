import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt } from '../src/agent/prompt-builder.js'

describe('Agent Loop Integration', () => {
  it('should build a valid system prompt', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).toContain('核心创作引擎')
    expect(prompt).toContain('load_skill')
    expect(prompt).not.toContain('# 记忆')
  })

  it('should include memory when provided', () => {
    const prompt = buildAuthorPrompt({ memory: '[核心记忆] 测试原则' })
    expect(prompt).toContain('# 记忆')
    expect(prompt).toContain('核心记忆')
  })
})
