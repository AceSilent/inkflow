import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'

export type RunEventStatus = 'pending' | 'running' | 'done' | 'error' | 'timeout' | 'aborted' | 'interrupted'

export interface RunTimelineEvent {
  runId: string
  seq: number
  ts: string
  type: string
  status: RunEventStatus
  label: string
  message?: string
  toolName?: string
  toolCallId?: string
  phase?: string
  inputPreview?: string
  outputPreview?: string
  durationMs?: number
  error?: string
  meta?: Record<string, unknown>
}

export interface RunTimelineSummary {
  runId: string
  startedAt: string
  endedAt?: string
  status: RunEventStatus
  events: RunTimelineEvent[]
}

const TERMINAL_TYPES = new Set(['run_done', 'run_error', 'run_aborted', 'run_interrupted'])

function runsDir(dataDir: string, bookId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  return path.join(dataDir, safeBook, 'runs')
}

function runFile(dataDir: string, bookId: string, runId: string): string {
  const safeRun = sanitizePathSegment(runId, 'runId')
  return path.join(runsDir(dataDir, bookId), `${safeRun}.jsonl`)
}

function compactTimestamp(date = new Date()): string {
  const iso = date.toISOString()
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
}

export function createRunId(date = new Date()): string {
  return `run_${compactTimestamp(date)}_${randomUUID().slice(0, 8)}`
}

export function appendRunEvent(dataDir: string, bookId: string, event: RunTimelineEvent): void {
  const dir = runsDir(dataDir, bookId)
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(
    runFile(dataDir, bookId, event.runId),
    JSON.stringify(event) + '\n',
    'utf8',
  )
}

function readEvents(file: string): RunTimelineEvent[] {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as RunTimelineEvent }
      catch { return null }
    })
    .filter((event): event is RunTimelineEvent => Boolean(event))
}

function summarizeRun(runId: string, events: RunTimelineEvent[]): RunTimelineSummary | null {
  if (events.length === 0) return null
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const first = sorted[0]
  const terminalEvent = [...sorted].reverse().find(e => TERMINAL_TYPES.has(e.type))
  return {
    runId,
    startedAt: first.ts,
    endedAt: terminalEvent?.ts,
    status: terminalEvent ? terminalEvent.status : 'interrupted',
    events: sorted,
  }
}

export function loadRecentRuns(dataDir: string, bookId: string, limit = 5): RunTimelineSummary[] {
  const dir = runsDir(dataDir, bookId)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.jsonl'))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, Math.max(0, limit))
    .map(name => {
      const runId = name.replace(/\.jsonl$/, '')
      return summarizeRun(runId, readEvents(path.join(dir, name)))
    })
    .filter((run): run is RunTimelineSummary => Boolean(run))
}

export function clearRunTimeline(dataDir: string, bookId: string): void {
  const dir = runsDir(dataDir, bookId)
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

export function clearRunsAfterCheckpointRestore(dataDir: string, bookId: string): void {
  clearRunTimeline(dataDir, bookId)
}

export function markRunInterruptedIfOpen(
  dataDir: string,
  bookId: string,
  runId: string,
  message = 'Run interrupted before a terminal event was written',
): RunTimelineEvent | null {
  const file = runFile(dataDir, bookId, runId)
  const events = readEvents(file)
  if (events.length === 0) return null
  if (TERMINAL_TYPES.has(events[events.length - 1].type)) return null
  const event: RunTimelineEvent = {
    runId,
    seq: Math.max(...events.map(e => e.seq)) + 1,
    ts: new Date().toISOString(),
    type: 'run_interrupted',
    status: 'interrupted',
    label: '运行已中断',
    message,
  }
  appendRunEvent(dataDir, bookId, event)
  return event
}
