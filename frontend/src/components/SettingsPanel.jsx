import { useState, useEffect } from 'react'
import { Moon, Sun, Save, Languages, Plus, Trash2, Key, Globe, Box } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

export function SettingsPanel({ addToast, theme, toggleTheme }) {
  const { t, lang, switchLang } = useI18n()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.providers) data.providers = []
        setSettings(data)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        addToast?.('Failed to load settings', 'error')
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
        addToast?.(t('settings.saved') || '设置已保存', 'success')
      } else {
        throw new Error('Save failed')
      }
    } catch {
      addToast?.('Save failed', 'error')
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
      name: 'New Provider',
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
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
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
              background: 'var(--bg-surface)', 
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
                  <label className="field-label" style={{ fontSize: 11 }}><Globe size={10}/> Base URL</label>
                  <input className="input" value={provider.baseUrl} onChange={e => updateProvider(i, 'baseUrl', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Key size={10}/> API Key</label>
                  <input className="input" type="password" placeholder="sk-..." value={provider.apiKey} onChange={e => updateProvider(i, 'apiKey', e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ fontSize: 11 }}><Box size={10}/> Models (comma separated)</label>
                  <input className="input" value={provider.models.join(', ')} onChange={e => updateProvider(i, 'models', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
          
          <button className="btn btn-secondary" onClick={addProvider} style={{ display: 'flex', justifyContent: 'center', borderStyle: 'dashed' }}>
            <Plus size={14} /> Add Provider
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
      </Section>

      <Section title={t('settings.appearance') || 'Appearance'}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="field-label" style={{ margin: 0 }}>{t('settings.theme')}</span>
          <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>
            {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
            {theme === 'dark' ? t('settings.dark') : t('settings.light')}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="field-label" style={{ margin: 0 }}>{t('settings.language')}</span>
          <button className="btn btn-secondary btn-sm" onClick={switchLang}>
            <Languages size={12} />
            {lang === 'zh' ? '中文 → English' : 'English → 中文'}
          </button>
        </div>
      </Section>

      <div style={{ position: 'sticky', bottom: 0, padding: '16px 0', background: 'var(--bg-editor)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', marginTop: 24 }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave}><Save size={14} /> {t('settings.save') || 'Save Changes'}</button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, paddingBottom: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function ModelSelector({ label, value, onChange, providers }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <select className="select" value={value} onChange={e => onChange(e.target.value)}>
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
