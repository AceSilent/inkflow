import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createAllTools } from '../../src/tools/index.js'

describe('save_script tool', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'save-script-'))
    fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves a story package JSON with generated line ids in game script mode', async () => {
    const registry = createAllTools()
    const script = {
      id: 'festival_quest',
      name: '灯会支线',
      author: 'InkFlow',
      motif: 'memory',
      tier: 'short',
      description: '玩家在灯会寻找失踪的信使。',
      stages: [
        {
          id: 'start',
          lines: [
            { speaker: '阿青', text: '你看见那个戴银面具的人了吗？', emotion: 'worried' },
            { text: '河灯顺流而下，水面映出一行被擦掉的字。', type: 'narration' },
          ],
        },
      ],
    }

    const result = await registry.execute('save_script', {
      package_id: 'festival_quest',
      script_json: JSON.stringify(script),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })

    expect(result).toContain('03_Scripts/festival_quest.json')
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'book1', '03_Scripts', 'festival_quest.json'), 'utf-8'))
    expect(saved.stages[0].lines[0].id).toBe('festival_quest.start.001')
  })

  it('rejects save_script outside game script mode', async () => {
    const registry = createAllTools()
    const result = await registry.execute('save_script', {
      package_id: 'novel_wrong_place',
      script_json: JSON.stringify({}),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'author' })

    expect(result).toContain('only available in game_script mode')
  })

  it('merges a single stage and blocks full-package overwrite', async () => {
    const registry = createAllTools()
    const script = {
      id: 'branch_test',
      name: '分支测试',
      author: 'InkFlow',
      motif: 'choice',
      tier: 'short',
      description: '测试逐 stage 写入。',
      stages: [
        { id: 'start', lines: [{ text: '起点' }], advance_next: 'choice' },
      ],
    }

    await registry.execute('save_script', {
      package_id: 'branch_test',
      script_json: JSON.stringify(script),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })

    const overwrite = await registry.execute('save_script', {
      package_id: 'branch_test',
      script_json: JSON.stringify(script),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })
    expect(overwrite).toContain('Full-package overwrite is blocked')

    const merge = await registry.execute('save_script', {
      package_id: 'branch_test',
      stage_id: 'choice',
      stage_json: JSON.stringify({ lines: [{ text: '选择留下。' }] }),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })

    expect(merge).toContain("Stage 'choice' merged")
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'book1', '03_Scripts', 'branch_test.json'), 'utf-8'))
    expect(saved.stages.map((stage: any) => stage.id)).toEqual(['start', 'choice'])
    expect(saved.stages[1].lines[0].id).toBe('branch_test.choice.001')
  })

  it('validates saved scripts and reports branch issues', async () => {
    const registry = createAllTools()
    const script = {
      id: 'broken_branch',
      name: '坏分支',
      author: 'InkFlow',
      motif: 'branch',
      tier: 'short',
      description: '测试校验。',
      stages: [
        {
          id: 'start',
          lines: [{ text: '起点' }],
          choices: [{ id: 'go', label: '前往不存在的地点', next_stage: 'missing' }],
        },
      ],
    }

    await registry.execute('save_script', {
      package_id: 'broken_branch',
      script_json: JSON.stringify(script),
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })

    const result = await registry.execute('validate_script', {
      package_id: 'broken_branch',
    }, { bookId: 'book1', dataDir: tmpDir, mode: 'game_script' })

    expect(result).toContain('BLOCKED')
    expect(result).toContain('Broken_Branch')
  })
})
