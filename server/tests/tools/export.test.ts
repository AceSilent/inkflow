import { describe, it, expect } from 'vitest'
import { exportYaml, exportJson, exportCsv, exportHtml } from '../../src/tools/export'

const SAMPLE_PKG = {
  id: 'test',
  name: 'Test Story',
  stages: [{
    id: 'start',
    lines: [
      { id: 'test.start.001', text: 'Hello', type: 'narration' },
      { id: 'test.start.002', speaker: 'NPC', text: 'Hi there', type: 'dialogue', emotion: 'happy' },
    ],
    choices: [],
    is_terminal: true,
  }],
}

describe('exportYaml', () => {
  it('produces valid YAML string', () => {
    const yaml = exportYaml(SAMPLE_PKG as any)
    expect(yaml).toContain('id: test')
    expect(yaml).toContain('test.start.001')
  })
})

describe('exportJson', () => {
  it('produces valid JSON', () => {
    const json = exportJson(SAMPLE_PKG as any)
    const parsed = JSON.parse(json)
    expect(parsed.id).toBe('test')
    expect(parsed.stages[0].lines).toHaveLength(2)
  })
})

describe('exportCsv', () => {
  it('produces CSV with text_id, speaker, text, emotion columns', () => {
    const csv = exportCsv(SAMPLE_PKG as any)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('text_id')
    expect(lines[0]).toContain('speaker')
    expect(lines[1]).toContain('test.start.001')
    expect(lines[2]).toContain('NPC')
  })
})

describe('exportHtml', () => {
  it('produces self-contained HTML with stage navigation', () => {
    const html = exportHtml(SAMPLE_PKG as any)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Test Story')
    expect(html).toContain('Hello')
    expect(html).toContain('function showStage')
    expect(html).toContain('id="stage-start"')
  })
})
