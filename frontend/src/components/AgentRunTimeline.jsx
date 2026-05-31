import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock3, Wrench, CheckCircle2, AlertTriangle, Loader, Ban } from 'lucide-react'

const statusColor = {
  running: '#3b82f6',
  done: '#16a34a',
  error: '#dc2626',
  timeout: '#d97706',
  aborted: '#6b7280',
  interrupted: '#d97706',
  pending: '#6b7280',
}

const REVIEWER_LABELS = {
  editorial_lore: '设定考据',
  editorial_pacing: '节奏结构',
  editorial_ai_tone: 'AI腔调',
  editorial_character: '角色动机',
  editorial_causality: '逻辑审核',
}

function reviewerLabel(reviewer) {
  return REVIEWER_LABELS[reviewer] || reviewer
}

function statusIcon(status) {
  if (status === 'running') return <Loader size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
  if (status === 'done') return <CheckCircle2 size={12} />
  if (status === 'aborted') return <Ban size={12} />
  if (status === 'error' || status === 'timeout' || status === 'interrupted') return <AlertTriangle size={12} />
  return <Clock3 size={12} />
}

function formatDuration(ms) {
  if (typeof ms !== 'number') return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function summarizeRun(run) {
  if (!run) return { status: 'pending', events: [] }
  const events = run.events || []
  const terminal = [...events].reverse().find(e => e.type === 'run_done' || e.type === 'run_error' || e.type === 'run_aborted' || e.type === 'run_interrupted')
  return {
    status: terminal?.status || run.status || (events.length > 0 ? 'running' : 'pending'),
    events,
  }
}

function normalizeEventForRunStatus(event, runStatus) {
  if ((runStatus === 'running' || runStatus === 'pending') || event.status !== 'running') return event
  if (event.type === 'agent_loop_start') {
    return {
      ...event,
      status: runStatus === 'done' ? 'done' : runStatus,
      label: runStatus === 'done' ? '模型与工具链完成' : '模型与工具链中断',
    }
  }
  // When the run is terminal but individual events are still 'running',
  // mark them as the run's final status so spinners stop.
  return { ...event, status: runStatus === 'done' ? 'done' : runStatus }
}

function annotateReviewRounds(events) {
  let reviewRound = 0
  return events.map(event => {
    if (event.type === 'tool_start' && event.toolName === 'submit_to_editorial') {
      reviewRound += 1
      return { ...event, reviewRound }
    }
    if (event.type === 'tool_done' && event.toolName === 'submit_to_editorial') {
      return { ...event, reviewRound: reviewRound || 1 }
    }
    if (isReviewerEvent(event)) {
      return { ...event, reviewRound: reviewRound || 1 }
    }
    return event
  })
}

function displayKey(event) {
  if (event.type === 'reviewer_start' || event.type === 'reviewer_done') {
    const reviewer = event.meta?.reviewer || event.toolName
    return reviewer ? `reviewer:${event.reviewRound || 1}:${reviewer}` : null
  }

  const lifecycleMatch = event.type?.match(/^(.+)_(start|done|timeout|error)$/)
  if (lifecycleMatch && !lifecycleMatch[1].startsWith('tool')) {
    return `lifecycle:${lifecycleMatch[1]}`
  }

  return null
}

function mergeDisplayEvents(events) {
  const merged = []
  const indexByKey = new Map()

  for (const event of events) {
    const key = displayKey(event)
    if (!key) {
      merged.push(event)
      continue
    }

    const existingIndex = indexByKey.get(key)
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length)
      merged.push(event)
      continue
    }

    const previous = merged[existingIndex]
    const startedAt = previous.startedAt || previous.ts
    merged[existingIndex] = {
      ...previous,
      ...event,
      startedAt,
      label: isReviewerEvent(event) ? event.label.replace('审稿人完成', '审稿人') : event.label,
    }
  }

  return merged
}

function isReviewerEvent(event) {
  return event.type === 'reviewer_start' || event.type === 'reviewer_done'
}

