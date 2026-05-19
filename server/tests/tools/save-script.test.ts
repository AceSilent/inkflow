/**
 * @Perspective  Integration — file I/O with real temp directories, no LLM
 * @Invariant    saveScriptTool writes valid YAML, auto-generates line IDs, and rejects bad JSON/schema
 * @Goal         Verify save_script end-to-end: line ID generation, YAML output, path traversal guard
 * @Migration    New file — replaces saveDraftTool with saveScriptTool
 */
import { describe, it, expect } from 'vitest'
import { saveScriptTool } from '../../src/tools/write-tools'
import { mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'

const TEST_DIR = '/tmp/test-save-script'
const BOOK_ID = 'proj'

function bookDir(): string {
  return join(TEST_DIR, BOOK_ID)
}

function ctx(): any {
  return { bookId: BOOK_ID, dataDir: TEST_DIR }
}

describe('saveScriptTool', () => {
  it('saves valid YAML and auto-generates line IDs', async () => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(bookDir(), '03_Scripts'), { recursive: true })

    const script = {
      id: 'test_story',
      name: 'Test',
      author: 'manual',
      motif: 'rescue',
      tier: 'short',
      description: 'test',
      stages: [{
        id: 'start',
        lines: [{ text: 'Hello world' }],
      }],
    }

    const result = await saveScriptTool.execute(
      { package_id: 'test_story', script_json: JSON.stringify(script) },
      ctx(),
    )

    const saved = parseYaml(readFileSync(join(bookDir(), '03_Scripts', 'test_story.yaml'), 'utf-8'))
    expect(saved.stages[0].lines[0].id).toBe('test_story.start.001')
    expect(result).toContain('test_story.yaml')
  })

  it('returns error on invalid JSON', async () => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(bookDir(), '03_Scripts'), { recursive: true })

    const result = await saveScriptTool.execute(
      { package_id: 'bad', script_json: 'not valid json {{{' },
      ctx(),
    )
    expect(result).toContain('Error: Invalid JSON')
  })

  it('returns schema error on structurally invalid package', async () => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(bookDir(), '03_Scripts'), { recursive: true })

    const badScript = { id: 'x', name: 'X', stages: [] }  // missing required fields + empty stages
    const result = await saveScriptTool.execute(
      { package_id: 'x', script_json: JSON.stringify(badScript) },
      ctx(),
    )
    expect(result).toContain('Error: Schema validation failed')
  })

  it('includes self-check warnings in response for a script with issues', async () => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(join(bookDir(), '03_Scripts'), { recursive: true })

    // A script with an orphan stage — blockReview issue
    const script = {
      id: 'orphan_test',
      name: 'Orphan Test',
      author: 'manual',
      motif: 'mystery',
      tier: 'short',
      description: 'test',
      stages: [
        { id: 'start', lines: [{ text: 'Begin' }] },
        { id: 'orphan', lines: [{ text: 'Never reached' }] },
      ],
    }

    const result = await saveScriptTool.execute(
      { package_id: 'orphan_test', script_json: JSON.stringify(script) },
      ctx(),
    )

    // Should still save but include warning/blocked info
    expect(result).toContain('orphan_test.yaml')
    expect(result.toLowerCase()).toMatch(/blocked|warning/i)
  })
})
