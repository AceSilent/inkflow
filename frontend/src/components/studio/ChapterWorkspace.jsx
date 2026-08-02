import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Edit3, History, Loader, RefreshCw, Save, Send, X } from 'lucide-react'
import { ChapterHistoryDialog } from './ChapterHistoryDialog'
import { AnnotationPopover } from '../workbench/AnnotationPopover'
import { CommentFeed } from '../workbench/CommentFeed'
import { buildChapterAskMessage, normalizeChapterAskComment } from '../workbench/chapterAsk'
import { jumpToQuote as jumpToQuoteInEditor } from '../workbench/jumpToQuote'
import { normalizeReviewPayload } from '../workbench/reviewPayload'
import { useEditorSelection } from '../workbench/useEditorSelection'
import {
  canEditLoadedChapter,
  captureReaderPosition,
  chapterReviewActionLabel,
  chapterReviewStatusLabel,
  chapterWorkspaceKey,
  countCjkAwareWords,
  isDraftDirty,
  normalizeChapterContent,
  readerScrollTopForPosition,
  shouldApplyChapterResult,
  shouldClearLoadErrorOnLoadStart,
  shouldPreserveDirtyDraft,
  shouldReplaceDraftAfterSave,
} from './chapterWorkspaceState'

export function ChapterWorkspace({ bookId, chapter, dataVersion, addToast, onAskAuthor, floatingResetKey }) {
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
  const [selfCheckReview, setSelfCheckReview] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [status, setStatus] = useState({ user_decision: null })
  const [saving, setSaving] = useState(false)
  const [reviewAction, setReviewAction] = useState(null)
  const [sendingAnnotations, setSendingAnnotations] = useState(false)
  const [processingAnnotationId, setProcessingAnnotationId] = useState(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [contentHash, setContentHash] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const { selection, setSelection } = useEditorSelection('.chapter-workspace-reader')
  const currentKeyRef = useRef(currentKey)
  const stateKeyRef = useRef('')
  const latestOriginalRef = useRef(original)
  const latestDraftRef = useRef(draft)
  const jumpCleanupRef = useRef(null)
  const previewRef = useRef(null)
  const editorRef = useRef(null)
  const readerPositionRef = useRef({ top: 0, ratio: 0 })

  currentKeyRef.current = currentKey
  latestOriginalRef.current = original
  latestDraftRef.current = draft

  useEffect(() => {
    if (mode !== 'preview') setSelection(null)
  }, [mode, setSelection])

  useEffect(() => {
    setSelection(null)
  }, [floatingResetKey, setSelection])

  useEffect(() => () => {
    jumpCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!bookId || !chapterId || !currentKey) {
      stateKeyRef.current = ''
      setLoading(false)
      setMode('preview')
      setOriginal('')
      setDraft('')
      setReview(null)
      setSelfCheckReview(null)
      setAnnotations([])
      setStatus({ user_decision: null })
      setSaving(false)
      setReviewAction(null)
      setSendingAnnotations(false)
      setProcessingAnnotationId(null)
      setHasLoaded(false)
      setLoadError(false)
      setContentHash('')
      setHistoryOpen(false)
      setSelection(null)
      readerPositionRef.current = { top: 0, ratio: 0 }
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
      setSelfCheckReview(null)
      setAnnotations([])
      setStatus({ user_decision: null })
      setSaving(false)
      setReviewAction(null)
      setSendingAnnotations(false)
      setProcessingAnnotationId(null)
      setHasLoaded(false)
      setContentHash('')
      setHistoryOpen(false)
      setSelection(null)
      readerPositionRef.current = { top: 0, ratio: 0 }
    }

    async function loadChapter() {
      try {
        const [response, reviewResponse, annotationsResponse, statusResponse] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/reviews`).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/status`).catch(() => null),
        ])
        if (!response.ok) throw new Error('chapter load failed')
        const data = await response.json()
        const reviewData = reviewResponse?.ok ? await reviewResponse.json().catch(() => null) : null
        const annotationsData = annotationsResponse?.ok ? await annotationsResponse.json().catch(() => []) : []
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
        setContentHash(data?.content_hash ?? '')
        setReview(normalizeReviewPayload(reviewData))
        setSelfCheckReview(null)
        setAnnotations(Array.isArray(annotationsData) ? annotationsData : [])
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
  }, [bookId, chapterId, currentKey, dataVersion, setSelection])

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
  const reviewToShow = selfCheckReview ?? review
  const openAnnotationCount = useMemo(
    () => annotations.filter(annotation => annotation.status === 'open').length,
    [annotations]
  )
  const reviewBusy = Boolean(reviewAction)
  const reviewControlsDisabled = !canEdit || saving || reviewBusy || sendingAnnotations || dirty
  const reviewStateClass = status.user_decision === 'approved'
    ? 'approved'
    : status.user_decision === 'rejected'
      ? 'rejected'
      : 'pending'

  useLayoutEffect(() => {
    if (!hasLoadedCurrent) return
    const reader = mode === 'edit' ? editorRef.current : previewRef.current
    if (!reader) return
    reader.scrollTop = readerScrollTopForPosition(readerPositionRef.current, reader)
  }, [currentKey, hasLoadedCurrent, mode])

  const captureCurrentReaderPosition = useCallback(() => {
    const reader = mode === 'edit' ? editorRef.current : previewRef.current
    if (reader) readerPositionRef.current = captureReaderPosition(reader)
  }, [mode])

  const handleReaderScroll = useCallback((event) => {
    readerPositionRef.current = captureReaderPosition(event.currentTarget)
  }, [])

  const handleStartEditing = useCallback(() => {
    captureCurrentReaderPosition()
    setMode('edit')
  }, [captureCurrentReaderPosition])

  const handleCancel = useCallback(() => {
    captureCurrentReaderPosition()
    setDraft(original)
    setMode('preview')
  }, [captureCurrentReaderPosition, original])

  const handleSave = useCallback(async () => {
    if (!bookId || !chapterId || !currentKey || !dirty || saving || !canEdit) return

    const content = normalizeChapterContent(draft)
    const requestKey = currentKey
    captureCurrentReaderPosition()
    setSaving(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, expected_hash: contentHash }),
      })
      const body = await response.json().catch(() => null)
      if (response.status === 409) {
        setHistoryOpen(true)
        const conflict = new Error('draft revision conflict')
        conflict.code = 'DRAFT_REVISION_CONFLICT'
        throw conflict
      }
      if (!response.ok) throw new Error(body?.error ?? 'draft save failed')
      if (!shouldApplyChapterResult(requestKey, currentKeyRef.current)) return

      setOriginal(content)
      setContentHash(body?.content_hash ?? '')
      setSelfCheckReview(null)
      if (shouldReplaceDraftAfterSave(content, latestDraftRef.current)) {
        setDraft(content)
        setMode('preview')
      }
      addToast?.('已保存', 'success')
    } catch (error) {
      if (!shouldApplyChapterResult(requestKey, currentKeyRef.current)) return
      if (error?.code === 'DRAFT_REVISION_CONFLICT') {
        addToast?.('正文已被其他操作更新，你的文字仍保留在编辑框中；请查看版本历史', 'info')
      } else {
        addToast?.('保存失败', 'error')
      }
    } finally {
      if (shouldApplyChapterResult(requestKey, currentKeyRef.current)) setSaving(false)
    }
  }, [addToast, bookId, canEdit, captureCurrentReaderPosition, chapterId, contentHash, currentKey, dirty, draft, saving])

  const handleRevisionRestored = useCallback(async () => {
    if (!bookId || !chapterId) return
    const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`)
    if (!response.ok) throw new Error('restored chapter load failed')
    const body = await response.json()
    const content = normalizeChapterContent(body?.content)
    setOriginal(content)
    setDraft(content)
    setContentHash(body?.content_hash ?? '')
    setSelfCheckReview(null)
    setMode('preview')
  }, [bookId, chapterId])

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
          note: '人类退回，等待待处理问题修改。',
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
      if (!response.ok) {
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
        throw new Error(body?.error ?? 'review failed')
      }
      setSelfCheckReview(null)
      setReview(normalizeReviewPayload(body))
      addToast?.('设定/逻辑慢审已刷新', 'success')
    } catch (error) {
      addToast?.(`慢审失败：${error.message}`, 'error')
    } finally {
      setReviewAction(null)
    }
  }, [addToast, bookId, chapterId, reviewControlsDisabled])

  const createChapterAskAnnotation = useCallback(async (comment) => {
    if (!bookId || !chapterId || !selection || mode !== 'preview') return

    const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote: selection.text,
        anchor_start: selection.start,
        anchor_end: selection.end,
        comment: normalizeChapterAskComment(comment),
        source: 'user',
      }),
    })

    if (!response.ok) {
      throw new Error('chapter ask save failed')
    }

    const created = await response.json()
    setAnnotations(prev => [...prev, created])
    return created
  }, [bookId, chapterId, mode, selection])

  const handleQueueChapterAsk = useCallback(async (comment) => {
    try {
      await createChapterAskAnnotation(comment)
      setSelection(null)
      addToast?.('已加入待处理', 'success')
    } catch {
      addToast?.('待处理问题保存失败', 'error')
    }
  }, [addToast, createChapterAskAnnotation, setSelection])

  const handleAskAuthorNow = useCallback((question) => {
    if (!selection || mode !== 'preview') return
    if (!onAskAuthor) {
      addToast?.('作者对话暂不可用', 'error')
      return
    }
    const message = buildChapterAskMessage({
      chapterId,
      chapterTitle,
      selectedText: selection.text,
      question,
    })
    onAskAuthor({
      message,
      bookId,
      chapterId,
      chapterTitle,
      selectedText: selection.text,
    })
    setSelection(null)
    addToast?.('已发送到作者对话', 'success')
  }, [addToast, bookId, chapterId, chapterTitle, mode, onAskAuthor, selection, setSelection])

  const handleSendAnnotations = useCallback(async (annotationIds = null) => {
    if (!bookId || !chapterId || sendingAnnotations || dirty || !canEdit) return
    if (!onAskAuthor) {
      addToast?.('作者对话暂不可用', 'error')
      return
    }

    const openIds = annotations
      .filter(annotation => annotation.status === 'open')
      .map(annotation => annotation.id)
    const requestedIds = Array.isArray(annotationIds)
      ? annotationIds.filter(id => openIds.includes(id))
      : openIds
    if (requestedIds.length === 0) return

    setSendingAnnotations(true)
    setProcessingAnnotationId(requestedIds.length === 1 ? requestedIds[0] : '__batch__')
    try {
      const prepResponse = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/send-annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_ids: requestedIds, review_after_revision: 'none' }),
      })
      const prep = await prepResponse.json().catch(() => null)
      if (!prepResponse.ok || !prep?.prompt) throw new Error(prep?.error ?? 'no prompt')

      setAnnotations(current => current.map(annotation => (
        requestedIds.includes(annotation.id)
          ? {
              ...annotation,
              status: 'sent',
              sent_batch_id: prep.batch_id,
              sent_at: new Date().toISOString(),
            }
          : annotation
      )))
      onAskAuthor({
        message: prep.prompt,
        bookId,
        chapterId,
        chapterTitle,
        annotationIds: requestedIds,
        autoSend: true,
      })
      addToast?.(
        requestedIds.length === 1
          ? '已开始处理，可在作者对话中查看进度'
          : '待处理问题已排队，可在作者对话中查看进度',
        'success',
      )
    } catch (error) {
      addToast?.(`待处理问题发送失败：${error.message}`, 'error')
    } finally {
      setSendingAnnotations(false)
      setProcessingAnnotationId(null)
    }
  }, [
    addToast,
    annotations,
    bookId,
    canEdit,
    chapterId,
    dirty,
    onAskAuthor,
    sendingAnnotations,
    chapterTitle,
  ])

  const jumpToQuote = useCallback((quote) => {
    jumpToQuoteInEditor(quote, {
      cleanupRef: jumpCleanupRef,
      addToast,
      rootSelector: '.chapter-workspace-preview',
    })
  }, [addToast])

  const handleAdoptReviewIssue = useCallback(async (item) => {
    if (!bookId || !chapterId) return

    const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote: item.quote ?? '',
        anchor_start: 0,
        anchor_end: 0,
        comment: item.text,
        source: 'adopted_review',
        source_reviewer: item.reviewer,
      }),
    })

    if (response.ok) {
      const created = await response.json()
      setAnnotations(prev => [...prev, created])
      addToast?.('已采纳为待处理问题', 'success')
    }
  }, [addToast, bookId, chapterId])

  const handleIgnoreReviewIssue = useCallback((id) => {
    const filterIssues = (reviewPayload) => {
      if (!reviewPayload?.feedbacks) return reviewPayload
      const feedbacks = reviewPayload.feedbacks.map(feedback => ({
        ...feedback,
        issues: (feedback.issues ?? []).filter(issue =>
          `${feedback.reviewer}:${issue.quote ?? ''}:${issue.fix_instruction ?? ''}` !== id
        ),
      }))
      return { ...reviewPayload, feedbacks }
    }

    if (selfCheckReview) {
      setSelfCheckReview(prev => filterIssues(prev))
      return
    }
    setReview(prev => filterIssues(prev))
  }, [selfCheckReview])

  const handleDeleteAnnotation = useCallback(async (annotationId) => {
    if (!bookId || !chapterId) return
    await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}/annotations/${annotationId}`, { method: 'DELETE' })
    setAnnotations(prev => prev.filter(annotation => annotation.id !== annotationId))
  }, [bookId, chapterId])

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
        <div className="chapter-workspace-heading">
          <div className="chapter-workspace-kicker">当前章节</div>
          <h2>{chapterTitle}</h2>
          <div className="chapter-workspace-meta" aria-live="polite">
            <span>{wordCount} 字/词</span>
            <span aria-hidden="true">·</span>
            <span>{saving ? '保存中' : dirty ? '有未保存修改' : '已保存'}</span>
          </div>
        </div>
        <div className="chapter-workspace-actions">
          <button
            className="chapter-workspace-command chapter-history-trigger"
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={!canEdit}
            title="版本历史"
            aria-label="版本历史"
          >
            <History size={16} />
          </button>
          <span className="chapter-workspace-action-divider" aria-hidden="true" />
          {mode === 'preview' ? (
            <button className="chapter-workspace-command chapter-edit-command" type="button" onClick={handleStartEditing} disabled={!canEdit}>
              <Edit3 size={15} />
              编辑
            </button>
          ) : (
            <>
              <button className="chapter-workspace-command chapter-cancel-command" type="button" onClick={handleCancel} disabled={saving}>
                <X size={15} />
                取消
              </button>
              <button className="chapter-workspace-command chapter-save-command" type="button" onClick={handleSave} disabled={!dirty || saving || !canEdit}>
                {saving ? <Loader size={15} className="anim-spin" /> : <Save size={15} />}
                保存
              </button>
            </>
          )}
        </div>
      </header>

      <section className="chapter-workspace-reviewbar" aria-label="章节审稿流程">
        <div className="chapter-workspace-review-status">
          <span className="chapter-workspace-review-eyebrow">审稿流程</span>
          <span className={`chapter-workspace-review-pill ${reviewStateClass}`}>
            {chapterReviewStatusLabel(status.user_decision, hasReview)}
          </span>
          {openAnnotationCount > 0 && (
            <button
              className="chapter-workspace-send-note"
              type="button"
              onClick={() => handleSendAnnotations()}
              disabled={dirty || sendingAnnotations || !canEdit}
              title={dirty ? '保存当前修改后可发送待处理问题' : '把待处理问题发送给作者 Agent'}
            >
              {sendingAnnotations ? <Loader size={12} className="anim-spin" /> : <Send size={12} />}
              {openAnnotationCount} 条待处理
            </button>
          )}
          {dirty && <span className="chapter-workspace-review-hint">保存当前修改后可操作</span>}
        </div>
        <div className="chapter-workspace-review-actions">
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
        </div>
      </section>

      <div className="chapter-workspace-body">
        <div className="chapter-workspace-reader">
          {mode === 'edit' ? (
            <textarea
              ref={editorRef}
              className="chapter-workspace-editor"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onScroll={handleReaderScroll}
              disabled={!canEdit}
              aria-label={`${chapterTitle} 正文`}
            />
          ) : (
            <article ref={previewRef} className="chapter-workspace-preview" onScroll={handleReaderScroll}>
              {paragraphs.length > 0 ? (
                paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))
              ) : (
                <p className="muted">暂无正文</p>
              )}
            </article>
          )}
          {mode === 'preview' && selection && (
            <AnnotationPopover
              anchor={selection.anchor}
              selectedText={selection.text}
              onCancel={() => setSelection(null)}
              onQueue={handleQueueChapterAsk}
              onSendNow={handleAskAuthorNow}
            />
          )}
        </div>

        <aside className="chapter-workspace-inspector" aria-label="章节审核与问作者">
          <CommentFeed
            review={reviewToShow}
            annotations={annotations}
            onJump={jumpToQuote}
            onAdopt={handleAdoptReviewIssue}
            onIgnore={handleIgnoreReviewIssue}
            onDelete={handleDeleteAnnotation}
            onProcess={(annotationId) => handleSendAnnotations([annotationId])}
            onSendBatch={() => handleSendAnnotations()}
            processingAnnotationId={processingAnnotationId}
            processingDisabled={dirty || sendingAnnotations || !canEdit}
          />
        </aside>
      </div>

      {loadError && hasLoadedCurrent && (
        <div className="chapter-workspace-save-state">章节刷新失败，请稍后重试</div>
      )}
      <ChapterHistoryDialog
        open={historyOpen}
        bookId={bookId}
        chapterId={chapterId}
        currentHash={contentHash}
        onClose={() => setHistoryOpen(false)}
        onRestored={handleRevisionRestored}
        addToast={addToast}
      />
    </div>
  )
}
