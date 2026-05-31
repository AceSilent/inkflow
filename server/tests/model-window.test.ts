import { describe, it, expect } from 'vitest'
import { getModelContextWindow, BUDGET_TIERS, evaluateBudgetTier } from '../src/context/model-window.js'

describe('getModelContextWindow', () => {
  it('detects 1M from [1m] suffix', () => {
    expect(getModelContextWindow('claude-opus-4-7[1m]')).toBe(1_000_000)
  })
  it('detects GLM-5 as 1M', () => {
    expect(getModelContextWindow('glm-5.5-flash')).toBe(1_000_000)
  })
  it('detects Gemini 3.5 Flash as 1M', () => {
    expect(getModelContextWindow('gemini-3.5-flash')).toBe(1_000_000)
  })
  it('detects DeepSeek V3 as 200K', () => {
    expect(getModelContextWindow('deepseek-v3.2-chat')).toBe(200_000)
  })
  it('defaults to 200K for unknown', () => {
    expect(getModelContextWindow('unknown-model')).toBe(200_000)
  })
})

describe('evaluateBudgetTier', () => {
  it('returns green for 20% usage', () => {
    const t = evaluateBudgetTier(40000, 200000)
    expect(t.name).toBe('green')
    expect(t.action).toBe('none')
  })
  it('returns yellow for 45% usage', () => {
    const t = evaluateBudgetTier(90000, 200000)
    expect(t.name).toBe('yellow')
    expect(t.action).toBe('decay_tool_results')
  })
  it('returns orange for 70% usage', () => {
    const t = evaluateBudgetTier(140000, 200000)
    expect(t.name).toBe('orange')
    expect(t.action).toBe('decay_and_cold_compact')
  })
  it('returns red for 95% usage', () => {
    const t = evaluateBudgetTier(190000, 200000)
    expect(t.name).toBe('red')
    expect(t.action).toBe('force_compact_and_warn')
  })
  it('ratio is computed correctly', () => {
    const t = evaluateBudgetTier(50000, 200000)
    expect(t.ratio).toBeCloseTo(0.25, 2)
  })
})
