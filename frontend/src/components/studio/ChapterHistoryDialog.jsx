import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, History, Loader, Minus, Plus, RotateCcw, X } from 'lucide-react'

const actorLabels = {
  user: '你',
  agent: '作者 Agent',
  system: '系统',
  legacy: '历史版本',
}

function formatRevisionTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function visibleChangeLines(change) {
  if (change.type !== 'equal' || change.lines.length <= 10) {
    return change.lines.map((text, index) => ({ text, index }))
  }
  return [
    ...change.lines.slice(0, 4).map((text, index) => ({ text, index })),
    { text: `未改动 ${change.lines.length - 8} 行`, omitted: true, index: 4 },
    ...change.lines.slice(-4).map((text, index) => ({
      text,
      index: change.lines.length - 4 + index,
    })),
  ]
}

export function ChapterHistoryDialog({
  open,
  bookId,
  chapterId,
  currentHash,
  onClose,
  onRestored,
  addToast,
}) {
  const [revisions, setRevisions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!bookId || !chapterId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/history`)
      if (!response.ok) throw new Error('history load failed')
      const body = await response.json()
      const next = Array.isArray(body.revisions) ? body.revisions : []
      setRevisions(next)
      setSelectedId(current => (
        next.some(revision => revision.id === current)
          ? current
          : next.find(revision => revision.is_current)?.id ?? next[0]?.id ?? ''
      ))
    } catch {
      addToast?.('版本历史读取失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast, bookId, chapterId])

  useEffect(() => {
    if (!open) return
    setDiff(null)
    loadHistory()
  }, [loadHistory, open])

  const selectedIndex = useMemo(
    () => revisions.findIndex(revision => revision.id === selectedId),
    [revisions, selectedId]
  )
  const selected = selectedIndex >= 0 ? revisions[selectedIndex] : null
  const comparisonBase = selected
    ? revisions.find(revision => revision.id === selected.parent_revision_id)
      ?? revisions[selectedIndex + 1]
      ?? null
    : null

  useEffect(() => {
    if (!open || !selected || !comparisonBase) {
      setDiff(null)
      return
    }
    let cancelled = false
    setDiffLoading(true)
    const query = new URLSearchParams({
      from: comparisonBase.id,
      to: selected.id,
    })
    fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/diff?${query}`)
      .then(response => {
        if (!response.ok) throw new Error('diff load failed')
        return response.json()
      })
      .then(body => {
        if (!cancelled) setDiff(body)
      })
      .catch(() => {
        if (!cancelled) setDiff(null)
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, chapterId, comparisonBase?.id, open, selected?.id])

  const handleRestore = useCallback(async () => {
    if (!selected || selected.is_current || restoring) return
    if (!window.confirm(`恢复到 ${formatRevisionTime(selected.created_at)} 的版本？当前正文会先保留在历史中。`)) return

    setRestoring(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision_id: selected.id,
          expected_hash: currentHash,
        }),
      })
      const body = await response.json().catch(() => null)
      if (response.status === 409) {
        addToast?.('正文刚被其他操作更新，请重新查看版本历史', 'info')
        await loadHistory()
        return
      }
      if (!response.ok) throw new Error(body?.error ?? 'restore failed')
      await onRestored?.(body)
      addToast?.('已恢复为一个新版本', 'success')
      await loadHistory()
    } catch {
      addToast?.('版本恢复失败', 'error')
    } finally {
      setRestoring(false)
    }
  }, [
    addToast,
    bookId,
    chapterId,
    currentHash,
    loadHistory,
    onRestored,
    restoring,
    selected,
  ])

  if (!open) return null

  return createPortal((
    <div className="chapter-history-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="chapter-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="章节版本历史"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="chapter-history-head">
          <div>
            <span className="chapter-history-eyebrow">章节正文</span>
            <h3><History size={17} />版本历史</h3>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} title="关闭版本历史">
            <X size={16} />
          </button>
        </header>

        <div className="chapter-history-body">
          <nav className="chapter-history-list" aria-label="正文版本">
            {loading ? (
              <div className="chapter-history-empty">
                <Loader size={16} className="anim-spin" />
                正在读取
              </div>
            ) : revisions.length === 0 ? (
              <div className="chapter-history-empty">保存下一次修改后会生成版本记录</div>
            ) : revisions.map(revision => (
              <button
                className={`chapter-history-item ${revision.id === selectedId ? 'active' : ''}`}
                type="button"
                key={revision.id}
                onClick={() => setSelectedId(revision.id)}
              >
                <span className="chapter-history-item-main">
                  <strong>{actorLabels[revision.actor] ?? '历史版本'}</strong>
                  <time>{formatRevisionTime(revision.created_at)}</time>
                </span>
                <span className="chapter-history-item-meta">
                  {revision.is_current ? (
                    <><Check size={11} />当前</>
                  ) : revision.source === 'restore' ? (
                    '恢复'
                  ) : (
                    `${revision.chars} 字`
                  )}
                </span>
              </button>
            ))}
          </nav>

          <div className="chapter-history-diff">
            {selected && (
              <div className="chapter-history-diff-head">
                <div>
                  <strong>{actorLabels[selected.actor] ?? '历史版本'}的修改</strong>
                  <span>
                    {comparisonBase
                      ? `${formatRevisionTime(comparisonBase.created_at)} → ${formatRevisionTime(selected.created_at)}`
                      : formatRevisionTime(selected.created_at)}
                  </span>
                </div>
                <div className="chapter-history-diff-actions">
                  {diff && (
                    <span className="chapter-history-diff-stat">
                      <b className="added">+{diff.additions}</b>
                      <b className="removed">-{diff.deletions}</b>
                    </span>
                  )}
                  {!selected.is_current && (
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={handleRestore}
                      disabled={restoring}
                    >
                      {restoring ? <Loader size={13} className="anim-spin" /> : <RotateCcw size={13} />}
                      恢复此版本
                    </button>
                  )}
                </div>
              </div>
            )}

            {diffLoading ? (
              <div className="chapter-history-empty">
                <Loader size={16} className="anim-spin" />
                正在比较
              </div>
            ) : !comparisonBase ? (
              <div className="chapter-history-empty">这是目前可见的最早版本</div>
            ) : !diff ? (
              <div className="chapter-history-empty">暂时无法比较这两个版本</div>
            ) : (
              <div className="chapter-history-diff-content" aria-label="正文修改内容">
                {diff.changes.flatMap((change, groupIndex) => (
                  visibleChangeLines(change).map(line => (
                    <div
                      className={`chapter-history-diff-line ${change.type} ${line.omitted ? 'omitted' : ''}`}
                      key={`${groupIndex}:${line.index}`}
                    >
                      <span className="chapter-history-diff-mark" aria-hidden="true">
                        {line.omitted
                          ? ''
                          : change.type === 'add'
                            ? <Plus size={11} />
                            : change.type === 'remove'
                              ? <Minus size={11} />
                              : ''}
                      </span>
                      <span>{line.text || '\u00a0'}</span>
                    </div>
                  ))
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  ), document.body)
}
