import { describe, it, expect } from 'vitest'
import { isPromptTooLongError, truncateHead20Percent } from '../src/context/ptl-fallback.js'

describe('isPromptTooLongError', () => {
  it('detects common "prompt too long" error messages', () => {
    expect(isPromptTooLongError(new Error('prompt is too long'))).toBe(true)
    expect(isPromptTooLongError(new Error('context_length_exceeded'))).toBe(true)
    expect(isPromptTooLongError(new Error('random other error'))).toBe(false)
  })
})

describe('truncateHead20Percent', () => {
  it('strips 20% from the start', () => {
    const input = 'A'.repeat(100)
    const out = truncateHead20Percent(input)
    expect(out.length).toBeLessThan(input.length)
    expect(out.length).toBeGreaterThanOrEqual(80)
    expect(out.length).toBeLessThanOrEqual(82)
  })
})

// generateWithPtlRetry test lives in a higher-level integration test because
// it depends on Vercel AI SDK's generateText. Skip here — unit tested via the
// helpers above + covered by cold-compact integration test.
