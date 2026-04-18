/* eslint-disable no-unused-vars */
// Shell component (Task 10) — placeholders for Tasks 11 (editor/save) and 17 (actions).
// Unused imports/state retained verbatim per plan so later tasks wire in without churn.
import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, RefreshCw, Send } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

export function ChapterWorkbench({ bookId, chapterId, chapterLabel, addToast, dataVersion }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)  // Agent is writing this chapter
  const [review, setReview] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [status, setStatus] = useState({ user_decision: null })

  const chNum = parseInt(chapterId.replace(/^ch/i, ''), 10) || 0

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [draftR, reviewR, annR, statusR] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(r => r.json()).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/review`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`).then(r => r.json()).catch(() => []),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).then(r => r.json()).catch(() => ({ user_decision: null })),
        ])
        if (cancelled) return
        setContent(draftR?.content ?? '')
        setReview(reviewR)
        setAnnotations(annR)
        setStatus(statusR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [bookId, chapterId, dataVersion])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={24} className="anim-spin" />
      </div>
    )
  }

  return (
    <div className="workbench" data-locked={locked}>
      {/* Left rail */}
      <aside className="workbench-rail">
        <span className="rail-label">Ch. {toRoman(chNum)}</span>
      </aside>

      {/* Main area */}
      <div className="workbench-main">
        {/* Top bar */}
        <div className="workbench-topbar">
          <div className="workbench-title">
            <span className="label-sc" style={{ color: 'var(--accent)' }}>Ch. {toRoman(chNum)}</span>
            <span className="display-heading">{chapterLabel}</span>
            {locked && <span className="workbench-writing-badge"><Loader size={12} className="anim-spin" /> Agent 写作中</span>}
          </div>
          <div className="workbench-actions">
            {/* Placeholder buttons — wired in Task 17 */}
            <button className="btn btn-sm"><Send size={12} /> 发送批注</button>
            <button className="btn btn-sm"><RefreshCw size={12} /> 再次送审</button>
            <button className="btn btn-sm"><Check size={12} /> 用户通过</button>
          </div>
        </div>

        {/* Editor placeholder (Task 11) */}
        <div className="workbench-editor">
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)' }}>
            {content || <em style={{ color: 'var(--ink-muted)' }}>（尚无草稿）</em>}
          </pre>
        </div>

        {/* Status bar */}
        <div className="workbench-statusbar">
          <span className="label-sc">{content.length} Words</span>
          <span className="label-sc">{status.user_decision ?? 'Draft'}</span>
        </div>
      </div>

      {/* Right feed placeholder (Task 12) */}
      <aside className="workbench-feed">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>── Marginalia ──</div>
        {review && review.feedbacks?.map((fb, i) => (
          <div key={i} style={{ marginTop: 8, fontSize: 11 }}>
            <strong>{fb.reviewer}</strong>: {fb.quick_comment}
          </div>
        ))}
        {annotations.map(a => (
          <div key={a.id} style={{ marginTop: 8, fontSize: 11 }}>
            <strong>我:</strong> {a.comment}
          </div>
        ))}
      </aside>
    </div>
  )
}
