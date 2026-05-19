import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import { StoryPackageSchema } from '../../src/schemas'
import { runScriptSelfCheck } from '../../src/tools/script-self-check'
import { exportYaml, exportCsv, exportHtml } from '../../src/tools/export'

const PKG_PATH = join(__dirname, '../../../projects/cultivation-world/03_Scripts/prologue_wanderer.yaml')

describe('Prologue E2E', () => {
  it('parses against StoryPackageSchema', () => {
    const raw = parseYaml(readFileSync(PKG_PATH, 'utf-8'))
    const pkg = StoryPackageSchema.parse(raw)
    expect(pkg.stages).toHaveLength(8)
    expect(pkg.id).toBe('prologue_wanderer')
  })

  it('passes all self-check rules', () => {
    const raw = parseYaml(readFileSync(PKG_PATH, 'utf-8'))
    const pkg = StoryPackageSchema.parse(raw)
    const result = runScriptSelfCheck(pkg)
    expect(result.passed).toBe(true)
  })

  it('all 3 branches reach convergence', () => {
    const raw = parseYaml(readFileSync(PKG_PATH, 'utf-8'))
    const pkg = StoryPackageSchema.parse(raw)
    const knocking = pkg.stages.find(s => s.id === 'knocking')!
    expect(knocking.choices).toHaveLength(3)
    for (const choice of knocking.choices) {
      const branch = pkg.stages.find(s => s.id === choice.next_stage)!
      expect(branch.advance_next).toBe('convergence')
    }
  })

  it('exports to all 4 formats without error', () => {
    const raw = parseYaml(readFileSync(PKG_PATH, 'utf-8'))
    const pkg = StoryPackageSchema.parse(raw)
    expect(() => exportYaml(pkg)).not.toThrow()
    expect(exportCsv(pkg).split('\n').length).toBeGreaterThan(10)
    expect(exportHtml(pkg)).toContain('凶宅长夜')
  })
})
