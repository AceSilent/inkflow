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
  const SCENE_TEMPLATES = [
    'reader_scene_lore.j2',
    'reader_scene_pacing.j2',
    'reader_scene_ai_tone.j2',
    'reader_scene_character.j2',
    'reader_scene_causality.j2',
  ]

  it('should have all 5 scene reviewer templates', () => {
    for (const t of SCENE_TEMPLATES) {
      const fp = path.join(PROMPTS_DIR, t)
      expect(fs.existsSync(fp), `Missing template: ${t}`).toBe(true)
    }
  })

  it('templates should contain draft placeholder', () => {
    for (const t of SCENE_TEMPLATES) {
      const fp = path.join(PROMPTS_DIR, t)
      const content = fs.readFileSync(fp, 'utf-8')
      expect(content, `Template ${t} missing draft placeholder`).toContain('{{ draft }}')
    }
  })

  it('templates should specify JSON output format', () => {
    for (const t of SCENE_TEMPLATES) {
      const fp = path.join(PROMPTS_DIR, t)
      const content = fs.readFileSync(fp, 'utf-8')
      expect(content).toContain('reader_role')
      expect(content).toContain('pass_status')
    }
  })
})

describe('Convergence tracking (persistReview)', () => {
  let tmpDir: string
  const bookId = 'test-book'
  const chapterId = 'ch01'

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-conv-'))
    fs.mkdirSync(path.join(tmpDir, bookId, '04_Drafts'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function runRound(issues: Array<{ reviewer: string; type: string; quote?: string; severity?: number }>): any {
    const result = {
      overall_pass: false,
      merged_summary: '',
      feedbacks: issues.map(i => ({
        reviewer: i.reviewer,
        pass_status: false,
        issues: [{ type: i.type, severity: i.severity ?? 3, quote: i.quote }],
        quick_comment: 'test',
      })),
    }
    // Dynamic import so the test picks up the current module state.
    // Using require isn't available in ESM tests; the export is loaded via describe-scope import below.
    return editorial.persistReview(tmpDir, bookId, chapterId, result as any)
  }

  // Eager import at the top of the `describe` — vitest supports top-level await in ESM.
  let editorial: typeof import('../src/editorial/editorial.js')
  beforeEach(async () => {
    editorial = await import('../src/editorial/editorial.js')
  })

  it('should start revision_round at 1 on first review', () => {
    const r = runRound([{ reviewer: 'lore', type: 'Timeline_Conflict', quote: 'xxx' }])
    expect(r.revision_round).toBe(1)
    expect(r.persistent_issues).toEqual([])
  })

  it('should increment revision_round across rounds', () => {
    runRound([{ reviewer: 'lore', type: 'X', quote: 'a' }])
    runRound([{ reviewer: 'lore', type: 'X', quote: 'a' }])
    const r3 = runRound([{ reviewer: 'lore', type: 'X', quote: 'a' }])
    expect(r3.revision_round).toBe(3)
  })

  it('should flag issue as persistent after STUCK_ROUND_THRESHOLD rounds', () => {
    const issue = { reviewer: 'lore', type: 'Timeline_Conflict', quote: '林辰修了四百年' }
    runRound([issue])
    runRound([issue])
    const r3 = runRound([issue])
    expect(r3.persistent_issues).toHaveLength(1)
    expect(r3.persistent_issues[0].count).toBe(3)
    expect(r3.persistent_issues[0].fingerprint).toContain('lore')
    expect(r3.persistent_issues[0].fingerprint).toContain('Timeline_Conflict')
  })

  it('should NOT flag an issue that disappeared and then came back (count resets)', () => {
    const issue = { reviewer: 'lore', type: 'X', quote: 'a' }
    runRound([issue])
    runRound([issue])
    runRound([]) // dropped — fingerprint falls out of history
    runRound([issue])
    const r = runRound([issue])
    // Issue has only been seen twice consecutively since the reset.
    expect(r.persistent_issues).toEqual([])
  })

  it('should track different issues independently', () => {
    const a = { reviewer: 'lore', type: 'A', quote: '1' }
    const b = { reviewer: 'pacing', type: 'B', quote: '2' }
    runRound([a, b])
    runRound([a, b])
    const r3 = runRound([a]) // b dropped this round
    // Only `a` should be persistent; `b` vanished and doesn't get credit.
    expect(r3.persistent_issues).toHaveLength(1)
    expect(r3.persistent_issues[0].fingerprint).toContain('lore')
  })

  it('issueFingerprint should match when first-60-char prefix agrees (ignores trailing drift)', () => {
    // Quote long enough that both inputs share an identical 60-char prefix;
    // differences after char 60 shouldn't perturb the fingerprint.
    const sharedPrefix = 'x'.repeat(80) // >60 chars of shared content before the divergence point
    expect(sharedPrefix.length).toBeGreaterThan(60)
    const a = editorial.issueFingerprint('lore', { type: 'X', quote: sharedPrefix + '后续细节 A' })
    const b = editorial.issueFingerprint('lore', { type: 'X', quote: sharedPrefix + '后续细节 B 略有不同' })
    expect(a).toBe(b)
  })

  it('issueFingerprint should differ when reviewer, type, or prefix differs', () => {
    const base = { type: 'X', quote: 'quote text' }
    expect(editorial.issueFingerprint('lore', base))
      .not.toBe(editorial.issueFingerprint('pacing', base))
    expect(editorial.issueFingerprint('lore', base))
      .not.toBe(editorial.issueFingerprint('lore', { ...base, type: 'Y' }))
    expect(editorial.issueFingerprint('lore', base))
      .not.toBe(editorial.issueFingerprint('lore', { ...base, quote: 'different' }))
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
