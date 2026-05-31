import { useState, useEffect } from 'react'
import { Save, Languages, Plus, Trash2, Key, Globe, Box, Check } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { themePalettes } from '../theme/palettes'

function withRecommendedProviders(data) {
  const providers = data.providers?.length ? data.providers : [
    {
      id: 'gemini',
      name: 'Gemini',
      kind: 'gemini-openai-compatible',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: '',
      models: ['gemini-3.5-flash'],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      kind: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    },
  ]

  return {
    ...data,
    providers,
    authorModel: data.authorModel || 'gemini/gemini-3.5-flash',
    editorModel: data.editorModel || 'deepseek/deepseek-v4-pro',
    reviewerModels: {
      editorial_lore: data.reviewerModels?.editorial_lore || 'deepseek/deepseek-v4-pro',
      editorial_causality: data.reviewerModels?.editorial_causality || 'deepseek/deepseek-v4-pro',
      ...(data.reviewerModels || {}),
    },
  }
}

export function ThemePaletteOption({ palette, active, onSelect }) {
  const { t } = useI18n()
  const preview = palette.preview || {
    surface: palette.swatches?.[0],
    sidebar: palette.swatches?.[0],
    accent: palette.swatches?.[1],
    ink: palette.swatches?.[2],
  }

  return (
    <button
      type="button"
      className={`theme-palette-button ${active ? 'active' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span
        className="theme-palette-preview-card"
        style={{
          '--theme-preview-surface': preview.surface,
          '--theme-preview-sidebar': preview.sidebar,
          '--theme-preview-accent': preview.accent,
          '--theme-preview-ink': preview.ink,
        }}
      >
        <span className="theme-palette-preview-sidebar" />
        <span className="theme-palette-preview-content">
          <span className="theme-palette-preview-line strong" />
          <span className="theme-palette-preview-line" />
          <span className="theme-palette-preview-accent" />
        </span>
      </span>
      <span className="theme-palette-label">
        <span>{t(palette.labelKey)}</span>
        {active && <Check size={12} />}
      </span>
    </button>
  )
}

export function SettingsPanel({ addToast, theme, toggleTheme, currentBook }) {
  const { t, lang, switchLang } = useI18n()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.providers) data.providers = []
        if (!data.reviewerModels) data.reviewerModels = {}
        setSettings(withRecommendedProviders(data))
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        addToast?.(t('settings.loadFailed'), 'error')
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    try {
      const resp = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (resp.ok) {
        addToast?.(t('settings.saved'), 'success')
      } else {
        throw new Error('Save failed')
      }
    } catch {
      addToast?.(t('settings.saveFailed'), 'error')
    }
  }

  const updateProvider = (index, field, value) => {
    const newProviders = [...settings.providers]
    if (field === 'models') {
      newProviders[index][field] = value.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      newProviders[index][field] = value
    }
    setSettings({ ...settings, providers: newProviders })
  }

  const addProvider = () => {
    const newProvider = {
      id: `custom_${Date.now()}`,
      name: t('settings.newProvider'),
      baseUrl: 'https://',
      apiKey: '',
      models: ['default-model']
    }
    setSettings({ ...settings, providers: [...settings.providers, newProvider] })
  }

  const removeProvider = (index) => {
    const newProviders = settings.providers.filter((_, i) => i !== index)
    setSettings({ ...settings, providers: newProviders })
  }

  if (loading || !settings) {
    return <div style={{ padding: 40, textAlign: 'center' }}>{t('settings.loading')}</div>
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header aligned like Brainstorm */}
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Globe size={18} style={{ color: 'var(--accent)' }} /> 
        {t('settings.title') || 'Settings'}
      </h2>

      {/* Providers Configuration */}
      <Section title={t('settings.apiConfig') || 'API & Providers'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {settings.providers.map((provider, i) => (
            <div key={provider.id} style={{ 
              background: 'var(--bg-elevated)', 
              border: '1px solid var(--border-subtle)', 
              borderRadius: 'var(--radius-lg)', 
              padding: 16 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <input 
                  className="input" 
                  value={provider.name} 
                  onChange={e => updateProvider(i, 'name', e.target.value)}
                  style={{ fontWeight: 600, background: 'transparent', border: 'none', padding: 0, fontSize: 14 }}
                />
                <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => removeProvider(i)}>
                  <Trash2 size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Globe size={10}/> {t('settings.baseUrl')}</label>
                  <input className="input" value={provider.baseUrl} onChange={e => updateProvider(i, 'baseUrl', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Key size={10}/> {t('settings.apiKey')}</label>
                  <input className="input" type="password" placeholder="sk-..." value={provider.apiKey} onChange={e => updateProvider(i, 'apiKey', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Box size={10}/> {t('settings.providerModels')}</label>
                  <input className="input" value={provider.models.join(', ')} onChange={e => updateProvider(i, 'models', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          
          <button className="btn btn-secondary" onClick={addProvider} style={{ display: 'flex', justifyContent: 'center', borderStyle: 'dashed' }}>
            <Plus size={14} /> {t('settings.addProvider')}
          </button>
        </div>
      </Section>

      {/* Models Selection */}
      <Section title={t('settings.modelConfig') || 'Model Assignment'}>
        <ModelSelector 
          label={t('settings.authorModel') || 'Author Model'} 
          value={settings.authorModel} 
          onChange={v => setSettings({ ...settings, authorModel: v })}
          providers={settings.providers} 
        />
        <ModelSelector
          label={t('settings.editorModel') || 'Editor Model'}
          value={settings.editorModel}
          onChange={v => setSettings({ ...settings, editorModel: v })}
          providers={settings.providers}
        />
        <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <div className="field-label" style={{ marginBottom: 8 }}>{t('settings.reviewerModels')}</div>
          {REVIEWER_MODEL_LABELS.map(item => (
            <ModelSelector
              key={item.id}
              label={t(item.labelKey)}
              value={settings.reviewerModels?.[item.id] || ''}
              onChange={v => setSettings({
                ...settings,
                reviewerModels: { ...(settings.reviewerModels || {}), [item.id]: v }
              })}
              providers={settings.providers}
              includeDefault
            />
          ))}
        </div>
      </Section>

      {/* Context Manager: mode dropdown + breaker reset.
          contextManager is persisted globally via settings.json; breaker reset
          is per-book since the breaker file lives in the book directory. */}
      <Section title={t('settings.context')}>
        <div className="field">
          <label className="field-label">{t('settings.contextMode')}</label>
          <select
            className="select"
            value={settings.contextManager ?? 'auto'}
            onChange={e => setSettings({ ...settings, contextManager: e.target.value })}
          >
            <option value="auto">{t('settings.contextModeAuto')}</option>
            <option value="decay_only">{t('settings.contextModeDecayOnly')}</option>
            <option value="disabled">{t('settings.contextModeDisabled')}</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!currentBook}
            onClick={async () => {
              if (!currentBook) return
              try {
                const resp = await fetch(`/api/v1/books/${currentBook.book_id}/context/reset-breaker`, { method: 'POST' })
                if (!resp.ok) throw new Error('reset failed')
                addToast?.(t('settings.resetBreaker'), 'success')
              } catch {
                addToast?.('Reset failed', 'error')
              }
            }}
          >
            {t('settings.resetBreaker')}
          </button>
        </div>
      </Section>

      <Section title={t('settings.appearance') || 'Appearance'}>
        <div className="theme-palette-grid">
          {themePalettes.map(palette => (
            <ThemePaletteOption
              key={palette.id}
              palette={palette}
              active={theme === palette.id}
              onSelect={() => toggleTheme(palette.id)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="field-label" style={{ margin: 0 }}>{t('settings.language')}</span>
          <button className="btn btn-secondary btn-sm" onClick={switchLang}>
            <Languages size={12} />
            {lang === 'zh' ? t('settings.switchToEnglish') : t('settings.switchToChinese')}
          </button>
        </div>
      </Section>

      <div style={{ position: 'sticky', bottom: 0, padding: '16px 0', background: 'var(--bg)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', marginTop: 24 }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave}><Save size={14} /> {t('settings.save') || 'Save Changes'}</button>
      </div>
    </div>
  )
}

const REVIEWER_MODEL_LABELS = [
  { id: 'editorial_lore', labelKey: 'review.reader.lore' },
  { id: 'editorial_causality', labelKey: 'review.reader.causality' },
]

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 className="label-sc" style={{ fontSize: 13, fontWeight: 600, paddingBottom: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function ModelSelector({ label, value, onChange, providers, includeDefault = false }) {
  const { t } = useI18n()
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
        {includeDefault && <option value="">{t('settings.defaultEditorModel')}</option>}
        {providers.map(p => (
          <optgroup key={p.id} label={p.name}>
            {p.models.map(m => (
              <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
