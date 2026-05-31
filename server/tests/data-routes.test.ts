import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  readOutline,
  readLore,
  readGameOutline,
  listChapters,
  listScriptPackages,
  readScriptPackage,
  getChapterDetail,
  writeOutline,
  writeGameOutline,
  readReview,
  writeReview,
} from '../src/routes/data.js'

const TEST_DIR = path.join(process.cwd(), '__test_data__')

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

beforeEach(() => {
  cleanDir()
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  cleanDir()
})

describe('Data read endpoints', () => {
  it('readOutline returns default when no file', () => {
    const result = readOutline(TEST_DIR, 'nonexistent-book')
    expect(result).toEqual({
      id: 'nonexistent-book',
      label: '',
      type: 'book',
      children: [],
    })
  })

  it('readOutline returns parsed JSON when file exists', () => {
    const bookDir = path.join(TEST_DIR, 'my-book', '02_Outlines')
    fs.mkdirSync(bookDir, { recursive: true })
    const outline = {
      id: 'my-book',
      label: 'Test Novel',
      type: 'book',
      children: [
        { id: 'ch1', label: 'Chapter 1', type: 'chapter', status: 'outline', summary: 'Intro' },
      ],
    }
    fs.writeFileSync(
      path.join(bookDir, 'outline.json'),
      JSON.stringify(outline),
      'utf-8'
    )

    const result = readOutline(TEST_DIR, 'my-book')
    expect(result.id).toBe('my-book')
    expect(result.label).toBe('Test Novel')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].id).toBe('ch1')
  })

  it('readGameOutline returns default when no file exists', () => {
    const result = readGameOutline(TEST_DIR, 'game-book')
    expect(result).toEqual({
      id: 'game-book',
      label: '',
      type: 'game_project',
      children: [],
    })
  })

  it('writeGameOutline creates an isolated game outline file', () => {
    const outline = {
      id: 'game-book',
      label: '灵境奇谭',
      type: 'game_project',
      children: [
        {
          id: 'arc01',
          label: '第一幕',
          type: 'arc',
          children: [
            {
              id: 'pkg_intro',
              label: '入门剧情包',
              type: 'story_package',
              package_id: 'pkg_intro',
              children: [
                { id: 'st_start', label: '进入山门', type: 'stage', stage_id: 'start' },
              ],
            },
          ],
        },
      ],
    }

    writeGameOutline(TEST_DIR, 'game-book', outline)

    expect(fs.existsSync(path.join(TEST_DIR, 'game-book', '02_Outlines', 'game_outline.json'))).toBe(true)
    expect(fs.existsSync(path.join(TEST_DIR, 'game-book', '02_Outlines', 'outline.json'))).toBe(false)
    const result = readGameOutline(TEST_DIR, 'game-book')
    expect(result.children[0].type).toBe('arc')
    expect(result.children[0].children[0].type).toBe('story_package')
  })

  it('readLore returns structured data with meta and null for missing files', () => {
    const bookDir = path.join(TEST_DIR, 'lore-book')
    const configDir = path.join(bookDir, '00_Config')
    fs.mkdirSync(configDir, { recursive: true })

    const meta = { book_id: 'lore-book', title: 'Lore Test', genre: 'fantasy', tone: 'dark', target_words: 100000 }
    fs.writeFileSync(
      path.join(configDir, 'book_meta.json'),
      JSON.stringify(meta),
      'utf-8'
    )

    const result = readLore(TEST_DIR, 'lore-book')
    expect(result.meta).toEqual(meta)
    expect(result.world_setting).toBeNull()
    expect(result.characters).toBeNull()
    expect(result.outline).toBeNull()
  })

  it('listChapters returns empty when no outline', () => {
    const result = listChapters(TEST_DIR, 'no-outline-book')
    expect(result).toEqual([])
  })

  it('writeOutline creates file and readOutline reads it back', () => {
    const outline = {
      id: 'write-test',
      label: 'Written Novel',
      type: 'book',
      children: [
        { id: 'v1', label: 'Volume 1', type: 'volume', children: [] },
      ],
    }
    writeOutline(TEST_DIR, 'write-test', outline)

    // Verify file exists
    const filePath = path.join(TEST_DIR, 'write-test', '02_Outlines', 'outline.json')
    expect(fs.existsSync(filePath)).toBe(true)

    // Read back
    const result = readOutline(TEST_DIR, 'write-test')
    expect(result.label).toBe('Written Novel')
    expect(result.children).toHaveLength(1)
  })

  it('writeOutline overwrites existing outline', () => {
    const bookDir = path.join(TEST_DIR, 'overwrite-book', '02_Outlines')
    fs.mkdirSync(bookDir, { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, 'outline.json'),
      JSON.stringify({ id: 'old', label: 'Old Title', type: 'book', children: [] }),
      'utf-8'
    )

    writeOutline(TEST_DIR, 'overwrite-book', { id: 'new', label: 'New Title', type: 'book', children: [] })

    const result = readOutline(TEST_DIR, 'overwrite-book')
    expect(result.label).toBe('New Title')
  })

  it('listScriptPackages returns compact game package summaries', () => {
    const scriptsDir = path.join(TEST_DIR, 'script-book', '03_Scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    fs.writeFileSync(
      path.join(scriptsDir, 'pkg_intro.json'),
      JSON.stringify({
        id: 'pkg_intro',
        name: '入门剧情包',
        author: '测试作者',
        motif: '误入旧城',
        tier: 'short',
        description: '玩家进入第一张地图。',
        source_locale: 'zh-CN',
        stages: [
          {
            id: 'start',
            summary: '开场',
            review_state: 'review',
            lines: [
              { id: 'pkg_intro.start.0001', text: '风从旧城吹来。' },
              { id: 'pkg_intro.start.0002', speaker: '阿岚', text: '别回头。' },
            ],
            choices: [{ id: 'go', label: '继续', next_stage: 'end' }],
          },
          {
            id: 'end',
            summary: '收束',
            review_state: 'approved',
            lines: [{ id: 'pkg_intro.end.0001', text: '门在身后合上。' }],
            choices: [],
            is_terminal: true,
          },
        ],
      }),
      'utf-8'
    )

    const result = listScriptPackages(TEST_DIR, 'script-book')
    expect(result).toEqual([
      {
        package_id: 'pkg_intro',
        name: '入门剧情包',
        source_locale: 'zh-CN',
        stage_count: 2,
        line_count: 3,
        choice_count: 1,
        review_states: { approved: 1, draft: 0, review: 1 },
      },
    ])
  })

  it('readScriptPackage reads a package and blocks invalid package ids', () => {
    const scriptsDir = path.join(TEST_DIR, 'script-book', '03_Scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    fs.writeFileSync(
      path.join(scriptsDir, 'pkg_intro.json'),
      JSON.stringify({ id: 'pkg_intro', name: '入门剧情包', stages: [] }),
      'utf-8'
    )

    expect(readScriptPackage(TEST_DIR, 'script-book', 'pkg_intro')?.name).toBe('入门剧情包')
    expect(readScriptPackage(TEST_DIR, 'script-book', '../pkg_intro')).toBeNull()
    expect(readScriptPackage(TEST_DIR, 'script-book', 'missing')).toBeNull()
  })

  it('readReview returns null when no review exists', () => {
    const result = readReview(TEST_DIR, 'no-review-book', 'ch1')
    expect(result).toBeNull()
  })

  it('writeReview creates file and readReview reads it back', () => {
    const review = {
      overall_pass: false,
      feedbacks: [
        { reviewer: 'ai_tone', pass_status: false, issues: [{ type: 'Dash_Abuse', severity: 4 }], quick_comment: '破折号过多' },
      ],
    }
    writeReview(TEST_DIR, 'review-book', 'ch1', review)

    const filePath = path.join(TEST_DIR, 'review-book', '04_Drafts', 'review_ch1.json')
    expect(fs.existsSync(filePath)).toBe(true)

    const result = readReview(TEST_DIR, 'review-book', 'ch1')
    expect(result.overall_pass).toBe(false)
    expect(result.feedbacks).toHaveLength(1)
    expect(result.feedbacks[0].reviewer).toBe('ai_tone')
  })
})
