import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, FileText, RefreshCw } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

function useDerivedChapterStatus(bookId, chId) {
  const [status, setStatus] = useState('-') // '-' | 'Draft' | 'Done'
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const [stR, chR] = await Promise.all([
          fetch(`/api/v1/books/${bookId}/chapters/${chId}/status`).then(r => r.json()).catch(() => null),
          fetch(`/api/v1/books/${bookId}/chapters/${chId}`).then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return
        if (stR?.user_decision === 'approved') setStatus('Done')
        else if (chR?.content && chR.content.length > 0) setStatus('Draft')
        else setStatus('-')
      } catch {
        if (!cancelled) setStatus('-')
      }
    }
    if (bookId && chId) check()
    return () => { cancelled = true }
  }, [bookId, chId])
  return status
}

function ChapterRow({ bookId, chNode, index, onClick }) {
  const status = useDerivedChapterStatus(bookId, chNode.id)
  const statusClass = status === 'Done' ? 'done' : status === 'Draft' ? 'draft' : ''
  return (
    <div className="chapter-row" onClick={() => onClick?.(chNode)}>
      <div className="chapter-num label-sc">{toRoman(index + 1)}.</div>
      <div className="chapter-body">
        <div className="chapter-title">{chNode.label}</div>
        {chNode.summary && <div className="chapter-summary">{chNode.summary}</div>}
      </div>
      <div className={`chapter-status label-sc ${statusClass}`}>
        {status === 'Done' && <Check size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
        {status}
      </div>
    </div>
  )
}

function FreeformFallback({ data }) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ background: 'var(--accent-soft)', padding: 10, marginBottom: 16, fontSize: 11, color: 'var(--ink-secondary)' }}>
        大纲是 free-form JSON，非标准章节树。新视图不支持编辑，请用 Agent 重新生成规范 outline。
      </div>
      <pre style={{ fontSize: 11, background: 'var(--bg-subtle)', padding: 10, overflow: 'auto', color: 'var(--ink-secondary)' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

export function OutlineView({ currentBook, addToast, onChapterOpen, dataVersion }) {
  const { t } = useI18n()
  void t
  void addToast
  const [outline, setOutline] = useState(null)
  const [loading, setLoading] = useState(Boolean(currentBook))

  const loadOutline = useCallback(async (bookId) => {
    if (!bookId) {
      setOutline(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await fetch(`/api/v1/books/${bookId}/outline`).then(r => r.json())
      setOutline(data)
    } catch {
      setOutline(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOutline(currentBook?.book_id)
  }, [currentBook, dataVersion, loadOutline])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={20} className="anim-spin" />
      </div>
    )
  }
  if (!currentBook) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>未选择书籍</div>
  }
  if (!outline) {
    return <div style={{ padding: 40, color: 'var(--ink-muted)' }}>大纲为空</div>
  }

  const hasStructure = Array.isArray(outline.children) && outline.children.length > 0

  return (
    <div className="outline-view">
      <div className="outline-topbar">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>— Outline —</div>
        <div className="outline-actions">
          <button className="btn btn-sm" title="整理章节编号"><RefreshCw size={12} /></button>
          <button className="btn btn-sm" title="导出 .md"><FileText size={12} /></button>
        </div>
      </div>

      <div className="outline-doc">
        {hasStructure ? (
          <>
            <h1 className="display-hero">{outline.label || '（未命名）'}</h1>
            {outline.epigraph && <div className="epigraph">{outline.epigraph}</div>}
            {outline.synopsis && <p className="drop-cap book-synopsis">{outline.synopsis}</p>}

            {outline.children.map((vol, volIdx) => (
              <section key={vol.id} className="outline-volume">
                <div className="vol-head">
                  <span className="vol-num label-sc">Vol. {toRoman(volIdx + 1)}</span>
                  <span className="vol-title display-heading">{vol.label}</span>
                </div>
                {vol.synopsis && <p className="vol-synopsis">{vol.synopsis}</p>}
                {(vol.children || []).map((ch, chIdx) => (
                  <ChapterRow
                    key={ch.id}
                    bookId={currentBook.book_id}
                    chNode={ch}
                    index={chIdx}
                    onClick={(node) => onChapterOpen?.(node)}
                  />
                ))}
              </section>
            ))}
          </>
        ) : (
          <FreeformFallback data={outline} />
        )}
      </div>
    </div>
  )
}