function displayLabel(event) {
  if (event.type === 'agent_loop_start') {
    if (event.status === 'running') return '模型与工具链运行中'
    if (event.status === 'done') return '模型与工具链完成'
    if (event.status === 'aborted' || event.status === 'interrupted') return '模型与工具链中断'
    if (event.status === 'error' || event.status === 'timeout') return '模型与工具链异常'
    return '模型与工具链开始'
  }
  if (event.type === 'agent_loop_done') return '模型与工具链完成'
  if (event.type === 'agent_loop_error') return '模型与工具链失败'
  if (!isReviewerEvent(event)) return event.label
  const reviewer = reviewerLabel(event.meta?.reviewer || event.toolName)
  const round = event.reviewRound ? `第${event.reviewRound}轮 · ` : ''
  if (event.status === 'running') return `${round}${reviewer}审稿中`
  if (event.status === 'done') return `${round}${reviewer}通过`
  return `${round}${reviewer}未过`
}

export function AgentRunTimeline({ currentRun, recentRuns = [], loading }) {
  const [expanded, setExpanded] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState({})

  const run = currentRun || recentRuns[0]
  const summary = useMemo(() => summarizeRun(run), [run])
  const events = useMemo(
    () => annotateReviewRounds(summary.events.map(event => normalizeEventForRunStatus(event, summary.status))),
    [summary.events, summary.status],
  )
  const displayEvents = useMemo(() => mergeDisplayEvents(events), [events])

  if (!run || events.length === 0) return null

  const isRunning = loading || summary.status === 'running'
  const title = isRunning ? '生成过程 · 运行中' : summary.status === 'interrupted' ? '生成过程 · 上次运行中断' : '生成过程 · 最近运行'
  const last = events[events.length - 1]
  const lastLabel = last ? displayLabel(last) : ''

  return (
    <div style={{
      margin: '10px 16px 0',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      background: 'var(--bg-elevated)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--ink)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ color: statusColor[summary.status] || 'var(--accent)', display: 'flex', alignItems: 'center' }}>{statusIcon(summary.status)}</span>
        <strong style={{ fontSize: 12 }}>{title}</strong>
        <span style={{ color: 'var(--ink-muted)', fontSize: 11, marginLeft: 'auto' }}>
          {displayEvents.length} 步 · {lastLabel}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '2px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {displayEvents.slice(-18).map((event) => {
            const isTool = event.type?.startsWith('tool_')
            const key = `${event.runId}-${event.seq}`
            const open = !!detailsOpen[key]
            const color = statusColor[event.status] || 'var(--ink-muted)'
            const hasDetail = event.inputPreview || event.outputPreview || event.error || event.durationMs
            const label = displayLabel(event)
            return (
              <div key={key} style={{
                borderLeft: `2px solid ${color}`,
                paddingLeft: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-secondary)' }}>
                  <span style={{ color, display: 'flex', alignItems: 'center' }}>{isTool ? <Wrench size={12} /> : statusIcon(event.status)}</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{label}</span>
                  {event.toolName && <code style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{isReviewerEvent(event) ? reviewerLabel(event.toolName) : event.toolName}</code>}
                  {event.durationMs !== undefined && <span style={{ color: 'var(--ink-muted)' }}>{formatDuration(event.durationMs)}</span>}
                  {hasDetail && (
                    <button
                      onClick={() => setDetailsOpen(prev => ({ ...prev, [key]: !prev[key] }))}
                      style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--ink-muted)', cursor: 'pointer', padding: 0 }}
                    >
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  )}
                </div>
                {event.message && <div style={{ fontSize: 10, color: 'var(--ink-muted)', paddingLeft: 18 }}>{event.message}</div>}
                {open && (
                  <div style={{
                    marginLeft: 18,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.04)',
                    fontSize: 10,
                    color: 'var(--ink-muted)',
                    lineHeight: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}>
                    {event.inputPreview && <div><strong>输入</strong>：{event.inputPreview}</div>}
                    {event.outputPreview && <div><strong>输出</strong>：{event.outputPreview}</div>}
                    {event.error && <div style={{ color: statusColor.error }}><strong>失败</strong>：{event.error}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
