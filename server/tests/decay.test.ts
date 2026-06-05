import { describe, it, expect } from 'vitest'
import { decayToolResults, LARGE_RESULT_TOOLS, PRESERVE_ALWAYS } from '../src/context/decay.js'
import type { ModelMessage } from 'ai'

function toolResultMsg(toolName: string, content: string, args?: Record<string, unknown>): ModelMessage {
  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: `call_${toolName}`,
      toolName,
      output: { type: 'text', value: content },
      ...(args ? { args } : {}),
    }] as any,
  }
}

describe('decayToolResults', () => {
  it('replaces long read_file result in warm zone', () => {
    const original = toolResultMsg('read_file', 'X'.repeat(12000))
    const zones = {
      hot: [],
      warm: [original],
      cold: [],
    }
    const messages = [original]
    const result = decayToolResults(messages, zones)
    const warmMsg = result[0]
    const content = JSON.stringify(warmMsg.content)
    expect(content).toContain('[read_file')
    expect(content).not.toContain('X'.repeat(100))
  })

  it('does NOT decay short read_file (below minChars)', () => {
    const original = toolResultMsg('read_file', 'short content')
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('short content')
  })

  it('does NOT decay read_file of ~5000 chars (typical chapter read)', () => {
    const original = toolResultMsg('read_file', 'ch05 content'.padEnd(5000, '.'))
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('ch05 content')
  })

  it('does NOT decay messages in Hot zone', () => {
    const original = toolResultMsg('read_file', 'X'.repeat(12000))
    const zones = { hot: [original], warm: [], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('X'.repeat(100))
  })

  it('preserves submit_to_editorial result always', () => {
    const original = toolResultMsg('submit_to_editorial', 'long review'.padEnd(20000, '.'))
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('long review')
  })

  it('preserves short save_draft result', () => {
    const original = toolResultMsg('save_draft', 'Draft saved to 04_Drafts/ch01.md (3200 chars)')
    const zones = { hot: [], warm: [original], cold: [] }
    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)
    expect(content).toContain('Draft saved')
  })

  it('does not re-decay already decayed message', () => {
    const decayed = toolResultMsg('read_file', '[read_file: 12000 chars, re-fetch via read_file() if needed]')
    const zones = { hot: [], warm: [decayed], cold: [] }
    const result = decayToolResults([decayed], zones)
    expect(result[0]).toBe(decayed)  // unchanged
  })

  it('uses read_file relative_path in decay placeholder', () => {
    const original = toolResultMsg(
      'read_file',
      'X'.repeat(12000),
      { relative_path: '04_Drafts/ch01.md' },
    )
    const zones = { hot: [], warm: [original], cold: [] }

    const result = decayToolResults([original], zones)
    const content = JSON.stringify(result[0].content)

    expect(content).toContain("read_file('04_Drafts/ch01.md')")
    expect(content).not.toContain("read_file('?')")
  })
})
