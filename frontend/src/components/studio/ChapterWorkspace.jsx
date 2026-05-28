import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Edit3, Loader, Save, X } from 'lucide-react'
import {
  canEditLoadedChapter,
  chapterWorkspaceKey,
  countCjkAwareWords,
  isDraftDirty,
  normalizeChapterContent,
  shouldApplySaveResult,
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
  const [saving, setSaving] = useState(false)
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
      setSaving(false)
      setHasLoaded(false)
      setLoadError(false)
      return
    }

    let cancelled = false
    const requestKey = currentKey
    const previousKey = stateKeyRef.current
    const sameChapter = previousKey === requestKey

    setLoading(true)
    setLoadError(false)

    if (!sameChapter) {
      stateKeyRef.current = requestKey
      setMode('preview')
      setOriginal('')
      setDraft('')
      setSaving(false)
      setHasLoaded(false)
    }

    async function loadChapter() {
      try {
        const response = await fetch(`/api/v1/books/${bookId}/chapters/${chapterId}`)
        if (!response.ok) throw new Error('chapter load failed')
        const data = await response.json()
        if (cancelled || !shouldApplySaveResult(requestKey, currentKeyRef.current)) return

        const content = normalizeChapterContent(data?.content)
        const preserveDirtyDraft = shouldPreserveDirtyDraft(
          previousKey,
          requestKey,
          latestOriginalRef.current,
          latestDraftRef.current
        )

        stateKeyRef.current = requestKey
        setOriginal(content)
        setHasLoaded(true)
        setLoadError(false)

        if (!preserveDirtyDraft) {
          setDraft(content)
          setMode('preview')
        }
      } catch {
        if (!cancelled && shouldApplySaveResult(requestKey, currentKeyRef.current)) setLoadError(true)
      } finally {
        if (!cancelled && shouldApplySaveResult(requestKey, currentKeyRef.current)) setLoading(false)
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
      if (!shouldApplySaveResult(requestKey, currentKeyRef.current)) return

      setOriginal(content)
      if (shouldReplaceDraftAfterSave(content, latestDraftRef.current)) {
        setDraft(content)
        setMode('preview')
      }
      addToast?.('已保存', 'success')
    } catch {
      if (shouldApplySaveResult(requestKey, currentKeyRef.current)) addToast?.('保存失败', 'error')
    } finally {
      if (shouldApplySaveResult(requestKey, currentKeyRef.current)) setSaving(false)
    }
  }, [addToast, bookId, canEdit, chapterId, currentKey, dirty, draft, saving])

  if (!bookId || !chapterId) {
    return (
      <div className="chapter-workspace-empty">
        选择一个章节后查看正文
      </div>
    )
  }

  if (!stateBelongsToCurrentChapter || (loading && !hasLoadedCurrent)) {
    return (
      <div className="chapter-workspace-empty">
        <Loader size={18} className="anim-spin" />
        正在读取章节
      </div>
    )
  }

  if (loadError && !canEdit) {
    return (
      <div className="chapter-workspace-empty">
        章节读取失败，请稍后重试
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

      {mode === 'edit' && dirty && (
        <div className="chapter-workspace-save-state">有未保存修改</div>
      )}
      {mode === 'preview' && !dirty && canEdit && (
        <div className="chapter-workspace-save-state">
          <Check size={12} />
          已保存
        </div>
      )}
    </div>
  )
}
