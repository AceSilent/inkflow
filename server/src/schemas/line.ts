import { z } from 'zod'

export const DirectionSchema = z.object({
  bgm: z.string().optional(),
  sfx: z.string().optional(),
  bg: z.string().optional(),
  shake: z.boolean().optional(),
  flash: z.string().optional(),
  wait: z.number().optional(),
})

export const VoiceSchema = z.object({
  tone: z.string().optional(),
  audio: z.string().optional(),
})

export const ReviewNoteSchema = z.object({
  author: z.string().optional(),
  text: z.string(),
  status: z.enum(['open', 'resolved']).default('open'),
})

export const LineSchema = z.object({
  id: z.string(),
  loc_key: z.string().optional(),
  loc_state: z.enum(['draft', 'review', 'approved']).default('draft'),
  speaker: z.string().optional(),
  text: z.string(),
  type: z.enum(['dialogue', 'action', 'thought', 'narration']).optional(),
  intent: z.string().optional(),
  subtext: z.string().optional(),
  emotion: z.string().optional(),
  direction: DirectionSchema.optional(),
  voice: VoiceSchema.optional(),
  notes: z.array(ReviewNoteSchema).default([]),
  tags: z.array(z.string()).default([]),
}).transform((line) => ({
  ...line,
  loc_key: line.loc_key ?? line.id,
  type: line.type ?? (line.speaker ? 'dialogue' : 'narration'),
}))

export type Line = z.infer<typeof LineSchema>
export type Direction = z.infer<typeof DirectionSchema>
export type Voice = z.infer<typeof VoiceSchema>
export type ReviewNote = z.infer<typeof ReviewNoteSchema>
