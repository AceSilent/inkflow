export interface MemoryFrontmatter {
  id: string
  scope: 'user' | 'book' | 'session'
  type: string
  confidence: number
  tags: string[]
  source: 'auto_extract' | 'user_remember' | 'editorial_lesson' | 'context_compact'
  source_event?: string
  status: 'pending' | 'active' | 'archived'
  created_at: string
  approved_at?: string
  book_id?: string
}

export function parseMarkdownMemory(raw: string): { frontmatter: MemoryFrontmatter | null; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: null, body: raw }
  const [, fmRaw, body] = match
  const fm: Record<string, any> = {}
  for (const line of fmRaw.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value: any = line.slice(idx + 1).trim()
    // Array `[a, b, c]`
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean)
    }
    // Number
    else if (/^-?\d+\.?\d*$/.test(value)) value = Number(value)
    fm[key] = value
  }
  return { frontmatter: fm as MemoryFrontmatter, body: body.trimStart() }
}

export function serializeMarkdownMemory(fm: MemoryFrontmatter, body: string): string {
  const lines = ['---']
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined) continue
    if (Array.isArray(v)) lines.push(`${k}: [${v.join(', ')}]`)
    else lines.push(`${k}: ${v}`)
  }
  lines.push('---', '', body.trimStart())
  return lines.join('\n')
}

export function nanoId(prefix: string = 'mem'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
