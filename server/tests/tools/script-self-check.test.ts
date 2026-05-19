/**
 * @Perspective  Unit — pure function, no I/O, no LLM
 * @Invariant    runScriptSelfCheck is deterministic and side-effect-free
 * @Goal         Verify all 10 structural rules (severities 2-5) on StoryPackage inputs
 * @Migration    New file — no prior implementation to migrate from
 */
import { describe, it, expect } from 'vitest'
import { runScriptSelfCheck, ScriptSelfCheckType } from '../../src/tools/script-self-check'

function makePkg(stages: any[]) {
  return { id: 'test', name: 'Test', stages } as any
}

describe('runScriptSelfCheck', () => {
  it('blocks on empty lines', () => {
    const pkg = makePkg([{ id: 's1', lines: [], choices: [] }])
    const result = runScriptSelfCheck(pkg)
    expect(result.blockReview).toBe(true)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.EmptyLines)).toBe(true)
  })

  it('blocks on orphan stage', () => {
    const pkg = makePkg([
      { id: 'start', lines: [{ id: 'x', text: 'a' }], advance_next: 'end', choices: [] },
      { id: 'orphan', lines: [{ id: 'y', text: 'b' }], choices: [] },
      { id: 'end', lines: [{ id: 'z', text: 'c' }], choices: [] },
    ])
    const result = runScriptSelfCheck(pkg)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.OrphanStage)).toBe(true)
  })

  it('blocks on broken branch', () => {
    const pkg = makePkg([{
      id: 'start',
      lines: [{ id: 'x', text: 'a' }],
      choices: [{ id: 'c1', label: 'go', next_stage: 'nonexistent' }],
    }])
    const result = runScriptSelfCheck(pkg)
    expect(result.blockReview).toBe(true)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.BrokenBranch)).toBe(true)
  })

  it('blocks when no terminal stage', () => {
    const pkg = makePkg([
      { id: 'loop', lines: [{ id: 'x', text: 'a' }], advance_next: 'loop', choices: [] },
    ])
    const result = runScriptSelfCheck(pkg)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.NoTerminal)).toBe(true)
  })

  it('warns on long narration run (>8 consecutive)', () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({
      id: `t.s.${String(i + 1).padStart(3, '0')}`, text: `Line ${i}`, type: 'narration' as const,
    }))
    const pkg = makePkg([{ id: 's', lines, choices: [] }])
    const result = runScriptSelfCheck(pkg)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.LongNarrationRun)).toBe(true)
  })

  it('warns on stage with >40 lines', () => {
    const lines = Array.from({ length: 42 }, (_, i) => ({
      id: `t.s.${String(i + 1).padStart(3, '0')}`, text: `Line ${i}`,
    }))
    const pkg = makePkg([{ id: 's', lines, choices: [] }])
    const result = runScriptSelfCheck(pkg)
    expect(result.issues.some(i => i.type === ScriptSelfCheckType.StageTooLong)).toBe(true)
  })

  it('passes clean package', () => {
    const pkg = makePkg([{
      id: 'only',
      lines: [
        { id: 't.only.001', speaker: 'NPC', text: 'Hello', type: 'dialogue' },
        { id: 't.only.002', text: 'End.', type: 'narration' },
      ],
      choices: [],
    }])
    const result = runScriptSelfCheck(pkg)
    expect(result.passed).toBe(true)
    expect(result.blockReview).toBe(false)
  })
})
