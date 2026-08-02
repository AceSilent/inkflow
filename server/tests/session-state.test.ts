import { describe, it, expect } from 'vitest'
import { buildPersistedSkillStateMessage, createSessionState, renderLoadedSkillsForPrompt, updateSessionStateAfterToolCall } from '../src/context/session-state.js'

describe('session-state', () => {
  it('empty state has no reads + no skill', () => {
    const s = createSessionState()
    expect(s.recentReads).toEqual([])
    expect(s.loadedSkills).toEqual([])
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

  it('load_skill activates the exact skill_name used by the tool', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'load_skill', { skill_name: 'iceberg_writing' }, 'skill body here')
    expect(s.loadedSkills[0]?.name).toBe('iceberg_writing')
    expect(s.loadedSkills[0]?.body).toBe('skill body here')
  })

  it('rebuilds active skills from the current branch and keeps the latest three', () => {
    const toolMessage = (skillName: string) => ({
      role: 'assistant',
      segments: [{
        type: 'tool_call',
        name: 'load_skill',
        status: 'done',
        argsPreview: JSON.stringify({ skill_name: skillName }),
      }],
    })
    const s = createSessionState([
      toolMessage('iceberg_writing'),
      toolMessage('scene_rhythm'),
      toolMessage('chapter_edit'),
      toolMessage('exemplar_study'),
    ])

    expect(s.loadedSkills.map(skill => skill.name)).toEqual([
      'exemplar_study',
      'chapter_edit',
      'scene_rhythm',
    ])
    const prompt = renderLoadedSkillsForPrompt(s)
    expect(prompt).toContain('不要再次调用 load_skill')
    expect(prompt).toContain('## exemplar_study')
    expect(prompt).not.toContain('## iceberg_writing')
  })

  it('keeps missing-skill advice inside the agent context', () => {
    const prompt = renderLoadedSkillsForPrompt(createSessionState())
    expect(prompt).toContain('尚未激活')
    expect(prompt).toContain('不要建议、要求或提醒用户')
  })

  it('preserves active skills across manual compaction metadata', () => {
    const before = createSessionState()
    updateSessionStateAfterToolCall(before, 'load_skill', { skill_name: 'chapter_edit' }, 'skill body')
    updateSessionStateAfterToolCall(before, 'load_skill', { skill_name: 'exemplar_study' }, 'study body')
    const marker = buildPersistedSkillStateMessage(before)

    const restored = createSessionState([
      { role: 'system', content: '压缩摘要' },
      marker!,
    ])
    expect(restored.loadedSkills.map(skill => skill.name)).toEqual([
      'exemplar_study',
      'chapter_edit',
    ])
  })

  it('ignores non-read non-skill tools', () => {
    const s = createSessionState()
    updateSessionStateAfterToolCall(s, 'save_draft', { file_path: 'ch01.md' }, 'saved')
    expect(s.recentReads).toEqual([])
    expect(s.loadedSkills).toEqual([])
  })
})
