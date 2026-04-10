/**
 * Tests for editorial pipeline — template rendering, reviewer parsing, error handling.
 *
 * Does NOT call real LLM — tests the parsing/merge logic and error paths.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

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

// ── Template rendering (same logic as pipeline.ts) ──

function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = fs.readFileSync(templatePath, 'utf-8')
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{ ${key} }}`, value)
    content = content.replaceAll(`{{${key}}}`, value)
  }
  return content
}

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

// ── Merge summary (same logic as pipeline.ts) ──

function mergeSummary(
  feedbacks: Array<{
    reviewer: string
    pass_status: boolean
    issues: Array<{ type: string; severity: number; fix_instruction?: string }>
    quick_comment: string
  }>
): string {
  const parts: string[] = []
  for (const fb of feedbacks) {
    if (!fb.pass_status) {
      parts.push(`[${fb.reviewer}] ❌ ${fb.quick_comment}`)
      for (const issue of fb.issues) {
        parts.push(`  - [${issue.type}|严重度${issue.severity}] ${issue.fix_instruction ?? ''}`)
      }
    } else {
      parts.push(`[${fb.reviewer}] ✅ ${fb.quick_comment}`)
    }
  }
  return parts.join('\n')
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

  it('should leave unknown variables unsubstituted', () => {
    const tplPath = path.join(TEST_DIR, 'unknown.j2')
    fs.writeFileSync(tplPath, '{{ known }} {{ unknown }}', 'utf-8')

    const result = renderTemplate(tplPath, { known: 'yes' })
    expect(result).toBe('yes {{ unknown }}')
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

describe('Merge Summary', () => {
  it('should show check marks for passing reviewers', () => {
    const feedbacks = [
      { reviewer: 'lore', pass_status: true, issues: [], quick_comment: 'OK' },
      { reviewer: 'pacing', pass_status: true, issues: [], quick_comment: 'Good' },
    ]
    const summary = mergeSummary(feedbacks)
    expect(summary).toContain('✅')
    expect(summary).not.toContain('❌')
  })

  it('should show X marks for failing reviewers with issue details', () => {
    const feedbacks = [
      {
        reviewer: 'lore',
        pass_status: false,
        issues: [{ type: 'Lore_Break', severity: 4, fix_instruction: 'Fix character name' }],
        quick_comment: 'Inconsistency found',
      },
    ]
    const summary = mergeSummary(feedbacks)
    expect(summary).toContain('❌')
    expect(summary).toContain('Inconsistency found')
    expect(summary).toContain('Lore_Break')
    expect(summary).toContain('严重度4')
    expect(summary).toContain('Fix character name')
  })

  it('should mix passing and failing reviewers', () => {
    const feedbacks = [
      { reviewer: 'lore', pass_status: true, issues: [], quick_comment: 'OK' },
      {
        reviewer: 'pacing',
        pass_status: false,
        issues: [{ type: 'Slow', severity: 2, fix_instruction: 'Add tension' }],
        quick_comment: 'Too slow',
      },
      { reviewer: 'ai_tone', pass_status: true, issues: [], quick_comment: 'Fine' },
    ]
    const summary = mergeSummary(feedbacks)
    expect(summary).toContain('✅')
    expect(summary).toContain('❌')
    expect(summary).toContain('[lore] ✅ OK')
    expect(summary).toContain('[pacing] ❌ Too slow')
  })
})

describe('Editorial Result Overall Pass', () => {
  it('should pass when all reviewers pass', () => {
    const feedbacks = [
      { reviewer: 'lore', pass_status: true, issues: [], quick_comment: 'OK' },
      { reviewer: 'pacing', pass_status: true, issues: [], quick_comment: 'OK' },
      { reviewer: 'ai_tone', pass_status: true, issues: [], quick_comment: 'OK' },
    ]
    const overall = feedbacks.every(f => f.pass_status)
    expect(overall).toBe(true)
  })

  it('should fail when any reviewer fails', () => {
    const feedbacks = [
      { reviewer: 'lore', pass_status: true, issues: [], quick_comment: 'OK' },
      { reviewer: 'pacing', pass_status: false, issues: [], quick_comment: 'Bad' },
      { reviewer: 'ai_tone', pass_status: true, issues: [], quick_comment: 'OK' },
    ]
    const overall = feedbacks.every(f => f.pass_status)
    expect(overall).toBe(false)
  })

  it('should fail when all reviewers fail', () => {
    const feedbacks = [
      { reviewer: 'lore', pass_status: false, issues: [], quick_comment: 'Bad' },
      { reviewer: 'pacing', pass_status: false, issues: [], quick_comment: 'Bad' },
      { reviewer: 'ai_tone', pass_status: false, issues: [], quick_comment: 'Bad' },
    ]
    const overall = feedbacks.every(f => f.pass_status)
    expect(overall).toBe(false)
  })
})
