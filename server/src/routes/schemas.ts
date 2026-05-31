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
  concept: z.string().max(10000).optional(),
  target_words: z.number().int().positive().max(10000000),
  source_session_id: z.string().min(1).max(128).optional(),
})

// ── Author-chat schemas ──

export const chatAttachmentSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().max(512 * 1024),
  content: z.string().max(512 * 1024),
  type: z.string().max(120).optional(),
})

export const sendChatBody = z.object({
  message: z.string().max(50000),
  attachments: z.array(chatAttachmentSchema).max(10).optional(),
  mode: z.enum(['brainstorm', 'author']).optional(),
  replace_message_id: z.string().min(1).max(200).optional(),
}).refine(
  value => value.message.trim().length > 0 || (value.attachments?.length ?? 0) > 0,
  { path: ['message'], message: 'message or attachments required' },
)

// ── Settings schemas ──

export const providerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().max(500),
  models: z.array(z.string().max(100)).min(0).max(50),
  kind: z.enum(['openai-compatible', 'gemini-openai-compatible']).optional(),
})

export const saveSettingsBody = z.object({
  providers: z.array(providerSchema).max(10),
  authorModel: z.string().max(200),
  editorModel: z.string().max(200),
  reviewerModels: z.record(z.string().max(100), z.string().max(200)).optional(),
  contextManager: z.enum(['auto', 'decay_only', 'disabled']).optional(),
  contextBudgetCustom: z.object({
    green: z.number().min(0).max(1).optional(),
    yellow: z.number().min(0).max(1).optional(),
    orange: z.number().min(0).max(1).optional(),
  }).optional(),
})

// ── Data schemas ──

export const chapterIdParam = z.object({
  bookId: z.string().min(1).max(128),
  chapterId: z.string().min(1).max(128),
})

export const outlineBody = z
  .object({
    id: z.string().max(128),
    label: z.string().max(500),
    type: z.literal('book'),
    children: z.array(z.any()).max(1000),
    epigraph: z.string().max(2000).optional(),
    synopsis: z.string().max(10000).optional(),
  })
  .passthrough()

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
  human_gate: z.object({
    pre_review_decision: z.enum(['approved', 'needs_revision', 'needs_machine_review']).optional(),
    post_review_decision: z.enum(['approved', 'needs_revision']).optional(),
    note: z.string().optional(),
  }).optional(),
  decided_at: z.string().optional(),
  note: z.string().optional(),
})
export type ChapterStatus = z.infer<typeof chapterStatusSchema>

export const setStatusBodySchema = z.object({
  user_decision: z.enum(['approved', 'rejected']).nullable(),
  gate: z.enum(['pre_review', 'post_review']).optional(),
  pre_review_decision: z.enum(['approved', 'needs_revision', 'needs_machine_review']).optional(),
  post_review_decision: z.enum(['approved', 'needs_revision']).optional(),
  note: z.string().optional(),
})

export const sendAnnotationsBodySchema = z.object({
  annotation_ids: z.array(z.string()).min(1),
  review_after_revision: z.enum(['none', 'failed_only', 'full']).optional().default('none'),
})

export const resubmitReviewBodySchema = z.object({
  review_scope: z.enum(['full', 'failed_only', 'targeted']).optional().default('full'),
  reviewers: z.array(z.enum([
    'editorial_lore',
    'editorial_causality',
  ])).optional(),
}).optional()

// ── Plot graph schemas ──

export const NODE_TYPES = ['event', 'setup', 'payoff', 'decision', 'turning_point', 'convergence'] as const
export const EDGE_TYPES = ['causes', 'triggers', 'enables', 'blocks', 'pays-off', 'parallel'] as const
export const NODE_STATUSES = ['draft', 'confirmed', 'pruned', 'alternative'] as const

export const plotNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  title: z.string(),
  description: z.string(),
  references: z.array(z.string()),
  characters: z.array(z.string()),
  status: z.enum(NODE_STATUSES),
  pruned_reason: z.string().optional(),
  created_at: z.string(),
})
export type PlotNode = z.infer<typeof plotNodeSchema>

export const plotEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  note: z.string().optional(),
})
export type PlotEdge = z.infer<typeof plotEdgeSchema>

export const addPlotNodeBodySchema = z.object({
  type: z.enum(NODE_TYPES),
  title: z.string().min(1),
  description: z.string().default(''),
  references: z.array(z.string()).default([]),
  characters: z.array(z.string()).default([]),
  status: z.enum(NODE_STATUSES).default('draft'),
})

export const addEdgeBodySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  note: z.string().optional(),
}).refine(v => v.from !== v.to, { message: 'self-loop not allowed (from === to)' })

export const updatePlotNodeBodySchema = plotNodeSchema.partial().omit({ id: true, created_at: true })
