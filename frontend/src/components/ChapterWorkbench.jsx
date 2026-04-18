// Shell component (Task 10) + Milkdown editor + Ctrl+S save (Task 11).
// Remaining placeholders (batch actions) are wired in Task 17.
/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader, Check, RefreshCw, Send } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { useWorkbenchSSE } from '../hooks/useWorkbenchSSE'
import { toRoman } from '../utils/roman'
import { MilkdownEditor } from './workbench/MilkdownEditor'
import { CommentFeed } from './workbench/CommentFeed'
import { AnnotationPopover } from './workbench/AnnotationPopover'
import { DiffModal } from './workbench/DiffModal'

export function ChapterWorkbench({ bookId, chapterId, chapterLabel, addToast, dataVersion }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)  // Agent is writing this chapter
  const [review, setReview] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [status, setStatus] = useState({ user_decision: null })
  // Task 13 — selection-driven popover state: {text, start, end, anchor:{x,y}}
  const [selection, setSelection] = useState(null)
  // Task 16 — track the last Agent-authored edit so we can show a banner +
  // diff modal. `recentAgentEdit = { rev, oldText }`.
  const [recentAgentEdit, setRecentAgentEdit] = useState(null)
  const [diffOpen, setDiffOpen] = useState(false)
  // Ref mirror of `content` — the SSE callback captures a stale closure
  // otherwise; the ref gives us the latest value without re-subscribing.
  const contentRef = useRef('')
  useEffect(() => { contentRef.current = content }, [content])

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

  // Task 13 — detect text selections inside `.workbench-editor` and surface
  // a popover anchored to the bottom of the selection rect. Markdown source
  // offsets are out-of-scope for MVP (see plan Risk 1) — anchor_start/end = 0.
  useEffect(() => {
    function onSelChange() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null)
        return
      }
      const range = sel.getRangeAt(0)
      const editorEl = document.querySelector('.workbench-editor')
      if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) {
        setSelection(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const editorRect = editorEl.getBoundingClientRect()
      setSelection({
        text: sel.toString(),
        start: 0,
        end: 0,
        anchor: {
          x: rect.left - editorRect.left,
          y: rect.bottom - editorRect.top + 4,
        },
      })
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  // Task 14 — SSE stub: placeholder for Agent write events. Currently a no-op
  // (see hook source). Real locked-state is flipped manually in Task 17.
  useWorkbenchSSE({
    bookId,
    chapterId,
    onChapterWriteStart: () => setLocked(true),
    onChapterWriteDone: async () => {
      // Use the ref to dodge the stale-closure on `content`.
      const prevContent = contentRef.current
      setLocked(false)
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(x => x.json()).catch(() => null)
      const newContent = r?.content ?? ''
      setContent(newContent)
      if (prevContent && prevContent !== newContent) {
        setRecentAgentEdit({ rev: Date.now() % 1000, oldText: prevContent })
      }
    },
    onOtherChapterWrite: (otherChId) => {
      addToast?.(`Author 正在写 ${otherChId} → [点此跳转]`, 'info')
    },
  })

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

        {/* Task 16 — banner shown after an Agent-authored save overwrites the
            chapter. Clicking "查看修改" opens the DiffModal below. */}
        {recentAgentEdit && (
          <div className="workbench-banner">
            Agent 刚改了此章（第 {recentAgentEdit.rev} 版） ·
            <button onClick={() => setDiffOpen(true)} style={{ marginLeft: 8 }}>查看修改</button>
            <button onClick={() => setRecentAgentEdit(null)} style={{ marginLeft: 8 }}>忽略</button>
          </div>
        )}
        <DiffModal
          open={diffOpen}
          oldText={recentAgentEdit?.oldText}
          newText={content}
          onClose={() => setDiffOpen(false)}
        />

        {/* Editor — Milkdown wrapper (Task 11). key remounts on chapter switch.
            `.workbench-editor` has `position: relative` so the popover can
            anchor against it (Task 13). */}
        <div className="workbench-editor">
          <MilkdownEditor
            key={chapterId}
            initial={content}
            readOnly={locked}
            onChange={(md) => { setContent(md); setDirty(true) }}
          />
          {selection && (
            <AnnotationPopover
              anchor={selection.anchor}
              selectedText={selection.text}
              onCancel={() => setSelection(null)}
              onSubmit={async (comment) => {
                const body = {
                  quote: selection.text,
                  anchor_start: selection.start,
                  anchor_end: selection.end,
                  comment,
                  source: 'user',
                }
                const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
                if (r.ok) {
                  const created = await r.json()
                  setAnnotations(prev => [...prev, created])
                  setSelection(null)
                  addToast?.('批注已保存', 'success')
                }
              }}
            />
          )}
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
