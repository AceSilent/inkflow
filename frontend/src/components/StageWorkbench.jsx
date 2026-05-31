import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader, Save, Eye, PenTool } from 'lucide-react'
import { ScriptEditor } from './ScriptEditor'
import { ScriptPreview } from './ScriptPreview'

function findPackageForStage(outline, stageId) {
  if (!outline?.children) return null
  for (const pkg of outline.children) {
    if (pkg.type !== 'story_package' && pkg.type !== 'volume') continue
    if (Array.isArray(pkg.children)) {
      for (const stage of pkg.children) {
        if (stage.id === stageId) return pkg.id
      }
    }
  }
  return null
}

export function StageWorkbench({ bookId, stageId, stageLabel, addToast, dataVersion }) {
  const [loading, setLoading] = useState(true)
  const [packageId, setPackageId] = useState(null)
  const [pkg, setPkg] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('preview')
  const draftCache = useRef(new Map())

  useEffect(() => {
    if (!bookId || !stageId) return
    let cancelled = false
    setLoading(true)

    fetch(`/api/v1/books/${bookId}/outline`)
      .then(r => r.ok ? r.json() : null)
      .then(outline => {
        if (cancelled) return
        const pid = findPackageForStage(outline, stageId)
        if (!pid) {
          setLoading(false)
          return
        }
        setPackageId(pid)
        return fetch(`/api/v1/books/${bookId}/scripts/${pid}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (cancelled || !data) return
            const cached = draftCache.current.get(stageId)
            if (cached) {
              data = {
                ...data,
                stages: data.stages.map(s =>
                  s.id === stageId ? { ...s, lines: cached } : s
                ),
              }
              setDirty(true)
            } else {
              setDirty(false)
            }
            setPkg(data)
          })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [bookId, stageId, dataVersion])

  const currentStage = useMemo(
    () => pkg?.stages?.find(s => s.id === stageId),
    [pkg, stageId]
  )

  const handleLinesChange = useCallback((newLines) => {
    if (!pkg) return
    const updated = {
      ...pkg,
      stages: pkg.stages.map(s =>
        s.id === stageId ? { ...s, lines: newLines } : s
      ),
    }
    setPkg(updated)
    setDirty(true)
    draftCache.current.set(stageId, newLines)
  }, [pkg, stageId])

  const handleSave = useCallback(async () => {
    if (!bookId || !packageId || !currentStage) return
    setSaving(true)
    try {
      const r = await fetch(`/api/v1/books/${bookId}/scripts/${packageId}/stages/${stageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentStage),
      })
      if (r.ok) {
        setDirty(false)
        draftCache.current.delete(stageId)
        addToast?.('已保存', 'success')
      } else {
        const body = await r.json().catch(() => ({}))
        addToast?.(`保存失败: ${body.error || r.statusText}`, 'error')
      }
    } catch (e) {
      addToast?.(`保存失败: ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [bookId, packageId, stageId, currentStage, addToast])

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

  if (!pkg) {
    return (
      <div style={{ padding: 40, color: 'var(--ink-muted)' }}>
        <p>尚未生成剧本。请在编剧对话中让 Agent 使用 save_script 工具保存剧本。</p>
        {packageId && <p style={{ fontSize: 12, opacity: 0.5 }}>Package: {packageId}</p>}
      </div>
    )
  }

  return (
    <div className="stage-workbench">
      <div className="stage-workbench-topbar">
        <div className="stage-workbench-title">
          <span className="display-heading">
            {stageLabel}{dirty && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>●</span>}
          </span>
          <span className="label-sc" style={{ opacity: 0.5 }}>
            {packageId} / {stageId} · {currentStage?.lines?.length || 0} lines
          </span>
        </div>
        <div className="stage-workbench-actions">
          <div className="stage-workbench-tabs">
            <button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>
              <Eye size={12} /> 预览
            </button>
            <button className={view === 'editor' ? 'active' : ''} onClick={() => setView('editor')}>
              <PenTool size={12} /> 编辑
            </button>
          </div>
          <button
            className="btn btn-sm"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            <Save size={12} /> {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      <div className="stage-workbench-content">
        {view === 'preview' ? (
          <ScriptPreview
            stages={currentStage ? [currentStage] : []}
            templateVars={{ player_name: '{player_name}' }}
          />
        ) : (
          <ScriptEditor
            stageId={stageId}
            lines={currentStage?.lines || []}
            onChange={handleLinesChange}
          />
        )}
      </div>
    </div>
  )
}
