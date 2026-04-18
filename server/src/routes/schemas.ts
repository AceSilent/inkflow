/**
 * Route Schemas — Zod validation for all API request bodies and params.
 */
import { z } from 'zod'

// ── Book schemas ──

export const bookIdParam = z.object({
  bookId: z.string().min(1).max(128),
})

export const createBookBody = z.object({
  book_id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  genre: z.string().min(1).max(50),
  tone: z.string().min(1).max(50),
  target_words: z.number().int().positive().max(10000000),
})

// ── Author-chat schemas ──

export const sendChatBody = z.object({
  message: z.string().min(1).max(50000),
  mode: z.enum(['brainstorm', 'author']).optional(),
})

// ── Settings schemas ──

export const providerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().max(500),
  models: z.array(z.string().max(100)).min(0).max(50),
})

export const saveSettingsBody = z.object({
  providers: z.array(providerSchema).max(10),
  authorModel: z.string().max(200),
  editorModel: z.string().max(200),
})

// ── Data schemas ──

export const chapterIdParam = z.object({
  bookId: z.string().min(1).max(128),
  chapterId: z.string().min(1).max(128),
})

export const outlineBody = z.object({
  id: z.string().max(128),
  label: z.string().max(500),
  type: z.literal('book'),
  children: z.array(z.any()).max(1000),
})

// ── Workbench schemas ──

export const annotationSchema = z.object({
  id: z.string().min(1),
  quote: z.string(),
  anchor_start: z.number().int().nonnegative(),
  anchor_end: z.number().int().nonnegative(),
  comment: z.string(),
  source: z.enum(['user', 'adopted_review']),
  source_reviewer: z.string().optional(),
  status: z.enum(['open', 'sent', 'resolved', 'ignored']),
  sent_batch_id: z.string().optional(),
  created_at: z.string(),
  sent_at: z.string().optional(),
  resolved_at: z.string().optional(),
})
export type Annotation = z.infer<typeof annotationSchema>

export const createAnnotationSchema = annotationSchema.omit({
  id: true,
  status: true,
  created_at: true,
  sent_batch_id: true,
  sent_at: true,
  resolved_at: true,
})

export const updateAnnotationSchema = annotationSchema.partial().omit({ id: true, created_at: true })

export const chapterStatusSchema = z.object({
  chapter_id: z.string().regex(/^ch\d{1,4}$/i),
  user_decision: z.enum(['approved', 'rejected']).nullable(),
  decided_at: z.string().optional(),
  note: z.string().optional(),
})
export type ChapterStatus = z.infer<typeof chapterStatusSchema>

export const setStatusBodySchema = z.object({
  user_decision: z.enum(['approved', 'rejected']).nullable(),
  note: z.string().optional(),
})

export const sendAnnotationsBodySchema = z.object({
  annotation_ids: z.array(z.string()).min(1),
})
