import { describe, it, expect } from 'vitest'
import { getCreativeStage } from '../../src/agent/creative-stage'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

const TEST_DIR = '/tmp/test-creative-stage'

function setupProject(files: Record<string, string>) {
  rmSync(TEST_DIR, { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(TEST_DIR, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
}

describe('getCreativeStage', () => {
  it('returns world_bible when no characters', () => {
    setupProject({})
    expect(getCreativeStage(TEST_DIR)).toBe('world_bible')
  })

  it('returns story_outline when bible exists but no outline', () => {
    setupProject({
      '01_World_Settings/characters.json': '[{"name":"NPC"}]',
      '01_World_Settings/world_lore.json': '{"setting":"xianxia"}',
    })
    expect(getCreativeStage(TEST_DIR)).toBe('story_outline')
  })

  it('returns script_draft when outline exists but no scripts', () => {
    setupProject({
      '01_World_Settings/characters.json': '[{"name":"NPC"}]',
      '01_World_Settings/world_lore.json': '{"setting":"xianxia"}',
      '02_Outlines/outline.json': '{"type":"project","children":[{"type":"story_package","id":"pkg","children":[{"type":"stage","id":"s1"}]}]}',
    })
    expect(getCreativeStage(TEST_DIR)).toBe('script_draft')
  })

  it('returns export when script + review pass', () => {
    setupProject({
      '01_World_Settings/characters.json': '[{"name":"NPC"}]',
      '01_World_Settings/world_lore.json': '{"setting":"xianxia"}',
      '02_Outlines/outline.json': '{"type":"project","children":[{"type":"story_package","id":"pkg","children":[{"type":"stage","id":"s1"}]}]}',
      '03_Scripts/pkg.yaml': 'id: pkg\nstages:\n  - id: s1\n    lines:\n      - id: pkg.s1.001\n        text: hello',
      '04_Reviews/review_pkg.json': '{"pass_status":true}',
    })
    expect(getCreativeStage(TEST_DIR)).toBe('export')
  })
})
