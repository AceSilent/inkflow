// Unified comment feed — renders editorial review issues + user annotations
// with filter chips (all / open / high / mine) and severity-descending sort.
import { useState, useMemo } from 'react'

const REVIEWER_COLOR = {
  '设定审稿': 'var(--reviewer-lore)',
  '节奏审稿': 'var(--reviewer-pacing)',
  '文风审稿': 'var(--reviewer-ai-tone)',
  '角色审稿': 'var(--reviewer-character)',
  '因果审稿': 'var(--reviewer-causality)',
  editorial_lore: 'var(--reviewer-lore)',
  editorial_pacing: 'var(--reviewer-pacing)',
  editorial_ai_tone: 'var(--reviewer-ai-tone)',
  editorial_character: 'var(--reviewer-character)',
  editorial_causality: 'var(--reviewer-causality)',
  draft_self_check: 'var(--danger)',
}

const REVIEWER_LABELS = {
  editorial_lore: '设定考据',
  editorial_pacing: '节奏结构',
  editorial_ai_tone: 'AI腔调',
  editorial_character: '角色动机',
  editorial_causality: '逻辑审核',
  draft_self_check: '本地自检',
}

const STATUS_LABELS = {
  open: '人类批注待处理',
  sent: '已发送给作者',
  resolved: '已处理',
  ignored: '不采纳',
}

function reviewerLabel(reviewer) {
  return REVIEWER_LABELS[reviewer] || reviewer
}

function issueSeverity(issue) {
  return typeof issue?.severity === 'number' && issue.severity > 0 ? issue.severity : 3
}

function reviewerEffectivePass(fb) {
  const issues = fb.issues ?? []
  const maxSeverity = issues.reduce((max, issue) => Math.max(max, issueSeverity(issue)), 0)
  const weightedSeverity = issues.reduce((sum, issue) => sum + issueSeverity(issue), 0)
  return fb.pass_status !== false && maxSeverity < 4 && weightedSeverity < 8
}

export function CommentFeed({ review, annotations, onJump, onAdopt, onIgnore, onDelete, onSendBatch }) {
  const [filter, setFilter] = useState('all')  // all | open | high | mine
  const feedbacks = review?.feedbacks ?? []
  const failedReviewers = feedbacks.filter(fb => !reviewerEffectivePass(fb))
  const reviewIssueCount = feedbacks.reduce((sum, fb) => sum + (fb.issues?.length ?? 0), 0)
  const passWithNotes = review?.overall_pass && reviewIssueCount > 0

  const items = useMemo(() => {
    const reviewItems = (review?.feedbacks ?? []).flatMap(fb =>
      (fb.issues ?? []).map(iss => ({
        kind: 'review',
        id: `${fb.reviewer}:${iss.quote ?? ''}:${iss.fix_instruction ?? ''}`,
        reviewer: fb.reviewer,
        reviewerLabel: reviewerLabel(fb.reviewer),
        severity: iss.severity,
        quote: iss.quote,
        text: iss.type ? `${iss.type}：${iss.fix_instruction ?? ''}` : iss.fix_instruction,
        color: REVIEWER_COLOR[fb.reviewer] ?? 'var(--ink-secondary)',
      }))
    )
    const userItems = (annotations ?? []).map(a => ({
      kind: 'annotation',
      id: a.id,
      reviewer: a.source === 'adopted_review' ? `采纳·${a.source_reviewer ?? ''}` : '我',
      reviewerLabel: a.source === 'adopted_review' ? `采纳·${reviewerLabel(a.source_reviewer)}` : '我',
      severity: null,
      quote: a.quote,
      text: a.comment,
      status: a.status,
      statusLabel: STATUS_LABELS[a.status] || a.status,
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

      {review && (
        <div className="comment-card" style={{
          borderLeft: `2px solid ${passWithNotes ? 'var(--warning)' : review.overall_pass ? 'var(--success)' : 'var(--danger)'}`,
          marginBottom: 8,
        }}>
          <div className="comment-author" style={{ color: passWithNotes ? 'var(--warning)' : review.overall_pass ? 'var(--success)' : 'var(--danger)' }}>
            审稿总览
            <span className="comment-status">· {passWithNotes ? `PASS · 有 ${reviewIssueCount} 条备注` : review.overall_pass ? 'PASS' : 'FAIL'}</span>
            {review.revision_round && <span className="comment-status">· 第 {review.revision_round} 轮</span>}
          </div>
          <div className="comment-text" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {feedbacks.map(fb => (
              <span
                key={fb.reviewer}
                title={fb.quick_comment ?? ''}
                style={{
                  color: reviewerEffectivePass(fb) ? 'var(--success)' : 'var(--danger)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 11,
                }}
              >
                {reviewerEffectivePass(fb) ? '✓' : '✕'} {reviewerLabel(fb.reviewer)}
              </span>
            ))}
          </div>
          {!review.overall_pass && failedReviewers.length > 0 && (
            <div className="comment-text" style={{ marginTop: 6 }}>
              未通过：{failedReviewers.map(fb => reviewerLabel(fb.reviewer)).join('、')}
            </div>
          )}
          {passWithNotes && (
            <div className="comment-text" style={{ marginTop: 6, color: 'var(--warning)' }}>
              已通过；下方为非阻塞优化建议。可以忽略、采纳为批注，或由人类退回后要求修改。
            </div>
          )}
        </div>
      )}

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
          发送 {openAnnotationCount} 条批注给 Author
        </button>
      )}

      {filtered.map(it => (
        <div key={it.id} className="comment-card" style={{ borderLeft: `2px solid ${it.color}` }}>
          <div className="comment-author" style={{ color: it.color }}>
            {it.reviewerLabel}
            {it.severity && <span className={`comment-sev ${it.severity < 4 ? 'minor' : ''}`}>{it.severity < 4 ? '建议' : 'sev'} {it.severity}</span>}
            {it.status && <span className="comment-status">· {it.statusLabel}</span>}
          </div>
          {it.quote && <div className="comment-quote">&quot;{it.quote}&quot;</div>}
          <div className="comment-text">{it.text}</div>
          <div className="comment-actions">
            {it.quote && <button onClick={() => onJump?.(it.quote)}>定位原文</button>}
            {it.kind === 'review' && <button onClick={() => onAdopt?.(it)}>采纳</button>}
            {it.kind === 'review' && <button onClick={() => onIgnore?.(it.id)}>忽略</button>}
            {it.kind === 'annotation' && <button onClick={() => onDelete?.(it.id)}>删除</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
