import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createAllTools } from '../src/tools/index.js'
import { buildRevisionBrief, buildRevisionStrategy, computeOverallPass, runEditorialPipeline } from '../src/editorial/pipeline.js'
import { mergeTargetedReview } from '../src/editorial/editorial.js'
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

  it('should have 23 total tools registered', () => {
    const registry = createAllTools()
    const names = registry.listNames()
    expect(names.length).toBe(23)
    expect(names).toContain('submit_to_editorial')
    expect(names).toContain('load_skill')
    expect(names).toContain('list_skills')
    expect(names).toContain('analyze_style_profile')
    expect(names).toContain('browse_examples')
  })

  it('tool summary should expose exemplar and style profile tools', () => {
    const registry = createAllTools()
    const summary = registry.getToolSummary()
    expect(summary).toContain('范文库:')
    expect(summary).toContain('analyze_style_profile')
    expect(summary).toContain('browse_examples')
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

  it('all scene reviewers should report every clear issue in their scope', () => {
    for (const t of SCENE_TEMPLATES) {
      const fp = path.join(PROMPTS_DIR, t)
      const content = fs.readFileSync(fp, 'utf-8')
      expect(content, `${t} should discourage one-issue-at-a-time reviews`)
        .toContain('反复重审')
      expect(content, `${t} should list multiple clear issues`)
        .toContain('不能只')
    }
  })

  it('AI tone template should catch metaphor/rhetoric pileup', () => {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, 'reader_scene_ai_tone.j2'), 'utf-8')
    expect(content).toContain('Rhetoric_Pileup')
    expect(content).toContain('修辞/比喻连发')
    expect(content).toContain('电风扇')
    expect(content).toContain('墓碑')
  })

  it('AI tone template should catch dense camera blocking in openings', () => {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, 'reader_scene_ai_tone.j2'), 'utf-8')
    expect(content).toContain('Camera_Blocking_Density')
    expect(content).toContain('镜头编排过密')
    expect(content).toContain('死刑类')
    expect(content).toContain('严重度不得低于4')
    expect(content).toContain('他踩进腐叶')
    expect(content).toContain('影视分镜')
  })

  it('AI tone template should report all clear issues instead of only the worst one', () => {
    const content = fs.readFileSync(path.join(PROMPTS_DIR, 'reader_scene_ai_tone.j2'), 'utf-8')
    expect(content).toContain('所有明确命中的AI腔调问题')
    expect(content).toContain('避免作者一次只修一个问题、反复重审')
    expect(content).toContain('两项都要输出')
    expect(content).toContain('不能只输出最严重的一项')
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

describe('Editorial revision strategy', () => {
  it('recommends chapter_edit for high-score local prose failures', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [{ type: 'Rhetoric_Pileup', severity: 4, fix_instruction: '删减开篇比喻堆砌' }],
        quick_comment: '局部修辞堆砌',
      },
      { reviewer: 'editorial_lore', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_pacing', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_character', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_causality', pass_status: true, issues: [], quick_comment: 'ok' },
    ])

    expect(strategy.action).toBe('chapter_edit')
    expect(strategy.grade).toBe('light')
    expect(strategy.recommended_review_scope).toBe('failed_only')
    expect(strategy.target_reviewers).toEqual(['editorial_ai_tone'])
    expect(strategy.revision_brief).toContain('Rhetoric_Pileup')
    expect(strategy.instruction).toContain('load_skill("chapter_edit")')
    expect(strategy.instruction).toContain('禁止整章重写')
  })

  it('recommends chapter_edit for medium local structural fixes that still preserve the chapter', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_causality',
        pass_status: false,
        issues: [{ type: 'Motive_Chain_Weak', severity: 3, fix_instruction: '补强信任动机链' }],
        quick_comment: '局部动机链需要补强',
      },
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [{ type: 'Death_Words', severity: 3, fix_instruction: '删缓冲词' }],
        quick_comment: '局部 AI 腔',
      },
      { reviewer: 'editorial_lore', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_pacing', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_character', pass_status: true, issues: [], quick_comment: 'ok' },
    ])

    expect(strategy.action).toBe('chapter_edit')
    expect(strategy.instruction).toContain('load_skill("chapter_edit")')
  })

  it('recommends chapter_edit for multi-reviewer repairable local failures', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_pacing',
        pass_status: false,
        issues: [{ type: 'PTSD_Missing', severity: 4, fix_instruction: '补一段明确的惊惧和自我压制' }],
        quick_comment: '开场压力反应不足',
      },
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [
          { type: 'Camera_Blocking_Density', severity: 4, fix_instruction: '删掉连续镜头动作链' },
          { type: 'Rhetoric_Pileup', severity: 4, fix_instruction: '删掉连续比喻' },
        ],
        quick_comment: 'AI 腔明显但集中在开头',
      },
      {
        reviewer: 'editorial_causality',
        pass_status: false,
        issues: [{ type: 'Broken_Causality', severity: 3, fix_instruction: '补手机 APP 异常激活因果桥' }],
        quick_comment: '局部因果桥缺失',
      },
      { reviewer: 'editorial_lore', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_character', pass_status: true, issues: [], quick_comment: 'ok' },
    ])

    expect(strategy.action).toBe('chapter_edit')
    expect(strategy.grade).toBe('medium')
    expect(strategy.recommended_review_scope).toBe('full')
    expect(strategy.instruction).toContain('load_skill("chapter_edit")')
    expect(strategy.instruction).toContain('不要整章重写')
    expect(strategy.revision_brief).toContain('Camera_Blocking_Density')
    expect(strategy.revision_brief).toContain('Broken_Causality')
  })

  it('recommends chapter_edit for all-reviewer local first-draft repair issues', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_lore',
        pass_status: false,
        issues: [
          { type: 'Item_Error', severity: 4, fix_instruction: '把空柜改成暗藏线索' },
          { type: 'Character_Error', severity: 3, fix_instruction: '减少连续动作链' },
        ],
        quick_comment: '局部设定道具和动作呈现问题',
      },
      {
        reviewer: 'editorial_pacing',
        pass_status: false,
        issues: [
          { type: 'PTSD_Missing', severity: 4, fix_instruction: '补生理应激缓冲' },
          { type: 'Pacing_Drag', severity: 3, fix_instruction: '压缩静态描写' },
        ],
        quick_comment: '局部节奏修补',
      },
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [
          { type: 'Camera_Blocking_Density', severity: 4, fix_instruction: '打散镜头链' },
          { type: 'Death_Words', severity: 3, fix_instruction: '删虚化词' },
        ],
        quick_comment: 'AI 腔局部问题',
      },
      {
        reviewer: 'editorial_character',
        pass_status: false,
        issues: [
          { type: 'Emotion_Gap', severity: 3, fix_instruction: '补先怂后稳过渡' },
          { type: 'Identity_Slip', severity: 3, fix_instruction: '激活拉鲁拉丝情绪敏感特质' },
        ],
        quick_comment: '角色局部补强',
      },
      {
        reviewer: 'editorial_causality',
        pass_status: false,
        issues: [
          { type: 'Dropped_Foreshadow', severity: 3, fix_instruction: '补回超能波动异常伏笔' },
          { type: 'Floating_Hook', severity: 3, fix_instruction: '铺超能波动异常伏笔' },
          { type: 'Weak_Motive', severity: 3, fix_instruction: '补投喂动机' },
          { type: 'Coincidence_Driven', severity: 2, fix_instruction: '补脚印引导逻辑' },
        ],
        quick_comment: '因果局部补桥',
      },
    ])

    expect(strategy.action).toBe('chapter_edit')
    expect(strategy.grade).toBe('medium')
    expect(strategy.recommended_review_scope).toBe('full')
    expect(strategy.instruction).toContain('load_skill("chapter_edit")')
  })

  it('recommends chapter_rewrite for low-score structural failures', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_lore',
        pass_status: false,
        issues: [{ type: 'Lore_Contradiction', severity: 5, fix_instruction: '核心设定冲突' }],
        quick_comment: '设定冲突',
      },
      {
        reviewer: 'editorial_character',
        pass_status: false,
        issues: [{ type: 'Character_Break', severity: 5, fix_instruction: '角色行为反转' }],
        quick_comment: '人设崩坏',
      },
      {
        reviewer: 'editorial_causality',
        pass_status: false,
        issues: [{ type: 'Causality_Break', severity: 4, fix_instruction: '因果断裂' }],
        quick_comment: '因果断裂',
      },
    ])

    expect(strategy.action).toBe('chapter_rewrite')
    expect(strategy.grade).toBe('severe')
    expect(strategy.recommended_review_scope).toBe('full')
    expect(strategy.instruction).toContain('load_skill("chapter_rewrite")')
  })

  it('stops automatic revision as soon as the auto revision budget is exhausted', () => {
    const strategy = buildRevisionStrategy([
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [{ type: 'Camera_Blocking_Density', severity: 4, fix_instruction: '删开篇镜头链' }],
        quick_comment: '镜头过密',
      },
    ], { currentRound: 2, maxAutoRounds: 2 })

    expect(strategy.action).toBe('stop_auto_revision')
    expect(strategy.grade).toBe('stuck')
    expect(strategy.auto_revision.exhausted).toBe(true)
    expect(strategy.instruction).toContain('停止自动重写')
    expect(strategy.revision_brief).toContain('不要继续保存草稿或再次送审')
    expect(strategy.revision_brief).not.toContain('保存后只复审')
  })

  it('allows pass with low-severity advisory notes', () => {
    const feedbacks = [
      {
        reviewer: 'editorial_causality',
        pass_status: true,
        issues: [{ type: 'Minor_Clarification', severity: 2, fix_instruction: '可更明确感知主体' }],
        quick_comment: '通过但有建议',
      },
    ]

    expect(computeOverallPass(feedbacks)).toBe(true)
    const strategy = buildRevisionStrategy(feedbacks)
    expect(strategy.action).toBe('none')
  })

  it('builds revision brief with all explicit AI-tone issue classes', () => {
    const brief = buildRevisionBrief([
      {
        reviewer: 'editorial_ai_tone',
        pass_status: false,
        issues: [
          { type: 'Camera_Blocking_Density', severity: 5, quote: '他停下，抬头，看见树冠', fix_instruction: '删连续镜头链' },
          { type: 'Rhetoric_Pileup', severity: 4, quote: '指南针像电风扇', fix_instruction: '删比喻堆砌' },
        ],
        quick_comment: 'AI腔明显',
      },
      {
        reviewer: 'editorial_lore',
        pass_status: false,
        issues: [{ type: 'Lore_Contradiction', severity: 4, fix_instruction: '修正手机 APP 激活设定' }],
        quick_comment: '设定冲突',
      },
    ])

    expect(brief).toContain('Camera_Blocking_Density')
    expect(brief).toContain('Rhetoric_Pileup')
    expect(brief).toContain('Lore_Contradiction')
    expect(brief).toContain('只复审 editorial_ai_tone、editorial_lore')
  })

  it('returns none when all reviewers pass', () => {
    const strategy = buildRevisionStrategy([
      { reviewer: 'editorial_lore', pass_status: true, issues: [], quick_comment: 'ok' },
      { reviewer: 'editorial_pacing', pass_status: true, issues: [], quick_comment: 'ok' },
    ])

    expect(strategy.action).toBe('none')
    expect(strategy.score).toBe(100)
  })
})

