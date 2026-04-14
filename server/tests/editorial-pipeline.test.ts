/**
 * Tests for editorial pipeline — template rendering, reviewer parsing, error handling.
 *
 * Does NOT call real LLM — tests the parsing/merge logic and error paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  renderTemplate,
  computeOverallPass,
  buildMergedSummary,
  reviewerEffectivePass,
  SEVERITY_CRITICAL,
  WEIGHTED_FAIL_THRESHOLD,
  type EditorialFeedback,
} from '../src/editorial/pipeline.js'

const TEST_DIR = path.join(process.cwd(), '__test_editorial__')

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

// ── Reviewer response parsing (same logic as pipeline.ts) ──

function parseReviewerResponse(text: string, reviewerName: string): {
  reviewer: string
  pass_status: boolean
  issues: Array<{ type: string; severity: number; quote?: string; fix_instruction?: string }>
  quick_comment: string
} {
  let cleaned = text.trim()
  const jsonMatch = cleaned.match(/```json?\s*\n?([\s\S]*?)\n?```/)
  if (jsonMatch) cleaned = jsonMatch[1].trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      reviewer: reviewerName,
      pass_status: parsed.pass_status ?? true,
      issues: parsed.ai_tone_issues ?? parsed.issues ?? parsed.lore_issues ?? parsed.pacing_issues ?? [],
      quick_comment: parsed.quick_comment ?? parsed.comment ?? '',
    }
  } catch {
    return {
      reviewer: reviewerName,
      pass_status: false,
      issues: [{ type: 'Parse_Error', severity: 3, fix_instruction: 'Review response could not be parsed' }],
      quick_comment: `[Parse error] Raw: ${text.slice(0, 200)}`,
    }
  }
}

function fb(
  reviewer: string,
  pass_status: boolean,
  issues: EditorialFeedback['issues'] = [],
  quick_comment = '',
): EditorialFeedback {
  return { reviewer, pass_status, issues, quick_comment }
}

describe('Template Rendering', () => {
  it('should substitute single variable', () => {
    const tplPath = path.join(TEST_DIR, 'test.j2')
    fs.writeFileSync(tplPath, 'Hello {{ name }}!', 'utf-8')

    const result = renderTemplate(tplPath, { name: 'World' })
    expect(result).toBe('Hello World!')
  })

  it('should substitute multiple variables', () => {
    const tplPath = path.join(TEST_DIR, 'multi.j2')
    fs.writeFileSync(tplPath, '{{ greeting }} {{ name }}, {{ action }}?', 'utf-8')

    const result = renderTemplate(tplPath, { greeting: 'Hi', name: 'Alice', action: 'write' })
    expect(result).toBe('Hi Alice, write?')
  })

  it('should handle no-space variable syntax', () => {
    const tplPath = path.join(TEST_DIR, 'nospace.j2')
    fs.writeFileSync(tplPath, 'Value: {{value}}', 'utf-8')

    const result = renderTemplate(tplPath, { value: '42' })
    expect(result).toBe('Value: 42')
  })

  it('should replace unknown variables with （未提供） backstop', () => {
    const tplPath = path.join(TEST_DIR, 'unknown.j2')
    fs.writeFileSync(tplPath, '{{ known }} {{ unknown }}', 'utf-8')

    const result = renderTemplate(tplPath, { known: 'yes' })
    expect(result).toBe('yes （未提供）')
    expect(result).not.toContain('{{')
  })

  it('should keep {% if var %} body when var is truthy', () => {
    const tplPath = path.join(TEST_DIR, 'if-true.j2')
    fs.writeFileSync(tplPath, 'A{% if flag %} middle={{ flag }}{% endif %} B', 'utf-8')

    const result = renderTemplate(tplPath, { flag: 'ON' })
    expect(result).toBe('A middle=ON B')
  })

  it('should strip {% if var %} block when var is missing or empty', () => {
    const tplPath = path.join(TEST_DIR, 'if-false.j2')
    fs.writeFileSync(tplPath, 'A{% if flag %} middle={{ flag }}{% endif %} B', 'utf-8')

    const emptyVar = renderTemplate(tplPath, { flag: '' })
    expect(emptyVar).toBe('A B')

    const missingVar = renderTemplate(tplPath, {})
    expect(missingVar).toBe('A B')
  })

  it('should handle multiple {% if %} blocks independently', () => {
    const tplPath = path.join(TEST_DIR, 'multi-if.j2')
    fs.writeFileSync(
      tplPath,
      '{% if a %}A={{ a }}{% endif %}|{% if b %}B={{ b }}{% endif %}|{% if c %}C={{ c }}{% endif %}',
      'utf-8'
    )
    const result = renderTemplate(tplPath, { a: '1', c: '3' })
    expect(result).toBe('A=1||C=3')
  })
})

describe('Reviewer Response Parsing', () => {
  it('should parse valid JSON response', () => {
    const json = JSON.stringify({
      pass_status: true,
      issues: [],
      quick_comment: 'Looks good',
    })
    const result = parseReviewerResponse(json, 'lore')
    expect(result.pass_status).toBe(true)
    expect(result.quick_comment).toBe('Looks good')
    expect(result.issues).toEqual([])
  })

  it('should parse response with markdown fences', () => {
    const json = JSON.stringify({
      pass_status: false,
      issues: [{ type: 'Inconsistency', severity: 3 }],
      quick_comment: 'Found issue',
    })
    const fenced = '```json\n' + json + '\n```'
    const result = parseReviewerResponse(fenced, 'pacing')
    expect(result.pass_status).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe('Inconsistency')
  })

  it('should handle ai_tone_issues field name', () => {
    const json = JSON.stringify({
      pass_status: true,
      ai_tone_issues: [{ type: 'AI_Tone', severity: 2 }],
      quick_comment: 'Minor',
    })
    const result = parseReviewerResponse(json, 'ai_tone')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe('AI_Tone')
  })

  it('should handle lore_issues field name', () => {
    const json = JSON.stringify({
      pass_status: true,
      lore_issues: [{ type: 'Lore_Break', severity: 4 }],
    })
    const result = parseReviewerResponse(json, 'lore')
    expect(result.issues).toHaveLength(1)
  })

  it('should handle pacing_issues field name', () => {
    const json = JSON.stringify({
      pass_status: true,
      pacing_issues: [{ type: 'Slow_Pacing', severity: 2 }],
    })
    const result = parseReviewerResponse(json, 'pacing')
    expect(result.issues).toHaveLength(1)
  })

  it('should handle comment field as quick_comment fallback', () => {
    const json = JSON.stringify({
      pass_status: true,
      issues: [],
      comment: 'All fine',
    })
    const result = parseReviewerResponse(json, 'lore')
    expect(result.quick_comment).toBe('All fine')
  })

  it('should return pass_status=false on JSON parse error', () => {
    const result = parseReviewerResponse('not json at all', 'lore')
    expect(result.pass_status).toBe(false)
    expect(result.issues[0].type).toBe('Parse_Error')
    expect(result.quick_comment).toContain('[Parse error]')
  })

  it('should default pass_status to true if field missing', () => {
    const json = JSON.stringify({ issues: [] })
    const result = parseReviewerResponse(json, 'lore')
    expect(result.pass_status).toBe(true)
  })

  it('should truncate raw text in parse error comment', () => {
    const longText = 'x'.repeat(500)
    const result = parseReviewerResponse(longText, 'lore')
    expect(result.quick_comment.length).toBeLessThan(250)
  })
})

describe('Merged Summary (severity-sorted)', () => {
  it('should show check marks for passing reviewers', () => {
    const summary = buildMergedSummary([
      fb('lore', true, [], 'OK'),
      fb('pacing', true, [], 'Good'),
    ])
    expect(summary).toContain('✅')
    expect(summary).not.toContain('❌')
  })

  it('should show failing reviewer with issue details and weighted severity tag', () => {
    const summary = buildMergedSummary([
      fb('lore', false,
        [{ type: 'Lore_Break', severity: 4, fix_instruction: 'Fix character name' }],
        'Inconsistency found'),
    ])
    expect(summary).toContain('❌')
    expect(summary).toContain('Inconsistency found')
    expect(summary).toContain('Lore_Break')
    expect(summary).toContain('严重度4')
    expect(summary).toContain('Fix character name')
    expect(summary).toContain('加权严重度 4')
  })

  it('should put failing reviewers before passing ones', () => {
    const summary = buildMergedSummary([
      fb('lore', true, [], 'OK'),
      fb('pacing', false, [{ type: 'Slow', severity: 2, fix_instruction: 'Add tension' }], 'Too slow'),
      fb('ai_tone', true, [], 'Fine'),
    ])
    // Failing reviewer's section must precede both passing reviewers in the output.
    const pacingIdx = summary.indexOf('[pacing]')
    const loreIdx = summary.indexOf('[lore]')
    const toneIdx = summary.indexOf('[ai_tone]')
    expect(pacingIdx).toBeGreaterThanOrEqual(0)
    expect(pacingIdx).toBeLessThan(loreIdx)
    expect(pacingIdx).toBeLessThan(toneIdx)
  })

  it('should sort failing reviewers by max severity desc', () => {
    const summary = buildMergedSummary([
      fb('minor', false, [{ type: 'X', severity: 2 }], 'Nit'),
      fb('major', false, [{ type: 'Y', severity: 5 }], 'Crash'),
    ])
    expect(summary.indexOf('[major]')).toBeLessThan(summary.indexOf('[minor]'))
  })

  it('should sort issues within a failing reviewer by severity desc', () => {
    const summary = buildMergedSummary([
      fb('lore', false, [
        { type: 'Tiny', severity: 1, fix_instruction: 'small' },
        { type: 'Huge', severity: 5, fix_instruction: 'fatal' },
        { type: 'Med', severity: 3, fix_instruction: 'medium' },
      ], 'Bad'),
    ])
    expect(summary.indexOf('Huge')).toBeLessThan(summary.indexOf('Med'))
    expect(summary.indexOf('Med')).toBeLessThan(summary.indexOf('Tiny'))
  })
})

describe('Severity-weighted overall pass', () => {
  it('should pass when all reviewers pass with no issues', () => {
    expect(computeOverallPass([
      fb('lore', true), fb('pacing', true), fb('ai_tone', true),
    ])).toBe(true)
  })

  it('should fail when a reviewer has a critical-severity issue even if pass_status=true', () => {
    // LLM said ✅ but emitted a severity-5 issue → forced fail.
    const contradicting = fb('lore', true,
      [{ type: 'Timeline_Conflict', severity: SEVERITY_CRITICAL + 1 }], 'mostly fine')
    expect(reviewerEffectivePass(contradicting)).toBe(false)
    expect(computeOverallPass([
      contradicting, fb('pacing', true), fb('ai_tone', true),
    ])).toBe(false)
  })

  it('should fail when weighted severity meets threshold even without a blocker', () => {
    // Four sev-2 issues = weighted 8, at the threshold → fail.
    const noisy = fb('pacing', true, [
      { type: 'A', severity: 2 }, { type: 'B', severity: 2 },
      { type: 'C', severity: 2 }, { type: 'D', severity: 2 },
    ], 'many little things')
    expect(reviewerWeightedSeverityThresholdHit(noisy)).toBe(true)
    expect(reviewerEffectivePass(noisy)).toBe(false)
  })

  it('should pass when weighted severity stays below threshold and no blocker', () => {
    const mild = fb('pacing', true, [
      { type: 'A', severity: 2 }, { type: 'B', severity: 3 },
    ], 'two small notes')
    expect(reviewerEffectivePass(mild)).toBe(true)
    expect(computeOverallPass([mild, fb('lore', true), fb('ai_tone', true)])).toBe(true)
  })

  it('should respect an LLM pass_status=false even with no issues (trusts the reviewer)', () => {
    const gutFail = fb('ai_tone', false, [], '整体味道不对')
    expect(reviewerEffectivePass(gutFail)).toBe(false)
  })

  it('should treat missing severity as 3 (mid)', () => {
    const noSev = fb('lore', true, [
      { type: 'X' } as any, { type: 'Y' } as any, { type: 'Z' } as any,
    ], 'no severity field')
    // Three defaults of 3 = 9, over WEIGHTED_FAIL_THRESHOLD (8) → fail.
    expect(WEIGHTED_FAIL_THRESHOLD).toBe(8)
    expect(reviewerEffectivePass(noSev)).toBe(false)
  })
})

function reviewerWeightedSeverityThresholdHit(f: EditorialFeedback): boolean {
  const sum = f.issues.reduce((n, i) => n + (i.severity ?? 3), 0)
  return sum >= WEIGHTED_FAIL_THRESHOLD
}
