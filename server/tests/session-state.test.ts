import { describe, it, expect } from 'vitest'
import { createSessionState, updateSessionStateAfterToolCall } from '../src/context/session-state.js'

describe('session-state', () => {
  it('empty state has no reads + no skill', () => {
    const s = createSessionState()
    expect(s.recentReads).toEqual([])
    expect(s.activeSkill).toBeNull()
  })

  it('read_file call appends to recentReads', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'read_file', { path: 'ch05.md' }, 'content here')
    expect(s.recentReads.length).toBe(1)
    expect(s.recentReads[0].tool).toBe('read_file')
    expect(s.recentReads[0].args.path).toBe('ch05.md')
  })

  it('recentReads cap at 5 (FIFO)', () => {
    const s = createSessionState()
    for (let i = 0; i < 7; i++) {
      updateSessionStateAfterToolCall(s, 'read_file', { path: `f${i}` }, `c${i}`)
    }
    expect(s.recentReads.length).toBe(5)
    expect(s.recentReads[0].args.path).toBe('f2')
    expect(s.recentReads[4].args.path).toBe('f6')
  })

  it('load_skill sets activeSkill', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'load_skill', { name: 'iceberg' }, 'skill body here')
    expect(s.activeSkill?.name).toBe('iceberg')
    expect(s.activeSkill?.body).toBe('skill body here')
  })

  it('ignores non-read non-skill tools', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'save_draft', { file_path: 'ch01.md' }, 'saved')
    expect(s.recentReads).toEqual([])
    expect(s.activeSkill).toBeNull()
  })
})
