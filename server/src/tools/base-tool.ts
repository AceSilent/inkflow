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

  listNames(): string[] {
    return [...this.tools.keys()]
  }
}
