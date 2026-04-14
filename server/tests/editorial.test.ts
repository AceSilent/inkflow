import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAllTools } from '../src/tools/index.js'
import fs from 'fs'
import os from 'os'
import path from 'path'

const PROMPTS_DIR = path.resolve(__dirname, '../../prompts')

describe('Editorial Tool Registration', () => {
  it('should register submit_to_editorial tool', () => {
    const registry = createAllTools()
    const tool = registry.get('submit_to_editorial')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('submit_to_editorial')
    expect(tool!.permissionLevel).toBe('read')
  })

  it('should have 16 total tools registered', () => {
    const registry = createAllTools()
    const names = registry.listNames()
    expect(names.length).toBe(17)
    expect(names).toContain('submit_to_editorial')
    expect(names).toContain('load_skill')
    expect(names).toContain('list_skills')
  })
})

describe('Editorial Templates', () => {
  it('should have all 3 scene reviewer templates', () => {
    const templates = [
      'reader_scene_lore.j2',
      'reader_scene_pacing.j2',
      'reader_scene_ai_tone.j2',
    ]
    for (const t of templates) {
      const fp = path.join(PROMPTS_DIR, t)
      expect(fs.existsSync(fp), `Missing template: ${t}`).toBe(true)
    }
  })

  it('templates should contain draft placeholder', () => {
    const templates = [
      'reader_scene_lore.j2',
      'reader_scene_pacing.j2',
      'reader_scene_ai_tone.j2',
    ]
    for (const t of templates) {
      const fp = path.join(PROMPTS_DIR, t)
      const content = fs.readFileSync(fp, 'utf-8')
      expect(content, `Template ${t} missing draft placeholder`).toContain('{{ draft }}')
    }
  })

  it('templates should specify JSON output format', () => {
    const templates = [
      'reader_scene_ai_tone.j2',
    ]
    for (const t of templates) {
      const fp = path.join(PROMPTS_DIR, t)
      const content = fs.readFileSync(fp, 'utf-8')
      expect(content).toContain('reader_role')
      expect(content).toContain('pass_status')
    }
  })
})

describe('submit_to_editorial hard gates', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-guard-'))
    fs.mkdirSync(path.join(tmpDir, 'test-book', '04_Drafts'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should reject draft_text shorter than MIN_DRAFT_CHARS', async () => {
    const registry = createAllTools()
    const result = await registry.execute('submit_to_editorial', {
      draft_text: '就这几十个字想蒙混过关。',
      chapter_id: 'ch01',
    }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('最低要求')
  })

  it('should reject when 04_Drafts/{chapterId}.md does not exist', async () => {
    const registry = createAllTools()
    // Long enough to pass length guard, but file is missing.
    const longDraft = '正文'.repeat(500)
    const result = await registry.execute('submit_to_editorial', {
      draft_text: longDraft,
      chapter_id: 'ch07',
    }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('04_Drafts/ch07.md')
    expect(result).toContain('save_draft')
  })
})

describe('Template Rendering', () => {
  it('should substitute variables in templates', () => {
    const template = path.join(PROMPTS_DIR, 'reader_scene_ai_tone.j2')
    let content = fs.readFileSync(template, 'utf-8')
    const vars = {
      draft: '他猛然抬头，不禁心中一凛。',
      book_tone: '热血玄幻',
      book_genre: '玄幻',
    }
    for (const [key, value] of Object.entries(vars)) {
      content = content.replaceAll(`{{ ${key} }}`, value)
      content = content.replaceAll(`{{${key}}}`, value)
    }
    expect(content).toContain('他猛然抬头')
    expect(content).toContain('热血玄幻')
    expect(content).not.toContain('{{ draft }}')
  })
})
