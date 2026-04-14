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
