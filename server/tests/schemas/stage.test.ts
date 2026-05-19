import { describe, it, expect } from 'vitest'
import { StageSchema, StoryPackageSchema } from '../../src/schemas'

describe('StageSchema', () => {
  it('accepts stage with lines and choices', () => {
    const parsed = StageSchema.parse({
      id: 'knocking',
      lines: [
        { id: 'p.knocking.001', text: '叩门声已经到了隔壁。' },
      ],
      choices: [
        { id: 'calm_wit', label: '嘘……别出声。', next_stage: 'branch_calm_wit' },
      ],
    })
    expect(parsed.choices).toHaveLength(1)
    expect(parsed.is_terminal).toBe(false)
  })

  it('accepts stage with advance_next', () => {
    const parsed = StageSchema.parse({
      id: 'arrival',
      lines: [{ id: 'p.arrival.001', text: '中元节。' }],
      advance_next: 'nightfall',
    })
    expect(parsed.is_terminal).toBe(false)
  })

  it('marks stage terminal when no choices and no advance_next', () => {
    const parsed = StageSchema.parse({
      id: 'convergence',
      lines: [{ id: 'p.conv.001', text: '天光微亮。' }],
    })
    expect(parsed.is_terminal).toBe(true)
  })

  it('rejects stage with empty lines', () => {
    expect(() => StageSchema.parse({ id: 'empty', lines: [] })).toThrow()
  })
})

describe('StoryPackageSchema', () => {
  it('accepts minimal valid package', () => {
    const parsed = StoryPackageSchema.parse({
      id: 'test_pkg',
      name: 'Test',
      author: 'manual',
      motif: 'rescue',
      tier: 'short',
      description: 'A test story',
      stages: [{
        id: 'only_stage',
        lines: [{ id: 'test_pkg.only_stage.001', text: 'Hello.' }],
      }],
    })
    expect(parsed.stages).toHaveLength(1)
  })
})
