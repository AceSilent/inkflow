import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Edit3, Loader, RefreshCw, Save, X } from 'lucide-react'
import { normalizeReviewPayload } from '../workbench/reviewPayload'
import {
  canEditLoadedChapter,
  chapterReviewActionLabel,
  chapterReviewStatusLabel,
  chapterWorkspaceKey,
  countCjkAwareWords,
  isDraftDirty,
  normalizeChapterContent,
  shouldApplyChapterResult,
  shouldClearLoadErrorOnLoadStart,
  shouldPreserveDirtyDraft,
  shouldReplaceDraftAfterSave,
} from './chapterWorkspaceState'

export function ChapterWorkspace({ bookId, chapter, dataVersion, addToast }) {
  const chapterId = chapter?.id ?? chapter?.chapter_id ?? chapter?.chapterId
  const chapterTitle = chapter?.label ?? chapter?.title ?? chapter?.name ?? '未命名章节'
  const currentKey = useMemo(
    () => (bookId && chapterId ? chapterWorkspaceKey(bookId, chapterId) : ''),
    [bookId, chapterId]
  )
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('preview')
  const [original, setOriginal] = useState('')
  const [draft, setDraft] = useState('')
  const [review, setReview] = useState(null)
  const [status, setStatus] = useState({ user_decision: null })
  const [saving, setSaving] = useState(false)
  const [reviewAction, setReviewAction] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const currentKeyRef = useRef(currentKey)
  const stateKeyRef = useRef('')
  const latestOriginalRef = useRef(original)
  const latestDraftRef = useRef(draft)

  currentKeyRef.current = currentKey
  latestOriginalRef.current = original
  latestDraftRef.current = draft

  useEffect(() => {
    if (!bookId || !chapterId || !currentKey) {
      stateKeyRef.current = ''
      setLoading(false)
      setMode('preview')
      setOriginal('')
      setDraft('')
      setReview(null)
      setStatus({ user_decision: null })
      setSaving(false)
      setReviewAction(null)
      setHasLoaded(false)
      setLoadError(false)
      return
    }

    let cancelled = false
    const requestKey = currentKey
    const previousKey = stateKeyRef.current
    const sameChapter = previousKey === requestKey

    setLoading(true)
    if (shouldClearLoadErrorOnLoadStart(previousKey, requestKey)) setLoadError(false)

    if (!sameChapter) {
      stateKeyRef.current = requestKey
      setMode('preview')
      setOriginal('')
      setDraft('')
      setReview(null)
      setStatus({ user_decision: null })
      setSaving(false)
      setReviewAction(null)
      setHasLoaded(false)
    }

    async function loadChapter() {
      try {
        const [response, reviewResponse, statusResponse] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/reviews`).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).catch(() => null),
        ])
        if (!response.ok) throw new Error('chapter load failed')
        const data = await response.json()
        const reviewData = reviewResponse?.ok ? await reviewResponse.json().catch(() => null) : null
        const statusData = statusResponse?.ok
          ? await statusResponse.json().catch(() => ({ user_decision: null }))
          : { user_decision: null }
        if (cancelled || !shouldApplyChapterResult(requestKey, currentKeyRef.current)) return

        const content = normalizeChapterContent(data?.content)
        const preserveDirtyDraft = shouldPreserveDirtyDraft(
          previousKey,
          requestKey,
          latestOriginalRef.current,
          latestDraftRef.current
        )

        stateKeyRef.current = requestKey
        setOriginal(content)
        setReview(normalizeReviewPayload(reviewData))
        setStatus(statusData ?? { user_decision: null })
        setHasLoaded(true)
        setLoadError(false)

        if (!preserveDirtyDraft) {
          setDraft(content)
          setMode('preview')
        }
      } catch {
        if (!cancelled && shouldApplyChapterResult(requestKey, currentKeyRef.current)) setLoadError(true)
      } finally {
        if (!cancelled && shouldApplyChapterResult(requestKey, currentKeyRef.current)) setLoading(false)
      }
    }

    loadChapter()

    return () => {
      cancelled = true
    }
  }, [bookId, chapterId, currentKey, dataVersion])

  const dirty = useMemo(() => isDraftDirty(original, draft), [original, draft])
  const wordCount = useMemo(() => countCjkAwareWords(draft), [draft])
  const paragraphs = useMemo(() => (
    normalizeChapterContent(draft)
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.trim())
      .filter(Boolean)
  ), [draft])
  const stateBelongsToCurrentChapter = stateKeyRef.current === currentKey
  const hasLoadedCurrent = stateBelongsToCurrentChapter && hasLoaded
  const canEdit = canEditLoadedChapter(hasLoadedCurrent, loadError)
  const hasReview = Boolean(review)
  const reviewBusy = Boolean(reviewAction)
  const reviewControlsDisabled = !canEdit || saving || reviewBusy || dirty

  const handleCancel = useCallback(() => {
    setDraft(original)
    setMode('preview')
  }, [original])

  const handleSave = useCallback(async () => {
    if (!bookId || !chapterId || !currentKey || !dirty || saving || !canEdit) return

    const content = normalizeChapterContent(draft)
    const requestKey = currentKey
    setSaving(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) throw new Error('draft save failed')
      if (!shouldApplyChapterResult(requestKey, currentKeyRef.current)) return

      setOriginal(content)
      if (shouldReplaceDraftAfterSave(content, latestDraftRef.current)) {
        setDraft(content)
        setMode('preview')
      }
      addToast?.('已保存', 'success')
    } catch {
      if (shouldApplyChapterResult(requestKey, currentKeyRef.current)) addToast?.('保存失败', 'error')
    } finally {
      if (shouldApplyChapterResult(requestKey, currentKeyRef.current)) setSaving(false)
    }
  }, [addToast, bookId, canEdit, chapterId, currentKey, dirty, draft, saving])

  const handleApprove = useCallback(async () => {
    if (!bookId || !chapterId || reviewControlsDisabled) return
    const gate = hasReview ? 'post_review' : 'pre_review'
    setReviewAction('approve')
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_decision: 'approved',
          gate,
          pre_review_decision: gate === 'pre_review' ? 'approved' : undefined,
          post_review_decision: gate === 'post_review' ? 'approved' : undefined,
        }),
      })
      if (!response.ok) throw new Error('status update failed')
      setStatus(await response.json())
      addToast?.(gate === 'pre_review' ? '人审通过，可进入下一章' : '终审通过，可进入下一章', 'success')
    } catch {
      addToast?.('人审状态保存失败', 'error')
    } finally {
      setReviewAction(null)
    }
  }, [addToast, bookId, chapterId, hasReview, reviewControlsDisabled])

  const handleReject = useCallback(async () => {
    if (!bookId || !chapterId || reviewControlsDisabled) return
    const gate = hasReview ? 'post_review' : 'pre_review'
    setReviewAction('reject')
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`, {
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
      if (!response.ok) throw new Error('status update failed')
      setStatus(await response.json())
      addToast?.('已标记为人类退回', 'info')
    } catch {
      addToast?.('退回状态保存失败', 'error')
    } finally {
      setReviewAction(null)
    }
  }, [addToast, bookId, chapterId, hasReview, reviewControlsDisabled])

  const handleResubmitReview = useCallback(async () => {
    if (!bookId || !chapterId || reviewControlsDisabled) return
    setReviewAction('review')
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/resubmit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_scope: 'full' }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? 'review failed')
      setReview(normalizeReviewPayload(body))
      addToast?.('设定/逻辑慢审已刷新', 'success')
    } catch (error) {
      addToast?.(`慢审失败：${error.message}`, 'error')
    } finally {
      setReviewAction(null)
    }
  }, [addToast, bookId, chapterId, reviewControlsDisabled])

  if (!bookId || !chapterId) {
    return (
      <div className="chapter-workspace-empty">
        选择一个章节后查看正文
      </div>
    )
  }

  if (!stateBelongsToCurrentChapter) {
    return (
      <div className="chapter-workspace-empty">
        <Loader size={18} className="anim-spin" />
        正在读取章节
      </div>
    )
  }

  if (loadError && !hasLoadedCurrent) {
    return (
      <div className="chapter-workspace-empty">
        章节读取失败，请稍后重试
      </div>
    )
  }

  if (loading && !hasLoadedCurrent) {
    return (
      <div className="chapter-workspace-empty">
        <Loader size={18} className="anim-spin" />
        正在读取章节
      </div>
    )
  }

  return (
    <div className="chapter-workspace">
      <header className="chapter-workspace-head">
        <div>
          <div className="chapter-workspace-kicker">当前章节</div>
          <h2>{chapterTitle}</h2>
        </div>
        <div className="chapter-workspace-actions">
          <span className="chapter-workspace-stat">{wordCount} 字/词</span>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={handleResubmitReview}
            disabled={reviewControlsDisabled}
            title={dirty ? '先保存当前修改' : '送设定/逻辑慢审'}
          >
            {reviewAction === 'review' ? <Loader size={14} className="anim-spin" /> : <RefreshCw size={14} />}
            慢审
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={handleReject}
            disabled={reviewControlsDisabled}
            title={dirty ? '先保存当前修改' : '人类退回'}
          >
            {reviewAction === 'reject' ? <Loader size={14} className="anim-spin" /> : <X size={14} />}
            退回
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={handleApprove}
            disabled={reviewControlsDisabled}
            title={dirty ? '先保存当前修改' : chapterReviewActionLabel(status.user_decision, hasReview)}
          >
            {reviewAction === 'approve' ? <Loader size={14} className="anim-spin" /> : <Check size={14} />}
            {chapterReviewActionLabel(status.user_decision, hasReview)}
          </button>
          {mode === 'preview' ? (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setMode('edit')} disabled={!canEdit}>
              <Edit3 size={14} />
              编辑
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" type="button" onClick={handleCancel} disabled={saving}>
                <X size={14} />
                取消
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={handleSave} disabled={!dirty || saving || !canEdit}>
                {saving ? <Loader size={14} className="anim-spin" /> : <Save size={14} />}
                保存
              </button>
            </>
          )}
        </div>
      </header>

      {mode === 'edit' ? (
        <textarea
          className="chapter-workspace-editor"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={!canEdit}
          aria-label={`${chapterTitle} 正文`}
        />
      ) : (
        <article className="chapter-workspace-preview">
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))
          ) : (
            <p className="muted">暂无正文</p>
          )}
        </article>
      )}

      {loadError && hasLoadedCurrent && (
        <div className="chapter-workspace-save-state">章节刷新失败，请稍后重试</div>
      )}
      {!loadError && mode === 'edit' && dirty && (
        <div className="chapter-workspace-save-state">有未保存修改</div>
      )}
      {!loadError && mode === 'preview' && !dirty && canEdit && (
        <div className="chapter-workspace-save-state">
          <Check size={12} />
          已保存 · {chapterReviewStatusLabel(status.user_decision, hasReview)}
        </div>
      )}
    </div>
  )
}
