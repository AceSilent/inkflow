// Unified comment feed — renders editorial review issues + user annotations
// with filter chips (all / open / high / mine) and severity-descending sort.
// Jump / adopt / ignore handlers are TODO stubs wired later in Task 13.
import { useState, useMemo } from 'react'

const REVIEWER_COLOR = {
  '设定审稿': 'var(--reviewer-lore)',
  '节奏审稿': 'var(--reviewer-pacing)',
  '文风审稿': 'var(--reviewer-ai-tone)',
  '角色审稿': 'var(--reviewer-character)',
  '因果审稿': 'var(--reviewer-causality)',
}

export function CommentFeed({ review, annotations, onJump, onAdopt, onIgnore, onDelete, onSendBatch }) {
  const [filter, setFilter] = useState('all')  // all | open | high | mine

  const items = useMemo(() => {
    const reviewItems = (review?.feedbacks ?? []).flatMap(fb =>
      (fb.issues ?? []).map(iss => ({
        kind: 'review',
        id: `${fb.reviewer}:${iss.quote ?? ''}:${iss.fix_instruction ?? ''}`,
        reviewer: fb.reviewer,
        severity: iss.severity,
        quote: iss.quote,
        text: iss.fix_instruction ?? iss.type,
        color: REVIEWER_COLOR[fb.reviewer] ?? 'var(--ink-secondary)',
      }))
    )
    const userItems = (annotations ?? []).map(a => ({
      kind: 'annotation',
      id: a.id,
      reviewer: a.source === 'adopted_review' ? `采纳·${a.source_reviewer ?? ''}` : '我',
      severity: null,
      quote: a.quote,
      text: a.comment,
      status: a.status,
      color: 'var(--reviewer-user)',
    }))
    return [...reviewItems, ...userItems]
  }, [review, annotations])

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filter === 'all') return true
      if (filter === 'open') return it.kind === 'annotation' && it.status === 'open'
      if (filter === 'high') return it.severity && it.severity >= 4
      if (filter === 'mine') return it.kind === 'annotation'
      return true
    }).sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
  }, [items, filter])

  const openAnnotationCount = (annotations ?? []).filter(a => a.status === 'open').length

  return (
    <div className="comment-feed">
      <div className="label-sc" style={{ color: 'var(--accent)', marginBottom: 8 }}>── Marginalia ──</div>

      <div className="comment-filter">
        {['all', 'open', 'high', 'mine'].map(k => (
          <button
            key={k}
            className={`filter-chip ${filter === k ? 'on' : ''}`}
            onClick={() => setFilter(k)}
          >{k === 'all' ? '全部' : k === 'open' ? '未处理' : k === 'high' ? '≥4' : '我的'}</button>
        ))}
      </div>

      {openAnnotationCount > 0 && (
        <button className="btn btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={onSendBatch}>
          📤 发送 {openAnnotationCount} 条批注给 Author
        </button>
      )}

      {filtered.map(it => (
        <div key={it.id} className="comment-card" style={{ borderLeft: `2px solid ${it.color}` }}>
          <div className="comment-author" style={{ color: it.color }}>
            {it.reviewer}
            {it.severity && <span className="comment-sev">sev {it.severity}</span>}
            {it.status && <span className="comment-status">· {it.status}</span>}
          </div>
          {it.quote && <div className="comment-quote">&quot;{it.quote}&quot;</div>}
          <div className="comment-text">{it.text}</div>
          <div className="comment-actions">
            {it.quote && <button onClick={() => onJump?.(it.quote)}>跳原文</button>}
            {it.kind === 'review' && <button onClick={() => onAdopt?.(it)}>采纳</button>}
            {it.kind === 'review' && <button onClick={() => onIgnore?.(it.id)}>忽略</button>}
            {it.kind === 'annotation' && <button onClick={() => onDelete?.(it.id)}>删除</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
