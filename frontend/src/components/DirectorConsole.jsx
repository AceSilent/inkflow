import { useState } from 'react'
import { Send, Eye, EyeOff, AlertTriangle, RotateCw } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

export function DirectorConsole({ item, onClose, addToast }) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const [showDraft, setShowDraft] = useState(true)

  if (!item) return null

  const scores = item.reader_scores || {}

  const handlePushRetry = async () => {
    if (!note.trim()) {
      addToast?.(t('director.noteRequired'), 'warning')
      return
    }
    try {
      await fetch(`/api/v1/inbox/${item.task_id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ director_note: note, modified_outline: {} })
      })
    } catch { /* demo mode */ }
    addToast?.(t('director.pushed'), 'success')
    onClose?.()
  }

  return (
    <div className="director-overlay" onClick={onClose}>
      <div className="director-modal" onClick={e => e.stopPropagation()}>
        <div className="director-header">
          <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
          <span>{t('director.title')}</span>
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="director-body">
          {/* Left: draft + scores */}
          <div className="director-left">
            <div className="director-section">
              <div className="field-label" style={{ marginBottom: 6 }}>
                {t('director.readerScores')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {Object.entries(scores).map(([k, v]) => (
                  <div key={k} style={{
                    padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                    background: v >= 7 ? 'rgba(166,227,161,0.1)' : 'rgba(243,139,168,0.1)',
                    border: `1px solid ${v >= 7 ? 'var(--success)' : 'var(--danger)'}`,
                    fontSize: 11
                  }}>
                    <span style={{ textTransform: 'capitalize' }}>{k}</span>
                    <span style={{ float: 'right', fontWeight: 700 }}>{v}/10</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="director-section">
              <div className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                {showDraft ? <Eye size={11} /> : <EyeOff size={11} />}
                <span style={{ cursor: 'pointer' }} onClick={() => setShowDraft(!showDraft)}>
                  {t('director.draftPreview')}
                </span>
              </div>
              {showDraft && (
                <div style={{
                  fontSize: 12, lineHeight: 1.6, padding: 10,
                  background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
                  maxHeight: 200, overflow: 'auto', fontStyle: 'italic', color: 'var(--text-secondary)'
                }}>
                  {item.draft_excerpt || t('director.noDraft')}
                </div>
              )}
            </div>
          </div>

          {/* Right: director note */}
          <div className="director-right">
            <div className="field-label" style={{ marginBottom: 6 }}>{t('director.noteLabel')}</div>
            <textarea
              className="textarea"
              rows={8}
              placeholder={t('director.notePlaceholder')}
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('director.noteHint')}
            </div>
          </div>
        </div>

        <div className="director-footer">
          <button className="btn btn-sm" onClick={onClose}>{t('director.cancel')}</button>
          <button className="btn btn-sm btn-primary" onClick={handlePushRetry}>
            <RotateCw size={12} /> {t('director.pushRetry')}
          </button>
        </div>
      </div>
    </div>
  )
}