describe('Targeted editorial review merging', () => {
  const pass = (reviewer: string) => ({
    reviewer,
    pass_status: true,
    issues: [],
    quick_comment: 'ok',
  })
  const fail = (reviewer: string, severity = 4) => ({
    reviewer,
    pass_status: false,
    issues: [{ type: 'Issue', severity, fix_instruction: 'fix' }],
    quick_comment: 'fail',
  })

  it('keeps chapter blocked until merged default lore/causality result is all pass', () => {
    const previous = {
      feedbacks: [
        pass('editorial_lore'),
        pass('editorial_pacing'),
        fail('editorial_ai_tone'),
        pass('editorial_character'),
        fail('editorial_causality', 3),
      ],
    }
    const current = {
      overall_pass: true,
      feedbacks: [pass('editorial_ai_tone')],
      merged_summary: '',
      revision_strategy: buildRevisionStrategy([pass('editorial_ai_tone')]),
    }

    const merged = mergeTargetedReview(previous, current, ['editorial_ai_tone'], 'failed_only')

    expect(merged.review_scope).toBe('failed_only')
    expect(merged.reviewed_reviewers).toEqual(['editorial_ai_tone'])
    expect(merged.carried_forward_reviewers).toContain('editorial_causality')
    expect(merged.feedbacks.map(fb => fb.reviewer).sort()).toEqual([
      'editorial_causality',
      'editorial_lore',
    ])
    expect(merged.overall_pass).toBe(false)
  })

  it('passes machine review after failed-only clears default lore/causality reviewers', () => {
    const previous = {
      feedbacks: [
        pass('editorial_lore'),
        pass('editorial_pacing'),
        pass('editorial_ai_tone'),
        pass('editorial_character'),
        fail('editorial_causality'),
      ],
    }
    const current = {
      overall_pass: true,
      feedbacks: [pass('editorial_causality')],
      merged_summary: '',
      revision_strategy: buildRevisionStrategy([pass('editorial_causality')]),
    }

    const merged = mergeTargetedReview(previous, current, ['editorial_causality'], 'failed_only')

    expect(merged.feedbacks.map(fb => fb.reviewer).sort()).toEqual([
      'editorial_causality',
      'editorial_lore',
    ])
    expect(merged.overall_pass).toBe(true)
    expect(merged.revision_strategy.action).toBe('none')
  })

  it('does not pass targeted review without a complete previous five-review baseline', () => {
    const current = {
      overall_pass: true,
      feedbacks: [pass('editorial_ai_tone')],
      merged_summary: '',
      revision_strategy: buildRevisionStrategy([pass('editorial_ai_tone')]),
    }

    const merged = mergeTargetedReview(undefined, current, ['editorial_ai_tone'], 'targeted')

    expect(merged.feedbacks).toHaveLength(1)
    expect(merged.overall_pass).toBe(false)
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

  it('should reject draft_text shorter than MIN_REVIEW_DRAFT_CHARS', async () => {
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
    const longDraft = '正文'.repeat(1300)
    const result = await registry.execute('submit_to_editorial', {
      draft_text: longDraft,
      chapter_id: 'ch07',
    }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('04_Drafts/ch07.md')
    expect(result).toContain('save_draft')
  })

  it('should reject when saved draft is shorter than review minimum', async () => {
    const registry = createAllTools()
    const draftPath = path.join(tmpDir, 'test-book', '04_Drafts', 'ch03.md')
    fs.writeFileSync(draftPath, '短草稿'.repeat(100), 'utf8')
    const result = await registry.execute('submit_to_editorial', {
      draft_text: '正文'.repeat(1300),
      chapter_id: 'ch03',
    }, { bookId: 'test-book', dataDir: tmpDir })
    expect(result).toContain('Error')
    expect(result).toContain('已保存草稿')
    expect(result).toContain('最低要求')
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

describe('Editorial progress events', () => {
  it('emits per-reviewer start and completion events', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-progress-'))
    const events: any[] = []
    try {
      const result = await runEditorialPipeline(
        '足够长的测试草稿'.repeat(300),
        {
          onProgress: (evt) => events.push(evt),
          reviewerLLMConfigs: {
            editorial_causality: { apiKey: 'test', baseURL: 'http://localhost.invalid', model: 'causality-override-model' },
          },
        },
        { apiKey: 'test', baseURL: 'http://localhost.invalid', model: 'test-model' },
        tmpDir,
      )

      expect(result.feedbacks.map(fb => fb.reviewer).sort()).toEqual([
        'editorial_causality',
        'editorial_lore',
      ])
      expect(events.filter(e => e.type === 'reviewer_start')).toHaveLength(2)
      expect(events.filter(e => e.type === 'reviewer_done')).toHaveLength(2)
      expect(events.every(e => e.sourceTool === 'submit_to_editorial')).toBe(true)
      expect(events.some(e => e.toolName === 'editorial_causality')).toBe(true)
      expect(events.find(e => e.type === 'reviewer_start' && e.toolName === 'editorial_causality')?.meta?.model)
        .toBe('causality-override-model')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
