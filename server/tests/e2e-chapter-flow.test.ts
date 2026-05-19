/**
 * End-to-end chapter flow test.
 *
 * Walks save_lore → save_outline → save_draft → submit_to_editorial via the
 * actual ToolRegistry execute() path, with the only mock being the LLM (we
 * stub the `ai` SDK's generateText to return canned reviewer JSON).
 *
 * Catches the kind of plumbing bug single-file unit tests miss: e.g. the
 * editorial-context-not-injected regression we fixed in P0-1 — that bug had
 * passing unit tests in every individual file but the real flow was broken.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Capture every prompt passed into generateText so we can assert that the
// editorial pipeline actually injected lore + outline context into the
// reviewer prompts (the central P0-1 invariant).
const seenPrompts: string[] = []

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(async (opts: { prompt: string }) => {
      seenPrompts.push(opts.prompt)
      // Return a canned reviewer response. pass_status=true with one trivial
      // issue keeps the severity-weighted overall_pass at true (sev 1 < threshold).
      const payload = {
        pass_status: true,
        issues: [{ type: 'Tiny_Nit', severity: 1, fix_instruction: 'minor polish' }],
        quick_comment: 'mocked OK',
      }
      return { text: JSON.stringify(payload) } as any
    }),
  }
})

let tmpDir: string
const bookId = 'e2e-book'

beforeEach(() => {
  seenPrompts.length = 0
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-flow-'))
  fs.mkdirSync(path.join(tmpDir, bookId), { recursive: true })
  // Set env so editorialLLMConfig has something to fall back to.
  process.env.LLM_API_KEY = 'test'
  process.env.LLM_MODEL = 'mock-model'
  delete process.env.EDITORIAL_MODEL
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.LLM_API_KEY
  delete process.env.LLM_MODEL
})

describe('Full chapter flow: lore → outline → draft → editorial', () => {
  it('should walk the whole pipeline and persist a properly-shaped review file', async () => {
    const { createAllTools } = await import('../src/tools/index.js')
    const registry = createAllTools()
    const ctx = { bookId, dataDir: tmpDir }

    // 1. save_lore — characters
    const charactersJson = JSON.stringify({
      林辰: { background: '前世修了五十年，重生回到外门第三年练气二层' },
      苏婉: { background: '林辰的师妹，剑修' },
    })
    const loreResult = await registry.execute(
      'save_lore',
      { category: 'characters', content_json: charactersJson },
      ctx,
    )
    expect(loreResult).toContain('saved successfully')
    expect(fs.existsSync(path.join(tmpDir, bookId, '01_Global_Settings', 'characters.json'))).toBe(true)

    // 2. save_lore — world
    await registry.execute('save_lore', {
      category: 'world_setting',
      content_json: JSON.stringify({ 修炼体系: '练气→筑基→金丹→元婴' }),
    }, ctx)

    // 3. save_outline
    const outline = {
      id: bookId,
      type: 'book',
      label: '测试小说',
      children: [{
        id: 'vol1',
        type: 'volume',
        label: '第一卷',
        children: [
          { id: 'ch01', type: 'chapter', label: '重生归来', summary: '林辰带着前世记忆重生在外门第三年' },
          { id: 'ch02', type: 'chapter', label: '初遇师妹', summary: '林辰再见苏婉，决定不重蹈前世覆辙' },
        ],
      }],
    }
    const outlineResult = await registry.execute(
      'save_outline',
      { outline_json: JSON.stringify(outline) },
      ctx,
    )
    expect(outlineResult).toContain('Outline saved')

    // 4. Write the draft file directly (save_draft removed; editorial requires
    //    the file to exist and be ≥ MIN_REVIEW_DRAFT_CHARS).
    const draftBody = '# 第一章 重生归来\n\n' +
      '林辰睁开眼，看着熟悉的茅屋顶。'.repeat(180)
    expect(draftBody.length).toBeGreaterThan(2500)
    const draftsDir = path.join(tmpDir, bookId, '04_Drafts')
    fs.mkdirSync(draftsDir, { recursive: true })
    fs.writeFileSync(path.join(draftsDir, 'ch01.md'), draftBody, 'utf-8')
    expect(fs.existsSync(path.join(tmpDir, bookId, '04_Drafts', 'ch01.md'))).toBe(true)

    // 5. submit_to_editorial — this triggers the default machine reviewers
    // (lore + causality; mocked LLM).
    const editorialResult = await registry.execute(
      'submit_to_editorial',
      {
        draft_text: draftBody,
        chapter_id: 'ch01',
        pov_character: '林辰',
        setting: '外门茅屋，黎明',
        scene_target: '建立重生的紧迫感',
      },
      ctx,
    )
    const parsed = JSON.parse(editorialResult)
    expect(parsed.overall_pass).toBe(true)
    expect(parsed.requires_human_approval).toBe(true)
    expect(parsed.revision_round).toBe(1)
    expect(parsed.feedbacks).toHaveLength(2)
    const reviewerNames = parsed.feedbacks.map((f: any) => f.reviewer)
    expect(reviewerNames).toContain('editorial_lore')
    expect(reviewerNames).toContain('editorial_causality')

    // 6. The persisted review file should have the same shape + history bookkeeping.
    const reviewPath = path.join(tmpDir, bookId, '04_Drafts', 'review_ch01.json')
    expect(fs.existsSync(reviewPath)).toBe(true)
    const reviewFile = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))
    expect(reviewFile.revision_round).toBe(1)
    expect(reviewFile.issue_history).toBeTruthy()
    expect(Object.keys(reviewFile.issue_history).length).toBeGreaterThan(0)
    expect(reviewFile.feedbacks).toHaveLength(2)
  })

  it('should inject lore + outline context into reviewer prompts (P0-1 regression guard)', async () => {
    const { createAllTools } = await import('../src/tools/index.js')
    const registry = createAllTools()
    const ctx = { bookId, dataDir: tmpDir }

    await registry.execute('save_lore', {
      category: 'characters',
      content_json: JSON.stringify({ 林辰: { trait: 'UNIQUE_LORE_MARKER_alpha_42' } }),
    }, ctx)
    await registry.execute('save_lore', {
      category: 'world_setting',
      content_json: JSON.stringify({ 体系: 'UNIQUE_WORLD_MARKER_beta_99' }),
    }, ctx)
    await registry.execute('save_outline', {
      outline_json: JSON.stringify({
        id: bookId, type: 'book', label: 'test',
        children: [{
          id: 'vol1', type: 'volume', label: 'v1',
          children: [
            { id: 'ch01', type: 'chapter', label: '前章', summary: 'UNIQUE_OUTLINE_PREV_MARKER' },
            { id: 'ch02', type: 'chapter', label: '本章', summary: 'UNIQUE_OUTLINE_CUR_MARKER' },
          ],
        }],
      }),
    }, ctx)

    const draft = '正文'.repeat(1300)
    const draftsDir2 = path.join(tmpDir, bookId, '04_Drafts')
    fs.mkdirSync(draftsDir2, { recursive: true })
    fs.writeFileSync(path.join(draftsDir2, 'ch02.md'), draft, 'utf-8')
    await registry.execute('submit_to_editorial', {
      draft_text: draft,
      chapter_id: 'ch02',
    }, ctx)

    // Default machine reviewers × 1 prompt each.
    expect(seenPrompts.length).toBeGreaterThanOrEqual(2)
    const allPrompts = seenPrompts.join('\n=====\n')

    // Lore content must reach the lore reviewer's prompt.
    expect(allPrompts).toContain('UNIQUE_LORE_MARKER_alpha_42')
    expect(allPrompts).toContain('UNIQUE_WORLD_MARKER_beta_99')
    // Outline context for both prev (ch01) and current (ch02) should be present.
    expect(allPrompts).toContain('UNIQUE_OUTLINE_PREV_MARKER')
    expect(allPrompts).toContain('UNIQUE_OUTLINE_CUR_MARKER')
    // No raw Jinja placeholders should leak through.
    expect(allPrompts).not.toMatch(/\{\{[^}]*\}\}/)
    expect(allPrompts).not.toMatch(/\{%[^%]*%\}/)
  })

  it('should increment revision_round + flag persistent issues across rounds', async () => {
    const { createAllTools } = await import('../src/tools/index.js')
    const { generateText } = await import('ai')
    vi.mocked(generateText).mockImplementation(async (opts: { prompt: string }) => {
      seenPrompts.push(opts.prompt)
      return {
        text: JSON.stringify({
          pass_status: false,
          issues: [{ type: 'Camera_Blocking_Density', severity: 4, fix_instruction: '删开篇镜头链' }],
          quick_comment: 'mocked fail',
        }),
      } as any
    })
    const registry = createAllTools()
    const ctx = { bookId, dataDir: tmpDir }

    await registry.execute('save_lore', {
      category: 'characters', content_json: '{}',
    }, ctx)
    await registry.execute('save_outline', {
      outline_json: JSON.stringify({
        id: bookId, type: 'book', label: 't',
        children: [{
          id: 'v1', type: 'volume', label: 'v',
          children: [{ id: 'ch01', type: 'chapter', label: '一', summary: 's' }],
        }],
      }),
    }, ctx)
    const draft = '正文'.repeat(1300)
    const draftsDir3 = path.join(tmpDir, bookId, '04_Drafts')
    fs.mkdirSync(draftsDir3, { recursive: true })
    fs.writeFileSync(path.join(draftsDir3, 'ch01.md'), draft, 'utf-8')

    // Three consecutive submissions — same canned reviewer issue → persistent
    // by round 3. The mock returns the same Tiny_Nit issue each call.
    const r1 = JSON.parse(await registry.execute('submit_to_editorial',
      { draft_text: draft, chapter_id: 'ch01' }, ctx))
    expect(r1.revision_round).toBe(1)
    expect(r1.persistent_issues).toEqual([])

    const r2 = JSON.parse(await registry.execute('submit_to_editorial',
      { draft_text: draft, chapter_id: 'ch01' }, ctx))
    expect(r2.revision_round).toBe(2)
    expect(r2.persistent_issues).toEqual([])
    expect(r2.revision_strategy.action).toBe('stop_auto_revision')
    expect(r2.revision_strategy.auto_revision.exhausted).toBe(true)
    expect(r2.summary).toContain('停止自动重写')
    expect(r2.summary).toContain('不要继续保存草稿或再次送审')

    const r3 = JSON.parse(await registry.execute('submit_to_editorial',
      { draft_text: draft, chapter_id: 'ch01' }, ctx))
    expect(r3.revision_round).toBe(3)
    expect(r3.persistent_issues.length).toBeGreaterThan(0)
    expect(r3.summary).toContain('收敛警告')
    expect(r3.summary).toContain('request_guidance')

    const rReset = JSON.parse(await registry.execute('submit_to_editorial',
      { draft_text: draft, chapter_id: 'ch01', reset_auto_revision_budget: true }, ctx))
    expect(rReset.revision_round).toBe(1)
    expect(rReset.persistent_issues).toEqual([])
    expect(rReset.revision_strategy.auto_revision.current_round).toBe(1)
    expect(rReset.revision_strategy.action).not.toBe('stop_auto_revision')
  })
})
