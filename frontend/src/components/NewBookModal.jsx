import { useState } from 'react'
import { BookOpen, X, Sparkles } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

export function NewBookModal({ onClose, onCreated, addToast, initialDraft }) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    title: initialDraft?.title || '',
    concept: initialDraft?.concept || '',
    targetWords: 500000,
  })
  const [creating, setCreating] = useState(false)

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleCreate = async () => {
    if (!form.title.trim()) {
      addToast?.(t('newBook.titleRequired'), 'warning')
      return
    }

    const bookId = form.title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40) + '_' + Date.now().toString(36)

    setCreating(true)

    try {
      const res = await fetch('/api/v1/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: bookId,
          title: form.title,
          genre: 'unspecified',
          tone: 'unspecified',
          concept: form.concept.trim(),
          target_words: form.targetWords,
        })
      })

      if (res.ok) {
        const data = await res.json()
        addToast?.(t('newBook.created'), 'success')
        onCreated?.(data)
        onClose?.()
      } else {
        const err = await res.json().catch(() => ({}))
        addToast?.(err.detail || t('newBook.error'), 'error')
      }
    } catch {
      // Demo mode: simulate local creation
      addToast?.(t('newBook.createdLocal'), 'success')
      onCreated?.({
        book_id: bookId,
        title: form.title,
        genre: 'unspecified',
        tone: 'unspecified',
        concept: form.concept.trim(),
      })
      onClose?.()
    }

    setCreating(false)
  }

  return (
    <div className="director-overlay" onClick={onClose}>
      <div className="director-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {/* Header */}
        <div className="director-header">
          <BookOpen size={16} style={{ color: 'var(--accent)' }} />
          <span className="display-heading">{t('newBook.title')}</span>
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', overflow: 'auto', maxHeight: '60vh' }}>
          {/* Book Title */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">{t('newBook.bookTitle')} *</label>
            <input
              className="input"
              placeholder={t('newBook.bookTitlePh')}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              autoFocus
            />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">{t('newBook.concept')}</label>
            <textarea
              className="textarea"
              placeholder={t('newBook.conceptPh')}
              value={form.concept}
              onChange={e => set('concept', e.target.value)}
              rows={5}
            />
          </div>

          {/* Target Words */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="field-label">{t('newBook.targetWords')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                type="number"
                min={10000}
                step={10000}
                value={form.targetWords}
                onChange={e => set('targetWords', parseInt(e.target.value) || 500000)}
                style={{ width: 120 }}
              />
              <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{t('newBook.targetWordsHint')}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="director-footer">
          <button className="btn btn-sm" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={creating}>
            <Sparkles size={12} />
            {creating ? t('newBook.creating') : t('newBook.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
