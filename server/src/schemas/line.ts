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

export const LineSchema = z.object({
  id: z.string(),
  speaker: z.string().optional(),
  text: z.string(),
  type: z.enum(['dialogue', 'action', 'thought', 'narration']).optional(),
  emotion: z.string().optional(),
  direction: DirectionSchema.optional(),
  voice: VoiceSchema.optional(),
}).transform((line) => ({
  ...line,
  type: line.type ?? (line.speaker ? 'dialogue' : 'narration'),
}))

export type Line = z.infer<typeof LineSchema>
export type Direction = z.infer<typeof DirectionSchema>
export type Voice = z.infer<typeof VoiceSchema>
