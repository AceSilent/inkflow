import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCreativeStagePrompt, getCreativeStageStatus } from '../src/agent/creative-stage.js'

let tmpDir: string

function writeJson(rel: string, value: unknown): void {
  const file = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function writeText(rel: string, value: string): void {
  const file = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, value)
}

function seedLore(): void {
  writeJson('01_Global_Settings/characters.json', [{ id: 'protagonist', name: '张墨' }])
  writeJson('01_Global_Settings/world_lore.json', [{ id: 'world', content: '异世界森林' }])
}

function seedOutline(): void {
  writeJson('02_Outlines/outline.json', {
    id: 'book',
    type: 'book',
    children: [{
      id: 'vol1',
      type: 'volume',
      children: [
        { id: 'ch01', type: 'chapter' },
        { id: 'ch02', type: 'chapter' },
      ],
    }],
  })
}

function approveChapter(chId: string): void {
  writeJson(`04_Drafts/chapter_status_${chId}.json`, {
    chapter_id: chId,
    user_decision: 'approved',
    human_gate: { pre_review_decision: 'approved' },
  })
}

describe('creative stage status', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-stage-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts at story bible when lore is missing', () => {
    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('story_bible')
    expect(status.blockers).toContain('角色设定库未保存')
    expect(status.blockers).toContain('世界观 lore 未保存')
  })

  it('moves to outline after lore exists', () => {
    seedLore()
    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('outline')
    expect(status.blockers).toContain('10 章大纲未保存')
  })

  it('requires enough plot graph structure before drafting', () => {
    seedLore()
    seedOutline()
    writeJson('plot_graph.json', { nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] })
    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('plot_graph')
    expect(status.blockers).toContain('剧情图还不够支撑正文')
  })

  it('allows chapter drafting after lore, outline, and plot graph exist', () => {
    seedLore()
    seedOutline()
    writeJson('plot_graph.json', {
      nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })
    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('chapter_draft')
    expect(status.blockers).toEqual([])
  })

  it('moves through review and revision after the first draft', () => {
    seedLore()
    seedOutline()
    writeJson('plot_graph.json', {
      nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })
    writeText('04_Drafts/ch01.md', '正文')
    expect(getCreativeStageStatus(tmpDir).stage).toBe('human_review')

    writeJson('04_Drafts/review_ch01.json', { overall_pass: false })
    expect(getCreativeStageStatus(tmpDir).stage).toBe('revision')
  })

  it('advances to the next outline chapter after the current chapter passes', () => {
    seedLore()
    seedOutline()
    writeJson('plot_graph.json', {
      nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })
    writeText('04_Drafts/ch01.md', '正文')
    writeJson('04_Drafts/review_ch01.json', { overall_pass: true })
    approveChapter('ch01')

    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('chapter_draft')
    expect(status.metrics.currentChapterId).toBe('ch02')
    expect(status.nextAction).toContain('ch02')
  })

  it('loops review and revision for the latest incomplete chapter', () => {
    seedLore()
    seedOutline()
    writeJson('plot_graph.json', {
      nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    })
    writeText('04_Drafts/ch01.md', '正文')
    writeJson('04_Drafts/review_ch01.json', { overall_pass: true })
    approveChapter('ch01')
    writeText('04_Drafts/ch02.md', '正文')
    expect(getCreativeStageStatus(tmpDir).stage).toBe('human_review')
    expect(getCreativeStageStatus(tmpDir).metrics.currentChapterId).toBe('ch02')

    writeJson('04_Drafts/review_ch02.json', { overall_pass: false })
    const status = getCreativeStageStatus(tmpDir)
    expect(status.stage).toBe('revision')
    expect(status.metrics.currentChapterId).toBe('ch02')
    expect(status.nextAction).toContain('ch02')
  })

  it('builds a prompt block with current status', () => {
    const prompt = buildCreativeStagePrompt(tmpDir)
    expect(prompt).toContain('当前阶段：设定库')
    expect(prompt).toContain('阶段门控')
    expect(prompt).toContain('稳定信息先落盘')
    expect(prompt).toContain('不要急着进入正文')
  })
})
