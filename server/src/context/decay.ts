import type { ModelMessage } from 'ai'
import type { MessageZones } from './zones.js'

export interface DecayRule {
  minChars: number
  placeholder: (args: any, length: number) => string
}

export const LARGE_RESULT_TOOLS: Record<string, DecayRule> = {
  read_file: {
    minChars: 10000,
    placeholder: (args, len) => `[read_file('${args?.path ?? '?'}'): ${len} chars, re-fetch via read_file() if needed]`,
  },
  read_outline: {
    minChars: 5000,
    placeholder: (_args, len) => `[read_outline: ${len} chars snapshot, re-fetch via read_outline()]`,
  },
  read_graph: {
    minChars: 8000,
    placeholder: (_args, len) => `[read_graph: ${len} chars DAG snapshot, re-fetch via read_graph()]`,
  },
  search_lore: {
    minChars: 4000,
    placeholder: (args, len) => `[search_lore('${args?.query ?? '?'}'): ${len} chars of matches, re-query if needed]`,
  },
}

export const PRESERVE_ALWAYS = new Set<string>([
  'submit_to_editorial',
  'save_draft',
  'save_outline',
  'save_lore',
  'confirm_path',
  'prune_branch',
  'query_unresolved_setups',
  'list_skills',
  'load_skill',
])

function isDecayed(text: string): boolean {
  return /^\[(?:read_file|read_outline|read_graph|search_lore)[^\]]*\]$/.test(text.trim())
}

function extractResultText(part: any): string {
  if (!part || part.type !== 'tool-result') return ''
  const output = part.output
  if (typeof output === 'string') return output
  if (output?.type === 'text') return typeof output.value === 'string' ? output.value : ''
  return typeof part.result === 'string' ? part.result : JSON.stringify(output ?? '')
}

function replaceResultText(part: any, newText: string): any {
  return {
    ...part,
    output: { type: 'text', value: newText },
  }
}

export function decayToolResults(
  messages: ModelMessage[],
  zones: MessageZones,
): ModelMessage[] {
  const warmSet = new Set(zones.warm)
  return messages.map(m => {
    if (!warmSet.has(m)) return m
    if (m.role !== 'tool' || !Array.isArray(m.content)) return m
    let changed = false
    const newContent = m.content.map((part: any) => {
      if (part?.type !== 'tool-result') return part
      const toolName = part.toolName
      if (PRESERVE_ALWAYS.has(toolName)) return part
      const rule = LARGE_RESULT_TOOLS[toolName]
      if (!rule) return part
      const text = extractResultText(part)
      if (text.length < rule.minChars) return part
      if (isDecayed(text)) return part
      const placeholder = rule.placeholder(part.args ?? {}, text.length)
      changed = true
      return replaceResultText(part, placeholder)
    })
    if (!changed) return m
    return { ...m, content: newContent }
  })
}
