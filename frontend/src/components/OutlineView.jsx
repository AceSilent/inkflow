import { useState, useEffect, useCallback } from 'react'
import { Loader, Check, FileText, RefreshCw } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'
import { EditableField } from './outline/EditableField'

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

function ChapterRow({ bookId, chNode, index, onOpen, onPatch }) {
  const status = useDerivedChapterStatus(bookId, chNode.id)
  const statusClass = status === 'Done' ? 'done' : status === 'Draft' ? 'draft' : ''
  return (
    <div className="chapter-row">
      <div className="chapter-num label-sc">{toRoman(index + 1)}.</div>
      <div className="chapter-body" onClick={(e) => e.stopPropagation()}>
        <div className="chapter-title">
          <EditableField
            value={chNode.label}
            onSave={(v) => onPatch({ label: v })}
            placeholder="— 点此添加章标题 —"
          />
        </div>
        <div className="chapter-summary">
          <EditableField
            multiline
            value={chNode.summary}
            onSave={(v) => onPatch({ summary: v })}
            placeholder="— 点此添加章摘要 —"
          />
        </div>
      </div>
      <div
        className={`chapter-status label-sc ${statusClass}`}
        onClick={() => onOpen?.(chNode)}
        style={{ cursor: 'pointer' }}
        title="打开章节工作台"
      >
        {status === 'Done' && <Check size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
        {status} ↗
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

  const saveOutline = useCallback(async (updated) => {
    setOutline(updated)
    if (!currentBook?.book_id) return
    try {
      const r = await fetch(`/api/v1/books/${currentBook.book_id}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        addToast?.(`保存失败：${err.error ?? r.status}`, 'error')
      }
    } catch (e) {
      addToast?.(`保存失败：${e.message}`, 'error')
    }
  }, [currentBook, addToast])

  const patchBook = (patch) => saveOutline({ ...outline, ...patch })

  const patchVolume = (volIdx, patch) => {
    const next = { ...outline, children: [...outline.children] }
    next.children[volIdx] = { ...next.children[volIdx], ...patch }
    saveOutline(next)
  }

  const patchChapter = (volIdx, chIdx, patch) => {
    const next = { ...outline, children: [...outline.children] }
    const vol = { ...next.children[volIdx], children: [...next.children[volIdx].children] }
    vol.children[chIdx] = { ...vol.children[chIdx], ...patch }
    next.children[volIdx] = vol
    saveOutline(next)
  }

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
            <h1 className="display-hero">
              <EditableField
                value={outline.label}
                onSave={(v) => patchBook({ label: v })}
                placeholder="（未命名）"
              />
            </h1>
            <div className="epigraph">
              <EditableField
                value={outline.epigraph}
                onSave={(v) => patchBook({ epigraph: v })}
                placeholder="— 点此添加题词 —"
              />
            </div>
            <p className="drop-cap book-synopsis">
              <EditableField
                multiline
                value={outline.synopsis}
                onSave={(v) => patchBook({ synopsis: v })}
                placeholder="— 点此添加全书梗概 —"
              />
            </p>

            {outline.children.map((vol, volIdx) => (
              <section key={vol.id} className="outline-volume">
                <div className="vol-head">
                  <span className="vol-num label-sc">Vol. {toRoman(volIdx + 1)}</span>
                  <span className="vol-title display-heading">
                    <EditableField
                      value={vol.label}
                      onSave={(v) => patchVolume(volIdx, { label: v })}
                      placeholder="（卷名）"
                    />
                  </span>
                </div>
                <p className="vol-synopsis">
                  <EditableField
                    multiline
                    value={vol.synopsis}
                    onSave={(v) => patchVolume(volIdx, { synopsis: v })}
                    placeholder="— 点此添加卷梗概 —"
                  />
                </p>
                {(vol.children || []).map((ch, chIdx) => (
                  <ChapterRow
                    key={ch.id}
                    bookId={currentBook.book_id}
                    chNode={ch}
                    index={chIdx}
                    onOpen={(node) => onChapterOpen?.(node)}
                    onPatch={(patch) => patchChapter(volIdx, chIdx, patch)}
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
