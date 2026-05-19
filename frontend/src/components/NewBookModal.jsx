import { useState } from 'react'
import { BookOpen, X, Sparkles } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

const genreOptions = [
  { value: 'xianxia', zh: '仙侠', en: 'Xianxia' },
  { value: 'fantasy', zh: '玄幻', en: 'Fantasy' },
  { value: 'urban', zh: '都市', en: 'Urban' },
  { value: 'scifi', zh: '科幻', en: 'Sci-Fi' },
  { value: 'mystery', zh: '悬疑', en: 'Mystery' },
  { value: 'romance', zh: '言情', en: 'Romance' },
  { value: 'history', zh: '历史', en: 'Historical' },
  { value: 'game', zh: '游戏', en: 'Game-Lit' },
]

const toneOptions = [
  { value: 'dark_revenge', zh: '黑暗复仇', en: 'Dark Revenge' },
  { value: 'hot_blood', zh: '热血燃向', en: 'Hot-Blooded' },
  { value: 'comedy', zh: '轻松搞笑', en: 'Comedy' },
  { value: 'suspense', zh: '烧脑悬疑', en: 'Suspense' },
  { value: 'heartwarming', zh: '温馨治愈', en: 'Heartwarming' },
  { value: 'political', zh: '权谋宫斗', en: 'Political' },
]

export function NewBookModal({ onClose, onCreated, addToast }) {
  const { t, lang } = useI18n()
  const [form, setForm] = useState({
    title: '',
    genre: 'xianxia',
    tone: 'dark_revenge',
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
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: bookId,
          title: form.title,
          genre: form.genre,
          tone: form.tone,
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
        genre: form.genre,
        tone: form.tone,
      })
      onClose?.()
    }

    setCreating(false)
  }

  const gl = (opt) => lang === 'zh' ? opt.zh : opt.en

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

          {/* Genre + Tone row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="field">
              <label className="field-label">{t('newBook.genre')}</label>
              <select className="select" value={form.genre} onChange={e => set('genre', e.target.value)}>
                {genreOptions.map(g => <option key={g.value} value={g.value}>{gl(g)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">{t('newBook.tone')}</label>
              <select className="select" value={form.tone} onChange={e => set('tone', e.target.value)}>
                {toneOptions.map(t2 => <option key={t2.value} value={t2.value}>{gl(t2)}</option>)}
              </select>
            </div>
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
