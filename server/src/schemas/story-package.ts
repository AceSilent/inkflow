import { z } from 'zod'
import { StageSchema } from './stage.js'

const defaultEntryTrigger = {
  chance: 0,
  conditions: {},
  requires_zones: [],
  min_realm_index: 0,
  excluded_by: [],
  required_flags: [],
}

export const EntryTriggerSchema = z.object({
  chance: z.number().default(0),
  conditions: z.record(z.string(), z.unknown()).default({}),
  requires_zones: z.array(z.string()).default([]),
  min_realm_index: z.number().default(0),
  excluded_by: z.array(z.string()).default([]),
  required_flags: z.array(z.string()).default([]),
}).default(defaultEntryTrigger)

export const StoryPackageSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  name: z.string(),
  author: z.string(),
  tags: z.array(z.string()).default([]),
  source_locale: z.string().default('zh-CN'),
  locales: z.array(z.string()).default(['zh-CN']),
  engine: z.string().optional(),
  export_targets: z.array(z.string()).default([]),
  variables: z.record(z.string(), z.unknown()).default({}),
  assets: z.record(z.string(), z.unknown()).default({}),
  motif: z.string(),
  tier: z.enum(['short', 'medium', 'long']),
  repeatable: z.boolean().default(false),
  description: z.string(),
  entry_trigger: EntryTriggerSchema,
  stages: z.array(StageSchema).min(1),
  rewards: z.record(z.string(), z.array(z.unknown())).default({}),
  world_impact: z.record(z.string(), z.unknown()).default({}),
})

export type StoryPackage = z.infer<typeof StoryPackageSchema>
