import { useState, useEffect, useRef, useCallback } from 'react'
import { Save, Languages, Plus, Trash2, Key, Globe, Box, Check, Network, Sparkles, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { useBackdropIntensity } from '../hooks/useBackdropIntensity'
import { themePalettes } from '../theme/palettes'

const CODEX_PROVIDER_KIND = 'codex-oauth'
// Models offered when adding a Codex provider. reasoning effort is set server-side
// via request body, not the model name, so we keep the selectable list short.
const CODEX_DEFAULT_MODELS = ['gpt-5.1-codex', 'gpt-5.1', 'gpt-5.1-codex-mini']

function openExternalUrl(url) {
  if (!url) return
  // window.open works in both web and the Tauri webview; the server never opens
  // the browser itself, so the frontend is responsible for launching it.
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // Best-effort fallback for environments that reject window.open targets.
    window.location.assign(url)
  }
}

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
    networkProxy: data.networkProxy || { enabled: false, url: '' },
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
  const { intensity, setIntensity, INTENSITY_OPTIONS } = useBackdropIntensity()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  // Codex (ChatGPT subscription) login state. `codex.state` mirrors the backend
  // status machine: idle | pending | success | error.
  const [codex, setCodex] = useState({ state: 'idle', message: '', accountId: '', planType: '' })
  const codexPollRef = useRef(null)

  const stopCodexPoll = useCallback(() => {
    if (codexPollRef.current) {
      clearInterval(codexPollRef.current)
      codexPollRef.current = null
    }
  }, [])

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

  // Reflect current login state on panel mount via the offline info endpoint.
  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/auth/codex/info')
      .then(r => r.json())
      .then(info => {
        if (cancelled || !info?.authenticated) return
        setCodex({
          state: 'success',
          message: '',
          accountId: info.account_id || '',
          planType: info.plan_type || '',
        })
      })
      .catch(() => { /* offline read failure is non-fatal; stay idle */ })
    return () => {
      cancelled = true
      stopCodexPoll()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pollCodexStatus = useCallback(() => {
    stopCodexPoll()
    codexPollRef.current = setInterval(async () => {
      try {
        const resp = await fetch('/api/v1/auth/codex/status')
        const status = await resp.json()
        if (status.state === 'success') {
          stopCodexPoll()
          setCodex({
            state: 'success',
            message: '',
            accountId: status.account_id || '',
            planType: status.plan_type || '',
          })
          addToast?.(t('settings.codexSuccess'), 'success')
        } else if (status.state === 'error' || status.state === 'idle') {
          stopCodexPoll()
          setCodex({ state: 'error', message: status.message || '', accountId: '', planType: '' })
          addToast?.(status.message || t('settings.codexAuthFailed'), 'error')
        }
        // 'pending' → keep polling
      } catch {
        stopCodexPoll()
        setCodex({ state: 'error', message: t('settings.codexAuthFailed'), accountId: '', planType: '' })
        addToast?.(t('settings.codexAuthFailed'), 'error')
      }
    }, 1000)
  }, [stopCodexPoll, addToast, t])

  const handleCodexLogin = useCallback(async () => {
    setCodex({ state: 'pending', message: '', accountId: '', planType: '' })
    try {
      const resp = await fetch('/api/v1/auth/codex/start', { method: 'POST' })
      if (!resp.ok) throw new Error('start failed')
      const data = await resp.json()
      if (!data?.authorize_url) throw new Error('no url')
      openExternalUrl(data.authorize_url)
      pollCodexStatus()
    } catch {
      stopCodexPoll()
      setCodex({ state: 'error', message: '', accountId: '', planType: '' })
      addToast?.(t('settings.codexStartFailed'), 'error')
    }
  }, [pollCodexStatus, stopCodexPoll, addToast, t])

  const handleCodexCancel = useCallback(() => {
    stopCodexPoll()
    setCodex({ state: 'idle', message: '', accountId: '', planType: '' })
    addToast?.(t('settings.codexCancelled'), 'info')
  }, [stopCodexPoll, addToast, t])

  const handleCodexLogout = useCallback(async () => {
    stopCodexPoll()
    try {
      const resp = await fetch('/api/v1/auth/codex/logout', { method: 'POST' })
      if (!resp.ok) throw new Error('logout failed')
      setCodex({ state: 'idle', message: '', accountId: '', planType: '' })
      addToast?.(t('settings.codexLoggedOut'), 'success')
    } catch {
      addToast?.(t('settings.codexLogoutFailed'), 'error')
    }
  }, [stopCodexPoll, addToast, t])

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

  const addCodexProvider = () => {
    // A codex-oauth provider carries no apiKey and an empty baseUrl; the model
    // selector still uses `<providerId>/<modelName>`. Reuse an existing codex
    // provider if one is already present so we don't create duplicates.
    if (settings.providers.some(p => p.kind === CODEX_PROVIDER_KIND)) {
      addToast?.(t('settings.codexProviderName'), 'info')
      return
    }
    const newProvider = {
      id: `codex_${Date.now()}`,
      name: t('settings.codexProviderName'),
      kind: CODEX_PROVIDER_KIND,
      baseUrl: '',
      apiKey: '',
      models: [...CODEX_DEFAULT_MODELS],
    }
    setSettings({ ...settings, providers: [...settings.providers, newProvider] })
  }

  const removeProvider = (index) => {
    const newProviders = settings.providers.filter((_, i) => i !== index)
    setSettings({ ...settings, providers: newProviders })
  }

  const updateNetworkProxy = (patch) => {
    setSettings({
      ...settings,
      networkProxy: {
        enabled: false,
        url: '',
        ...(settings.networkProxy || {}),
        ...patch,
      },
    })
  }

  if (loading || !settings) {
    return (
      <div className="settings-panel">
        <div className="settings-panel-inner settings-panel-loading">
          {t('settings.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel-inner">
      {/* Header aligned like Brainstorm */}
      <h2 className="settings-panel-title">
        {t('settings.title') || 'Settings'}
      </h2>

      {/* Providers Configuration */}
      <Section title={t('settings.apiConfig') || 'API & Providers'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {settings.providers.map((provider, i) => {
            const isCodex = provider.kind === CODEX_PROVIDER_KIND
            return (
            <div key={provider.id} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <input
                    className="input"
                    value={provider.name}
                    onChange={e => updateProvider(i, 'name', e.target.value)}
                    style={{ fontWeight: 600, background: 'transparent', border: 'none', padding: 0, fontSize: 14 }}
                  />
                  {isCodex && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', flex: '0 0 auto',
                      borderRadius: 'var(--radius-full)', color: 'var(--accent)',
                      background: 'color-mix(in oklch, var(--accent) 14%, transparent)',
                    }}>
                      <Sparkles size={10} /> {t('settings.codexProviderBadge')}
                    </span>
                  )}
                </div>
                <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => removeProvider(i)}>
                  <Trash2 size={14} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                {!isCodex && (
                  <div className="field">
                    <label className="field-label" style={{ fontSize: 11 }}><Globe size={10}/> {t('settings.baseUrl')}</label>
                    <input className="input" value={provider.baseUrl} onChange={e => updateProvider(i, 'baseUrl', e.target.value)} />
                  </div>
                )}
                {isCodex ? (
                  <div className="settings-help" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Key size={10} /> {t('settings.codexNoApiKey')}
                  </div>
                ) : (
                  <div className="field">
                    <label className="field-label" style={{ fontSize: 11 }}><Key size={10}/> {t('settings.apiKey')}</label>
                    <input className="input" type="password" placeholder="sk-..." value={provider.apiKey} onChange={e => updateProvider(i, 'apiKey', e.target.value)} />
                  </div>
                )}
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Box size={10}/> {t('settings.providerModels')}</label>
                  <input className="input" value={provider.models.join(', ')} onChange={e => updateProvider(i, 'models', e.target.value)} />
                </div>
              </div>
            </div>
            )
          })}

          <button className="btn btn-secondary" onClick={addProvider} style={{ display: 'flex', justifyContent: 'center', borderStyle: 'dashed' }}>
            <Plus size={14} /> {t('settings.addProvider')}
          </button>

          {/* ChatGPT subscription (Codex) login + provider entry */}
          <div className="settings-proxy-card">
            <div className="settings-proxy-row">
              <div className="settings-proxy-heading">
                <Sparkles size={14} />
                <span>{t('settings.codexTitle')}</span>
              </div>
              {codex.state === 'success' && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: 'var(--success)',
                }}>
                  <Check size={12} /> {t('settings.codexLoggedIn')}
                </span>
              )}
            </div>
            <div className="settings-help">{t('settings.codexDesc')}</div>

            {codex.state === 'success' ? (
              <>
                <div className="settings-help" style={{ color: 'var(--ink-secondary)' }}>
                  {codex.accountId && <div>{t('settings.codexAccount')}: {codex.accountId}</div>}
                  {codex.planType && <div>{t('settings.codexPlan')}: {codex.planType}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleCodexLogout}>
                    <LogOut size={12} /> {t('settings.codexLogout')}
                  </button>
                </div>
              </>
            ) : codex.state === 'pending' ? (
              <>
                <div className="settings-help" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-secondary)' }}>
                  <Loader2 size={12} className="anim-spin" /> {t('settings.codexLoggingIn')}
                </div>
                <div className="settings-help">{t('settings.codexWaitingHint')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleCodexCancel}>
                    {t('settings.codexCancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {codex.state === 'error' && codex.message && (
                  <div className="settings-help" style={{ color: 'var(--danger)' }}>{codex.message}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleCodexLogin}>
                    <LogIn size={12} /> {t('settings.codexLogin')}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={addCodexProvider}>
                    <Plus size={12} /> {t('settings.codexAddProvider')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('settings.network')}>
        <div className="settings-proxy-card">
          <div className="settings-proxy-row">
            <div className="settings-proxy-heading">
              <Network size={14} />
              <span>{t('settings.proxyEnable')}</span>
            </div>
            <button
              type="button"
              className={`settings-switch ${settings.networkProxy?.enabled ? 'active' : ''}`}
              role="switch"
              aria-checked={settings.networkProxy?.enabled ? 'true' : 'false'}
              onClick={() => updateNetworkProxy({ enabled: !settings.networkProxy?.enabled })}
            >
              <span />
            </button>
          </div>
          <div className="field">
            <label className="field-label">{t('settings.proxyUrl')}</label>
            <input
              className="input"
              value={settings.networkProxy?.url || ''}
              placeholder="http://127.0.0.1:7890"
              disabled={!settings.networkProxy?.enabled}
              onChange={e => updateNetworkProxy({ url: e.target.value })}
            />
          </div>
          <div className="settings-help">{t('settings.proxyHint')}</div>
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
        <div className="field" style={{ marginBottom: 4 }}>
          <label className="field-label">{t('settings.backdrop')}</label>
          <div
            role="radiogroup"
            aria-label={t('settings.backdrop')}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${INTENSITY_OPTIONS.length}, 1fr)`,
              gap: 4,
              padding: 4,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
            }}
          >
            {INTENSITY_OPTIONS.map(opt => {
              const active = intensity === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active ? 'true' : 'false'}
                  className={`btn ${active ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  style={{ justifyContent: 'center', width: '100%' }}
                  onClick={() => setIntensity(opt.value)}
                >
                  {t(opt.labelKey) || opt.label}
                </button>
              )
            })}
          </div>
          <div className="settings-help">{t('settings.backdropHint')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="field-label" style={{ margin: 0 }}>{t('settings.language')}</span>
          <button className="btn btn-secondary btn-sm" onClick={switchLang}>
            <Languages size={12} />
            {lang === 'zh' ? t('settings.switchToEnglish') : t('settings.switchToChinese')}
          </button>
        </div>
      </Section>

      <div className="settings-panel-actions">
        <button className="btn btn-primary btn-lg" onClick={handleSave}><Save size={14} /> {t('settings.save') || 'Save Changes'}</button>
      </div>
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
