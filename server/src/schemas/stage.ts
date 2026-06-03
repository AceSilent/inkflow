import { z } from 'zod'
import { LineSchema } from './line.js'

export const ChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  next_stage: z.string(),
  requirements: z.record(z.string(), z.string()).optional(),
  conditions: z.record(z.string(), z.unknown()).default({}),
  effects: z.record(z.string(), z.unknown()).default({}),
})

export const StageSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  review_state: z.enum(['draft', 'review', 'approved']).default('draft'),
  lines: z.array(LineSchema).min(1),
  choices: z.array(ChoiceSchema).default([]),
  advance_next: z.string().optional(),
  is_terminal: z.boolean().default(false),
  conditions: z.record(z.string(), z.unknown()).default({}),
  effects: z.record(z.string(), z.unknown()).default({}),
  rewards: z.array(z.unknown()).optional(),
  timeout: z.unknown().optional(),
  prerequisites: z.record(z.string(), z.string()).optional(),
}).transform((stage) => ({
  ...stage,
  is_terminal: stage.is_terminal || (stage.choices.length === 0 && !stage.advance_next),
}))

export type Stage = z.infer<typeof StageSchema>
export type Choice = z.infer<typeof ChoiceSchema>
