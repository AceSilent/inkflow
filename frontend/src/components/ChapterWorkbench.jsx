// Shell component (Task 10) + Milkdown editor + Ctrl+S save (Task 11).
// Remaining placeholders (batch actions) are wired in Task 17.
/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Loader, Check, RefreshCw, Send } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'
import { MilkdownEditor } from './workbench/MilkdownEditor'
import { CommentFeed } from './workbench/CommentFeed'
import { AnnotationPopover } from './workbench/AnnotationPopover'
import { DiffModal } from './workbench/DiffModal'
import { ApprovalConfirmModal } from './workbench/ApprovalConfirmModal'

const MIN_REVIEW_CHARS = 2500

function normalizeReviewPayload(review) {
  if (!review) return null
  const feedbacks = review.feedbacks ?? []
  const hasPersistedReviewSignal =
    typeof review.overall_pass === 'boolean' ||
    review.merged_summary ||
    review.revision_strategy ||
    review.revision_round ||
    feedbacks.length > 0
  return hasPersistedReviewSignal ? review : null
}

export function ChapterWorkbench({ bookId, chapterId, chapterLabel, addToast, dataVersion }) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [locked, setLocked] = useState(false)  // Agent is writing this chapter
  const [review, setReview] = useState(null)
  const [selfCheckReview, setSelfCheckReview] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [status, setStatus] = useState({ user_decision: null })
  // Task 13 — selection-driven popover state: {text, start, end, anchor:{x,y}}
  const [selection, setSelection] = useState(null)
  // Task 16 — track the last Agent-authored edit so we can show a banner +
  // diff modal. `recentAgentEdit = { rev, oldText }`.
  const [recentAgentEdit, setRecentAgentEdit] = useState(null)
  const [diffOpen, setDiffOpen] = useState(false)
  // Task 17 — approval confirm modal visibility (prompts when there are still
  // open annotations at the moment the user clicks "用户通过").
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [reviewAfterRevision, setReviewAfterRevision] = useState('none')
  const jumpCleanupRef = useRef(null)

  // Task 17 — memoized count of still-open user annotations. Drives the
  // "发送 N 条批注" button label + disabled state, and whether the approval
  // modal opens or we can approve directly.
  const openAnnotationCount = useMemo(
    () => annotations.filter(a => a.status === 'open').length,
    [annotations]
  )
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
        setReview(normalizeReviewPayload(reviewR))
        setSelfCheckReview(null)
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
        setSelfCheckReview(null)
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'DELETE' })
        addToast?.('已保存', 'success')
      } else {
        addToast?.('保存失败', 'error')
      }
    } catch {
      addToast?.('保存失败', 'error')
    }
  }, [dirty, content, bookId, chapterId, addToast])

  // Task 17 — Approve-chapter mutation. Shared by the direct-approve path
  // (zero open annotations) and the modal-confirm path. Defined before
  // handleApproveClick so the latter can reference it without a TDZ.
  const doApprove = useCallback(async () => {
    try {
      const gate = review ? 'post_review' : 'pre_review'
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_decision: 'approved',
          gate,
          pre_review_decision: gate === 'pre_review' ? 'approved' : undefined,
          post_review_decision: gate === 'post_review' ? 'approved' : undefined,
        }),
      })
      if (!r.ok) throw new Error('status update failed')
      const data = await r.json()
      setStatus(data)
      setApprovalOpen(false)
      addToast?.(gate === 'pre_review' ? '人审通过，可进入下一章' : '终审通过，可进入下一章', 'success')
    } catch (e) {
      addToast?.(`保存失败：${e.message}`, 'error')
    }
  }, [bookId, chapterId, review, addToast])

  const doReject = useCallback(async () => {
    try {
      const gate = review ? 'post_review' : 'pre_review'
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_decision: 'rejected',
          gate,
          pre_review_decision: gate === 'pre_review' ? 'needs_revision' : undefined,
          post_review_decision: gate === 'post_review' ? 'needs_revision' : undefined,
          note: '人类退回，等待批注修改。',
        }),
      })
      if (!r.ok) throw new Error('status update failed')
      const data = await r.json()
      setStatus(data)
      addToast?.('已标记为人类未通过；请添加或发送批注', 'info')
    } catch (e) {
      addToast?.(`保存失败：${e.message}`, 'error')
    }
  }, [bookId, chapterId, review, addToast])

  // Task 17 — batch-send open annotations to the Author Agent. Two-step flow:
  //   (1) POST /send-annotations → server composes a prompt + marks the chosen
  //       annotations as `sent` with a shared batch_id, returns { prompt }.
  //   (2) POST /author-chat/:bookId/send with that prompt (SSE stream). We
  //       read the stream with a `reader.read()` loop and break when we see
  //       the `event: done` sentinel in the decoded buffer (no explicit
  //       timeout — relies on the server closing the stream).
  // When the stream closes we reload draft/annotations/status in parallel and
  // flip `locked` off. On any error we still release the lock.
  const handleSendBatch = useCallback(async () => {
    const openIds = annotations.filter(a => a.status === 'open').map(a => a.id)
    if (openIds.length === 0) return
    try {
      const prep = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/send-annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_ids: openIds, review_after_revision: reviewAfterRevision }),
      }).then(r => r.json())
      if (!prep.prompt) throw new Error('no prompt')
      setLocked(true)
      const esResp = await fetch(`/api/v1/author-chat/${bookId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: prep.prompt }),
      })
      // Consume SSE stream; minimal parser — scan the decoded buffer for the
      // `event: done` line and break out. We don't need to parse individual
      // events here because the final reload re-fetches everything fresh.
      const reader = esResp.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        if (buf.includes('event: done')) break
      }
      const [dR, aR, stR] = await Promise.all([
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`).then(r => r.json()),
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`).then(r => r.json()),
        fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).then(r => r.json()),
      ])
      setContent(dR?.content ?? '')
      setAnnotations(aR)
      setStatus(stR)
      setLocked(false)
      addToast?.('Agent 已处理批注', 'success')
    } catch (e) {
      setLocked(false)
      addToast?.(`发送失败：${e.message}`, 'error')
    }
  }, [annotations, bookId, chapterId, reviewAfterRevision, addToast])

  const jumpToQuote = useCallback((quote) => {
    if (!quote) return
    const root = document.querySelector('.workbench-editor')
    if (!root) return

    jumpCleanupRef.current?.()
    jumpCleanupRef.current = null

    root.querySelectorAll('.workbench-jump-highlight').forEach(el => {
      el.classList.remove('workbench-jump-highlight')
    })
    document.querySelectorAll('.workbench-range-ring').forEach(el => el.remove())

    const makeNormalized = (value) => value.replace(/\s+/g, '')
    const quoteCandidates = [
      quote,
      ...quote.split(/\.{3,}|…+/).map(s => s.trim()).filter(s => s.length >= 8),
    ]
      .map(makeNormalized)
      .filter(Boolean)

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        if (parent.closest('.annotation-popover')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    const charMap = []
    let fullText = ''
    let node
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || ''
      for (let i = 0; i < text.length; i += 1) {
        if (/\s/.test(text[i])) continue
        charMap.push({ node, offset: i })
        fullText += text[i]
      }
    }

    let start = -1
    let matchedLength = 0
    for (const candidate of quoteCandidates) {
      const idx = fullText.indexOf(candidate)
      if (idx >= 0) {
        start = idx
        matchedLength = candidate.length
        break
      }
    }

    if (start >= 0 && matchedLength > 0) {
      const first = charMap[start]
      const last = charMap[start + matchedLength - 1]
      if (!first || !last) return
      const range = document.createRange()
      range.setStart(first.node, first.offset)
      range.setEnd(last.node, last.offset + 1)
      const targetElement = first.node.parentElement ?? range.commonAncestorContainer.parentElement
      targetElement?.scrollIntoView({ behavior: 'auto', block: 'center' })

      const drawRings = () => {
        document.querySelectorAll('.workbench-range-ring').forEach(el => el.remove())
        for (const rect of range.getClientRects()) {
          if (rect.width < 2 || rect.height < 2) continue
          const ring = document.createElement('div')
          ring.className = 'workbench-range-ring'
          ring.style.left = `${rect.left - 3}px`
          ring.style.top = `${rect.top - 3}px`
          ring.style.width = `${rect.width + 6}px`
          ring.style.height = `${rect.height + 6}px`
          document.body.appendChild(ring)
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(drawRings))

      const clear = () => {
        document.querySelectorAll('.workbench-range-ring').forEach(el => el.remove())
        window.removeEventListener('scroll', drawRings, true)
        window.removeEventListener('resize', drawRings)
      }
      window.addEventListener('scroll', drawRings, true)
      window.addEventListener('resize', drawRings)
      jumpCleanupRef.current = clear
      window.setTimeout(clear, 5200)
      addToast?.('已定位并高亮原文', 'success')
      return
    }

    const normalizedQuote = makeNormalized(quote)
    const paragraphWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while ((node = paragraphWalker.nextNode())) {
      const text = node.nodeValue || ''
      const normalizedText = makeNormalized(text)
      if (!normalizedText.includes(normalizedQuote)) continue
      const parent = node.parentElement
      if (!parent) break
      parent.scrollIntoView({ behavior: 'auto', block: 'center' })
      parent.classList.add('workbench-jump-highlight')
      window.setTimeout(() => parent.classList.remove('workbench-jump-highlight'), 2600)
      addToast?.('已定位到原文所在段落', 'success')
      return
    }
    try {
      if (window.find?.(quote)) return
    } catch { /* quiet */ }
    addToast?.('没有精确定位到原文，可能是段落已被修改', 'warning')
  }, [addToast])

  // Task 17 — re-run the 5-reviewer editorial pipeline against the currently
  // saved draft (no Agent invocation). Locks the UI for the duration so the
  // user can't double-submit; always unlocks in `finally`.
  const handleResubmit = useCallback(async () => {
    setLocked(true)
    try {
      const reviewScope = reviewAfterRevision === 'failed_only' ? 'failed_only' : 'full'
      const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/resubmit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_scope: reviewScope }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => null)
        if (body?.code === 'DRAFT_SELF_CHECK_FAILED' && body?.self_check) {
          const issues = (body.self_check.issues ?? []).map(issue => ({
            ...issue,
            fix_instruction: issue.fix_instruction ?? issue.fixInstruction ?? issue.message,
          }))
          setSelfCheckReview({
            overall_pass: false,
            revision_round: null,
            feedbacks: [{
              reviewer: 'draft_self_check',
              pass_status: false,
              quick_comment: body.error,
              issues,
            }],
          })
        }
        throw new Error(body?.error ?? 'resubmit failed')
      }
      const result = await r.json()
      setSelfCheckReview(null)
      setReview(result)
      addToast?.('审稿已刷新', 'success')
    } catch (e) {
      addToast?.(`再送审失败：${e.message}`, 'error')
    } finally {
      setLocked(false)
    }
  }, [bookId, chapterId, reviewAfterRevision, addToast])

  // Task 17 — approve-button click handler. Gates through the confirm modal
  // only when there are still-open annotations; otherwise approves directly.
  const handleApproveClick = useCallback(() => {
    if (openAnnotationCount > 0) {
      setApprovalOpen(true)
    } else {
      doApprove()
    }
  }, [openAnnotationCount, doApprove])

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

  // Task 18 — workbench lock lifecycle. Each time `dirty` is truthy we POST
  // the lock endpoint; the server writes/refreshes `workbench_lock_{chId}`
  // with a new timestamp, which the `block-while-user-editing` hook reads.
  useEffect(() => {
    if (dirty) {
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'POST' })
    }
  }, [dirty, bookId, chapterId])

  // Task 18 — keep the lock fresh on a 5-minute heartbeat while dirty.
  useEffect(() => {
    if (!dirty) return
    const timer = setInterval(() => {
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'POST' })
    }, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [dirty, bookId, chapterId])

  // Task 18 — release the lock on unmount (chapter switch / workbench close).
  useEffect(() => {
    return () => {
      fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/workbench-lock`, { method: 'DELETE' })
    }
  }, [bookId, chapterId])

  // Task 13 — detect text selections inside `.workbench-editor` and surface
  // a popover anchored to the bottom of the final selection rect. We wait
  // until pointerup before rendering the popover; rendering it during drag
  // interrupts native text selection in ProseMirror/Milkdown.
  useEffect(() => {
    let pointerSelecting = false
    let ignoreSelectionChangesUntil = 0

    function updateSelectionFromWindow() {
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

    function onSelChange() {
      if (Date.now() < ignoreSelectionChangesUntil) return
      if (document.activeElement?.closest?.('.annotation-popover')) return
      if (pointerSelecting) return
      updateSelectionFromWindow()
    }

    function onPointerDown(e) {
      const editorEl = document.querySelector('.workbench-editor')
      if (!editorEl || !editorEl.contains(e.target)) return
      pointerSelecting = true
      setSelection(null)
    }

    function onPointerUp() {
      if (!pointerSelecting) return
      pointerSelecting = false
      ignoreSelectionChangesUntil = Date.now() + 300
      updateSelectionFromWindow()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('selectionchange', onSelChange)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('selectionchange', onSelChange)
    }
  }, [])

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
            <span className="display-heading">
              {chapterLabel}{dirty && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>●</span>}
            </span>
            {locked && <span className="workbench-writing-badge"><Loader size={12} className="anim-spin" /> Agent 写作中</span>}
          </div>
          <div className="workbench-actions">
            {/* Task 17 — wired handlers. The send button disables when there
                are no open annotations or the chapter is locked by the Agent. */}
            <button
              className="btn btn-sm"
              disabled={openAnnotationCount === 0 || locked}
              onClick={handleSendBatch}
            >
              <Send size={12} /> 📤 {openAnnotationCount > 0 ? `发送 ${openAnnotationCount} 条批注` : '无批注'}
            </button>
            <select
              className="workbench-review-select"
              value={reviewAfterRevision}
              disabled={locked}
              onChange={(e) => setReviewAfterRevision(e.target.value)}
              title="批注修改后的复审策略"
            >
              <option value="none">改后等我看</option>
              <option value="failed_only">只复审未过</option>
              <option value="full">全量复审</option>
            </select>
            <button className="btn btn-sm" disabled={locked} onClick={handleResubmit}>
              <RefreshCw size={12} /> 送设定/逻辑慢审
            </button>
            <button className="btn btn-sm" disabled={locked} onClick={doReject}>
              人类退回
            </button>
            <button className="btn btn-sm" disabled={locked} onClick={handleApproveClick}>
              <Check size={12} /> {status.user_decision === 'approved' ? '已通过' : review ? '终审通过' : '人审通过'}
            </button>
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
        {/* Task 17 — gate "用户通过" through a confirm dialog whenever there
            are still-open annotations. Dismiss closes without mutation. */}
        <ApprovalConfirmModal
          open={approvalOpen}
          unresolvedCount={openAnnotationCount}
          onCancel={() => setApprovalOpen(false)}
          onConfirm={doApprove}
        />

        {/* Editor — Milkdown wrapper (Task 11). key remounts on chapter switch.
            `.workbench-editor` has `position: relative` so the popover can
            anchor against it (Task 13). */}
        <div className="workbench-editor">
          <MilkdownEditor
            key={chapterId}
            initial={content}
            readOnly={locked}
            onChange={(md) => { setContent(md); setDirty(true); setSelfCheckReview(null) }}
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
          <span className="label-sc">{content.length} Chars</span>
          <span className="label-sc" style={{ color: content.length >= MIN_REVIEW_CHARS ? 'var(--success)' : 'var(--danger)' }}>
            送审 {content.length >= MIN_REVIEW_CHARS ? '已达标' : `需 ≥${MIN_REVIEW_CHARS}`}
          </span>
          <span className="label-sc">{status.user_decision ?? 'Draft'}</span>
          <span className="label-sc">
            {status.user_decision === 'approved'
              ? '人类已通过'
              : review
                ? '慢审后待人审'
                : '待人审'}
          </span>
        </div>
      </div>

      {/* Right feed — unified CommentFeed (Task 12) */}
      <aside className="workbench-feed">
        <CommentFeed
          review={selfCheckReview ?? review}
          annotations={annotations}
          onJump={jumpToQuote}
          // Adopt a reviewer-issue into a persisted user annotation so it
          // joins the batch-send queue. anchor_start/end = 0 mirrors the
          // AnnotationPopover MVP (markdown source offsets are out-of-scope).
          onAdopt={async (item) => {
            const body = {
              quote: item.quote ?? '',
              anchor_start: 0,
              anchor_end: 0,
              comment: item.text,
              source: 'adopted_review',
              source_reviewer: item.reviewer,
            }
            const r = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (r.ok) {
              const created = await r.json()
              setAnnotations(prev => [...prev, created])
              addToast?.('已采纳为批注', 'success')
            }
          }}
          // Review issues live in review_{chId}.json which is Agent-owned — we
          // don't persist an "ignored" state. Filter locally so the card just
          // disappears from the feed for this session. The composite id lets
          // us key it uniquely against the memoized feed items.
          onIgnore={(id) => {
            if (selfCheckReview) {
              setSelfCheckReview(prev => {
                if (!prev?.feedbacks) return prev
                const feedbacks = prev.feedbacks.map(fb => ({
                  ...fb,
                  issues: (fb.issues ?? []).filter(iss =>
                    `${fb.reviewer}:${iss.quote ?? ''}:${iss.fix_instruction ?? ''}` !== id
                  ),
                }))
                return { ...prev, feedbacks }
              })
              return
            }
            setReview(prev => {
              if (!prev?.feedbacks) return prev
              const feedbacks = prev.feedbacks.map(fb => ({
                ...fb,
                issues: (fb.issues ?? []).filter(iss =>
                  `${fb.reviewer}:${iss.quote ?? ''}:${iss.fix_instruction ?? ''}` !== id
                ),
              }))
              return { ...prev, feedbacks }
            })
          }}
          onDelete={async (annId) => {
            await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations/${annId}`, { method: 'DELETE' })
            setAnnotations(prev => prev.filter(a => a.id !== annId))
          }}
          onSendBatch={handleSendBatch}
        />
      </aside>
    </div>
  )
}
