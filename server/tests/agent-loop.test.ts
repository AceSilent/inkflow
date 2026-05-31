import { describe, it, expect } from 'vitest'
import { buildAuthorPrompt, buildBrainstormPrompt } from '../src/agent/prompt-builder.js'
import { createAllTools } from '../src/tools/index.js'

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

  it('should include tool summary when provided', () => {
    const registry = createAllTools()
    const summary = registry.getToolSummary()
    const prompt = buildAuthorPrompt({ toolSummary: summary })
    expect(prompt).toContain('# 工具箱')
    expect(prompt).toContain('读取')
  })

  it('should not include tool summary section when not provided', () => {
    const prompt = buildAuthorPrompt({})
    expect(prompt).not.toContain('# 工具箱')
  })

  it('should build brainstorm prompt correctly', () => {
    const prompt = buildBrainstormPrompt({})
    expect(prompt).toContain('头脑风暴伙伴')
    expect(prompt).not.toContain('# 记忆')
  })

  it('should build brainstorm prompt with memory', () => {
    const prompt = buildBrainstormPrompt({ memory: 'brainstorm notes' })
    expect(prompt).toContain('# 记忆')
    expect(prompt).toContain('brainstorm notes')
  })
})

describe('Tool Registry Summary', () => {
  it('should generate categorized tool summary', () => {
    const registry = createAllTools()
    const summary = registry.getToolSummary()
    expect(summary).toContain('读取:')
    expect(summary).toContain('read_file')
    expect(summary).toContain('写入:')
    expect(summary).toContain('save_draft')
    expect(summary).toContain('剧情图:')
    expect(summary).toContain('read_graph')
    expect(summary).toContain('编辑部:')
    expect(summary).toContain('submit_to_editorial')
  })

  it('should list all 23 tools in summary', () => {
    const registry = createAllTools()
    const names = registry.listNames()
    expect(names).toHaveLength(23)
    expect(names).toContain('create_book')
    expect(names).toContain('browse_examples')
    expect(names).toContain('analyze_style_profile')
  })
})
