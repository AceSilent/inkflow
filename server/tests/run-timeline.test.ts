import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  appendRunEvent,
  createRunId,
  loadRecentRuns,
  markRunInterruptedIfOpen,
  type RunTimelineEvent,
} from '../src/runs/run-timeline.js'

const TEST_DIR = path.join(process.cwd(), '__test_run_timeline__')

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true })
}

beforeEach(() => {
  cleanDir()
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => cleanDir())

describe('Run Timeline storage', () => {
  it('creates sortable run ids', () => {
    const id = createRunId()
    expect(id).toMatch(/^run_\d{8}T\d{6}_/)
  })

  it('appends JSONL events under the book runs directory', () => {
    const event: RunTimelineEvent = {
      runId: 'run_20260425T120000_test',
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'tool_start',
      status: 'running',
      label: '读取大纲',
      toolName: 'read_outline',
      inputPreview: '{}',
    }

    appendRunEvent(TEST_DIR, 'book-1', event)

    const file = path.join(TEST_DIR, 'book-1', 'runs', `${event.runId}.jsonl`)
    expect(fs.existsSync(file)).toBe(true)
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toEqual(event)
  })

  it('loads recent runs newest first with terminal status', () => {
    appendRunEvent(TEST_DIR, 'book-1', {
      runId: 'run_20260425T120000_old',
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'run_start',
      status: 'running',
      label: '开始',
    })
    appendRunEvent(TEST_DIR, 'book-1', {
      runId: 'run_20260425T120000_old',
      seq: 2,
      ts: '2026-04-25T12:00:01.000Z',
      type: 'run_done',
      status: 'done',
      label: '完成',
    })
    appendRunEvent(TEST_DIR, 'book-1', {
      runId: 'run_20260425T120100_new',
      seq: 1,
      ts: '2026-04-25T12:01:00.000Z',
      type: 'run_start',
      status: 'running',
      label: '开始',
    })

    const runs = loadRecentRuns(TEST_DIR, 'book-1', 2)

    expect(runs.map(r => r.runId)).toEqual(['run_20260425T120100_new', 'run_20260425T120000_old'])
    expect(runs[0].status).toBe('interrupted')
    expect(runs[1].status).toBe('done')
  })

  it('marks an open run as interrupted on recovery', () => {
    const runId = 'run_20260425T120000_open'
    appendRunEvent(TEST_DIR, 'book-1', {
      runId,
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'agent_loop_start',
      status: 'running',
      label: 'Agent 执行中',
    })

    const event = markRunInterruptedIfOpen(TEST_DIR, 'book-1', runId, 'process restarted')

    expect(event?.type).toBe('run_interrupted')
    const runs = loadRecentRuns(TEST_DIR, 'book-1', 1)
    expect(runs[0].status).toBe('interrupted')
    expect(runs[0].events.at(-1)?.message).toBe('process restarted')
  })
})
