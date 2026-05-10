/**
 * Rule: block Agent save_draft on chapter N while the user is actively editing
 * that chapter in the workbench.
 *
 * The workbench writes `04_Drafts/workbench_lock_{chId}` with the current ISO
 * timestamp on focus/keystroke; this hook refuses `save_draft` calls that
 * target the same chapter while that lock is fresh (<= 10 minutes old).
 *
 * Stale locks (> 10 minutes, e.g. tab closed without unlock) are cleaned up
 * and treated as absent — the Agent is allowed to proceed.
 *
 * Hook shape:
 *   `{ interceptToolCall({ toolName, args }) => Promise<string | null> }`
 * — distinct from the ToolHooks composition shape. agent-loop.ts adapts it
 * into the ToolHooks chain.
 */
import fs from 'fs'
import path from 'path'

interface HookArgs { toolName: string; args: any }
interface Hook {
  interceptToolCall?: (args: HookArgs) => Promise<string | null>
}

const STALE_MS = 10 * 60 * 1000 // 10 minutes

export function blockWhileUserEditing(bookDir: string): Hook {
  return {
    async interceptToolCall({ toolName, args }: HookArgs): Promise<string | null> {
      if (toolName !== 'save_draft') return null
      const filePath = args?.file_path
      if (!filePath || typeof filePath !== 'string') return null
      const base = path.basename(filePath)
      const match = base.match(/^(ch\d{1,4})\.md$/i)
      if (!match) return null
      const chId = match[1]
      const lockFile = path.join(bookDir, '04_Drafts', `workbench_lock_${chId}`)
      if (!fs.existsSync(lockFile)) return null
      try {
        const content = fs.readFileSync(lockFile, 'utf8').trim()
        const ts = Date.parse(content)
        if (isNaN(ts)) return null
        if (Date.now() - ts > STALE_MS) {
          try { fs.unlinkSync(lockFile) } catch { /* ignore */ }
          return null
        }
        return `Error: User is currently editing ${chId}. Please wait or ask the user to save/discard their changes before retrying.`
      } catch {
        return null
      }
    },
  }
}
