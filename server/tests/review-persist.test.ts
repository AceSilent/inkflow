/**
 * Tests for editorial review persistence — verify auto-save to 04_Drafts/review_*.json.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { type EditorialResult } from '../src/editorial/pipeline.js'
import { persistReview } from '../src/editorial/review-persistence.js'

const TEST_DIR = path.join(process.cwd(), '__test_review_persist__')

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

// Same logic as data.ts readReview
function readReview(dataDir: string, bookId: string, chapterId: string): any {
  const reviewPath = path.join(dataDir, bookId, '04_Drafts', `review_${chapterId}.json`)
  if (!fs.existsSync(reviewPath)) return null
  try {
    return JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))
  } catch {
    return null
  }
}

describe('Review Persistence', () => {
  const mockResult: EditorialResult = {
    overall_pass: false,
    feedbacks: [
      {
        reviewer: 'editorial_lore',
        pass_status: false,
        issues: [{ type: 'Lore_Break', severity: 4, fix_instruction: 'Fix character name' }],
        quick_comment: 'Inconsistency found',
      },
      {
        reviewer: 'editorial_pacing',
        pass_status: true,
        issues: [],
        quick_comment: 'Good rhythm',
      },
      {
        reviewer: 'editorial_ai_tone',
        pass_status: true,
        issues: [],
        quick_comment: 'Natural tone',
      },
    ],
    merged_summary: '[editorial_lore] ❌ Inconsistency found\n  - [Lore_Break|严重度4] Fix character name\n[editorial_pacing] ✅ Good rhythm\n[editorial_ai_tone] ✅ Natural tone',
  }

  it('should persist review result to 04_Drafts/review_{chapterId}.json', () => {
    // Create book dir structure
    const bookDir = path.join(TEST_DIR, 'book-1')
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })

    persistReview(TEST_DIR, 'book-1', 'chapter-3', mockResult)

    const saved = readReview(TEST_DIR, 'book-1', 'chapter-3')
    expect(saved).not.toBeNull()
    expect(saved.overall_pass).toBe(false)
    expect(saved.feedbacks).toHaveLength(3)
    expect(saved.merged_summary).toContain('Lore_Break')
    expect(saved.reviewed_at).toBeTruthy()
  })

  it('should create 04_Drafts directory if missing', () => {
    const bookDir = path.join(TEST_DIR, 'book-2')
    fs.mkdirSync(bookDir, { recursive: true })
    expect(fs.existsSync(path.join(bookDir, '04_Drafts'))).toBe(false)

    persistReview(TEST_DIR, 'book-2', 'ch-1', mockResult)

    expect(fs.existsSync(path.join(bookDir, '04_Drafts'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '04_Drafts', 'review_ch-1.json'))).toBe(true)
  })

  it('should overwrite previous review for same chapter', () => {
    const bookDir = path.join(TEST_DIR, 'book-3')
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })

    const firstResult: EditorialResult = {
      overall_pass: false,
      feedbacks: [],
      merged_summary: 'First review',
    }
    persistReview(TEST_DIR, 'book-3', 'ch-1', firstResult)

    const secondResult: EditorialResult = {
      overall_pass: true,
      feedbacks: [],
      merged_summary: 'Second review - passed',
    }
    persistReview(TEST_DIR, 'book-3', 'ch-1', secondResult)

    const saved = readReview(TEST_DIR, 'book-3', 'ch-1')
    expect(saved.overall_pass).toBe(true)
    expect(saved.revision_round).toBe(2)
    expect(saved.reviewed_at).toBeTruthy()
  })

  it('should persist passing review result', () => {
    const bookDir = path.join(TEST_DIR, 'book-4')
    fs.mkdirSync(bookDir, { recursive: true })

    const passingResult: EditorialResult = {
      overall_pass: true,
      feedbacks: [
        { reviewer: 'lore', pass_status: true, issues: [], quick_comment: 'OK' },
        { reviewer: 'pacing', pass_status: true, issues: [], quick_comment: 'OK' },
        { reviewer: 'ai_tone', pass_status: true, issues: [], quick_comment: 'OK' },
      ],
      merged_summary: '[lore] ✅ OK\n[pacing] ✅ OK\n[ai_tone] ✅ OK',
    }

    persistReview(TEST_DIR, 'book-4', 'ch-final', passingResult)

    const saved = readReview(TEST_DIR, 'book-4', 'ch-final')
    expect(saved.overall_pass).toBe(true)
    expect(saved.feedbacks).toHaveLength(3)
    expect(saved.revision_strategy.action).toBe('none')
    expect(saved.reviewed_at).toBeTruthy()
  })

  it('should return null when no review exists', () => {
    const result = readReview(TEST_DIR, 'nonexistent', 'ch-1')
    expect(result).toBeNull()
  })

  it('should handle separate reviews for different chapters', () => {
    const bookDir = path.join(TEST_DIR, 'book-5')
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })

    persistReview(TEST_DIR, 'book-5', 'ch-1', { overall_pass: true, feedbacks: [], merged_summary: 'OK' })
    persistReview(TEST_DIR, 'book-5', 'ch-2', { overall_pass: false, feedbacks: [], merged_summary: 'Fail' })

    const r1 = readReview(TEST_DIR, 'book-5', 'ch-1')
    const r2 = readReview(TEST_DIR, 'book-5', 'ch-2')
    expect(r1.overall_pass).toBe(true)
    expect(r2.overall_pass).toBe(false)
  })
})
