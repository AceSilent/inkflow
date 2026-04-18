import { describe, it, expect } from 'vitest'
import {
  annotationSchema,
  createAnnotationSchema,
  updateAnnotationSchema,
  chapterStatusSchema,
  sendAnnotationsBodySchema,
} from '../src/routes/schemas.js'

describe('annotation schemas', () => {
  it('accepts a valid annotation', () => {
    const ok = {
      id: 'ann_abc',
      quote: '林舟摸出怀表',
      anchor_start: 12,
      anchor_end: 19,
      comment: '转场太硬',
      source: 'user' as const,
      status: 'open' as const,
      created_at: '2026-04-18T00:00:00Z',
    }
    expect(annotationSchema.parse(ok)).toEqual(ok)
  })

  it('rejects annotation with invalid status', () => {
    expect(() => annotationSchema.parse({
      id: 'ann_abc', quote: 'x', anchor_start: 0, anchor_end: 1,
      comment: 'y', source: 'user', status: 'invalid',
      created_at: '2026-04-18T00:00:00Z',
    })).toThrow()
  })

  it('createAnnotationSchema omits id/created_at/status', () => {
    const body = { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' as const }
    expect(createAnnotationSchema.parse(body)).toEqual(body)
  })

  it('chapterStatusSchema accepts user_decision null', () => {
    expect(chapterStatusSchema.parse({
      chapter_id: 'ch01',
      user_decision: null,
    })).toBeTruthy()
  })

  it('chapterStatusSchema accepts approved with decided_at', () => {
    expect(chapterStatusSchema.parse({
      chapter_id: 'ch01',
      user_decision: 'approved',
      decided_at: '2026-04-18T00:00:00Z',
      note: 'ok',
    })).toBeTruthy()
  })

  it('sendAnnotationsBodySchema requires non-empty annotation_ids', () => {
    expect(() => sendAnnotationsBodySchema.parse({ annotation_ids: [] })).toThrow()
    expect(sendAnnotationsBodySchema.parse({ annotation_ids: ['ann_1'] })).toBeTruthy()
  })
})
