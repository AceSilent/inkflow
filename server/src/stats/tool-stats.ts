/**
 * Tool-call statistics — persisted per-book at agent_stats.json.
 *
 * Implements ToolHooks to passively count tool/skill invocations for the UI.
 * Read-modify-write per call is fine for our traffic; one process per book.
 */
import fs from 'fs'
import path from 'path'
import { type ToolHooks } from '../tools/base-tool.js'

export interface ToolStat {
  call_count: number
  error_count: number
  total_ms: number
  last_called_at: string
  /** For tools whose primary arg is a name (e.g. load_skill), per-name counts. */
  by_arg?: Record<string, number>
}

export type ToolStatsMap = Record<string, ToolStat>

export function statsPath(dataDir: string, bookId: string): string {
  return path.join(dataDir, bookId, 'agent_stats.json')
}

export function loadStats(dataDir: string, bookId: string): ToolStatsMap {
  const p = statsPath(dataDir, bookId)
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ToolStatsMap
  } catch {
    return {}
  }
}

function saveStats(dataDir: string, bookId: string, stats: ToolStatsMap): void {
  const p = statsPath(dataDir, bookId)
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(stats, null, 2), 'utf-8')
}

function emptyStat(): ToolStat {
  return { call_count: 0, error_count: 0, total_ms: 0, last_called_at: '' }
}

/** Tools whose primary `name` arg is worth breaking out (e.g. load_skill → which skill). */
const ARG_BREAKDOWN: Record<string, string> = {
  load_skill: 'name',
  submit_to_editorial: 'chapter_id',
}

export function createStatsHooks(dataDir: string, bookId: string): ToolHooks {
  return {
    afterToolCall(name, args, _result, durationMs) {
      const stats = loadStats(dataDir, bookId)
      const s = stats[name] ?? emptyStat()
      s.call_count += 1
      s.total_ms += durationMs
      s.last_called_at = new Date().toISOString()
      const argKey = ARG_BREAKDOWN[name]
      if (argKey && typeof args?.[argKey] === 'string') {
        s.by_arg = s.by_arg ?? {}
        const v = args[argKey] as string
        s.by_arg[v] = (s.by_arg[v] ?? 0) + 1
      }
      stats[name] = s
      saveStats(dataDir, bookId, stats)
    },
    onToolError(name, _args, _err, durationMs) {
      const stats = loadStats(dataDir, bookId)
      const s = stats[name] ?? emptyStat()
      s.call_count += 1
      s.error_count += 1
      s.total_ms += durationMs
      s.last_called_at = new Date().toISOString()
      stats[name] = s
      saveStats(dataDir, bookId, stats)
    },
  }
}
