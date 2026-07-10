import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../src/routes/workbench.ts', import.meta.url), 'utf8')

describe('workbench route packaging safety', () => {
  it('does not use runtime dynamic import for the editorial resubmit route', () => {
    expect(source).not.toContain("await import('../editorial/editorial.js')")
    expect(source).toContain('runEditorialPipelineForChapter')
  })
})
