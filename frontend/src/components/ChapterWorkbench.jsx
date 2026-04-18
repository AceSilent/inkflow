// Shell component (Task 10) + Milkdown editor + Ctrl+S save (Task 11).
// Remaining placeholders (batch actions) are wired in Task 17.
/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, RefreshCw, Send } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'
import { MilkdownEditor } from './workbench/MilkdownEditor'
import { CommentFeed } from './workbench/CommentFeed'

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
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/reviews`).then(r => r.ok ? r.json() : null).catch(() => null),
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

  // Manual save (Ctrl/Cmd+S) — posts current markdown to the draft PUT route.
  const handleSave = useCallback(async () => {
    if (!dirty) return
    try {
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (r.ok) {
        setDirty(false)
        addToast?.('已保存', 'success')
      } else {
        addToast?.('保存失败', 'error')
      }
    } catch {
      addToast?.('保存失败', 'error')
    }
  }, [dirty, content, bookId, chapterId, addToast])

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

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

        {/* Editor — Milkdown wrapper (Task 11). key remounts on chapter switch. */}
        <div className="workbench-editor">
          <MilkdownEditor
            key={chapterId}
            initial={content}
            readOnly={locked}
            onChange={(md) => { setContent(md); setDirty(true) }}
          />
        </div>

        {/* Status bar */}
        <div className="workbench-statusbar">
          <span className="label-sc">{content.length} Words</span>
          <span className="label-sc">{status.user_decision ?? 'Draft'}</span>
        </div>
      </div>

      {/* Right feed — unified CommentFeed (Task 12) */}
      <aside className="workbench-feed">
        <CommentFeed
          review={review}
          annotations={annotations}
          onJump={(_quote) => { /* TODO Task 13 */ }}
          onAdopt={(_item) => { /* TODO Task 13 */ }}
          onIgnore={(_id) => { /* TODO Task 13 */ }}
          onDelete={async (annId) => {
            await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations/${annId}`, { method: 'DELETE' })
            setAnnotations(prev => prev.filter(a => a.id !== annId))
          }}
          onSendBatch={() => { /* TODO Task 17 */ }}
        />
      </aside>
    </div>
  )
}
