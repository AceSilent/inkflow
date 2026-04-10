/**
 * BaseTool interface + ToolRegistry — Claude Code-inspired tool interface protocol.
 *
 * Every tool implements ToolDefinition. ToolRegistry replaces the if-elif dispatch chain.
 * The key integration point is `toVercelTools()` which converts all tools to Vercel AI SDK format.
 */
import { z } from 'zod'
import { tool } from 'ai'

export type PermissionLevel = 'read' | 'write' | 'destructive'

export interface ToolContext {
  bookId: string
  dataDir: string
  /** Current agent mode: 'brainstorm' | 'author' */
  mode?: string
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string
  description: string
  parameters: T
  permissionLevel: PermissionLevel
  isTerminal?: boolean
  execute: (args: z.infer<T>, ctx: ToolContext) => Promise<string>
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(def: ToolDefinition): void {
    this.tools.set(def.name, def)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  isTerminal(name: string): boolean {
    return this.tools.get(name)?.isTerminal ?? false
  }

  getWriteTools(): string[] {
    return [...this.tools.values()]
      .filter(t => t.permissionLevel === 'write' || t.permissionLevel === 'destructive')
      .map(t => t.name)
  }

  /** Read-only tools safe for concurrent execution. */
  getReadTools(): string[] {
    return [...this.tools.values()]
      .filter(t => t.permissionLevel === 'read')
      .map(t => t.name)
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const def = this.tools.get(name)
    if (!def) return `Error: Unknown tool ${name}`
    return def.execute(args, ctx)
  }

  /**
   * Convert all registered tools to Vercel AI SDK format.
   * This is the key integration point — replaces AUTHOR_TOOLS dict + while loop.
   */
  toVercelTools(ctx: ToolContext): Record<string, ReturnType<typeof tool>> {
    const result: Record<string, ReturnType<typeof tool>> = {}
    for (const [name, def] of this.tools) {
      result[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: async (args) => def.execute(args, ctx),
      })
    }
    return result
  }

  /** Build a tool summary string for prompt injection. */
  getToolSummary(): string {
    const categories: Record<string, string[]> = {
      '读取': [],
      '写入': [],
      '剧情树': [],
      '终端': [],
      '技能': [],
      '编辑部': [],
    }
    const categoryMap: Record<string, string> = {
      read_file: '读取', search_lore: '读取', read_outline: '读取',
      save_draft: '写入', save_outline: '写入', save_lore: '写入',
      read_tree: '剧情树', add_plot_node: '剧情树', confirm_path: '剧情树',
      prune_branch: '剧情树', merge_branches: '剧情树',
      submit_for_review: '终端', present_options: '终端', request_guidance: '终端',
      load_skill: '技能', list_skills: '技能',
      submit_to_editorial: '编辑部',
    }

    for (const name of this.tools.keys()) {
      const cat = categoryMap[name] ?? '其他'
      if (!categories[cat]) categories[cat] = []
      categories[cat].push(name)
    }

    return Object.entries(categories)
      .filter(([, tools]) => tools.length > 0)
      .map(([cat, tools]) => `${cat}: ${tools.join(', ')}`)
      .join('\n')
  }

  listNames(): string[] {
    return [...this.tools.keys()]
  }
}
