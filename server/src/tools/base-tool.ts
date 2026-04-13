/**
 * BaseTool interface + ToolRegistry — Claude Code-inspired tool interface protocol.
 *
 * Every tool implements ToolDefinition. ToolRegistry replaces the if-elif dispatch chain.
 * The key integration point is `toVercelTools()` which converts all tools to Vercel AI SDK format.
 */
import { z } from 'zod'
import { tool, asSchema } from 'ai'

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
  // Args are validated at runtime by Vercel AI SDK via the Zod schema.
  // Using `any` because z.infer<z.ZodType> resolves to `unknown` in Zod v4,
  // which breaks destructured parameter patterns in tool implementations.
  execute: (args: any, ctx: ToolContext) => Promise<string>
}

/**
 * Hook return type for blocking interceptors. When `interceptToolCall` returns
 * a `BlockedToolCall`, the actual tool is NOT executed; the `message` is
 * returned to the LLM as if it were the tool's output. Use this for hard
 * policy gates (e.g. "must review previous chapter before writing next").
 */
export type BlockedToolCall = { block: true; message: string }
export type InterceptResult = BlockedToolCall | undefined | null | void

/**
 * Hooks fired around each tool invocation.
 *
 *  - beforeToolCall / afterToolCall / onToolError: fire-and-forget observers;
 *    thrown errors are swallowed so a misbehaving observer can't break the loop.
 *  - interceptToolCall: a gate. If any composed interceptor returns
 *    { block: true, message }, the tool is skipped and the message is fed back
 *    to the LLM as the tool result. First block wins.
 */
export interface ToolHooks {
  beforeToolCall?(name: string, args: any, ctx: ToolContext): void | Promise<void>
  interceptToolCall?(name: string, args: any, ctx: ToolContext): InterceptResult | Promise<InterceptResult>
  afterToolCall?(name: string, args: any, result: string, durationMs: number, ctx: ToolContext): void | Promise<void>
  onToolError?(name: string, args: any, err: unknown, durationMs: number, ctx: ToolContext): void | Promise<void>
}

/**
 * Compose multiple ToolHooks into one. Each registered callback runs in order;
 * the inner toVercelTools wrapper still swallows errors per-invocation.
 */
export function composeHooks(...all: (ToolHooks | undefined | null)[]): ToolHooks {
  const live = all.filter(Boolean) as ToolHooks[]
  return {
    beforeToolCall: async (name, args, ctx) => {
      for (const h of live) await h.beforeToolCall?.(name, args, ctx)
    },
    // First interceptor that returns { block: true } wins; later ones are skipped.
    interceptToolCall: async (name, args, ctx) => {
      for (const h of live) {
        const res = await h.interceptToolCall?.(name, args, ctx)
        if (res && (res as BlockedToolCall).block) return res
      }
      return undefined
    },
    afterToolCall: async (name, args, result, durationMs, ctx) => {
      for (const h of live) await h.afterToolCall?.(name, args, result, durationMs, ctx)
    },
    onToolError: async (name, args, err, durationMs, ctx) => {
      for (const h of live) await h.onToolError?.(name, args, err, durationMs, ctx)
    },
  }
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
   *
   * If `hooks` is provided, each execute is wrapped to fire before/after/error
   * observation callbacks. Hook failures are swallowed.
   */
  toVercelTools(ctx: ToolContext, hooks?: ToolHooks): Record<string, any> {
    const result: Record<string, any> = {}
    const fire = async (fn: (() => void | Promise<void>) | undefined) => {
      if (!fn) return
      try { await fn() } catch { /* observer must not break the loop */ }
    }
    for (const [name, def] of this.tools) {
      // AI SDK v6 requires `inputSchema` (FlexibleSchema), not raw Zod `parameters`.
      // `asSchema()` converts Zod → FlexibleSchema with jsonSchema + validate.
      result[name] = {
        description: def.description,
        inputSchema: asSchema(def.parameters),
        execute: async (args: any) => {
          await fire(() => hooks?.beforeToolCall?.(name, args, ctx))
          // Policy gate. If any interceptor returns { block: true, message },
          // skip execution and feed the message back to the LLM as the result.
          let blocked: BlockedToolCall | null = null
          try {
            const intercepted = await hooks?.interceptToolCall?.(name, args, ctx)
            if (intercepted && (intercepted as BlockedToolCall).block) {
              blocked = intercepted as BlockedToolCall
            }
          } catch { /* interceptor failure shouldn't break the tool */ }
          if (blocked) {
            const blockedResult = `[BLOCKED] ${blocked.message}`
            await fire(() => hooks?.afterToolCall?.(name, args, blockedResult, 0, ctx))
            return blockedResult
          }
          const start = Date.now()
          try {
            const out = await def.execute(args, ctx)
            await fire(() => hooks?.afterToolCall?.(name, args, out, Date.now() - start, ctx))
            return out
          } catch (err) {
            await fire(() => hooks?.onToolError?.(name, args, err, Date.now() - start, ctx))
            throw err
          }
        },
      }
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
