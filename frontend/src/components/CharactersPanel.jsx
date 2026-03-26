import { useState, useEffect } from 'react'
import { ChevronRight, Eye, EyeOff, Target, Users, Loader } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

export function CharactersPanel({ currentBook }) {
  const { t } = useI18n()
  const [lore, setLore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentBook) { setLoading(false); return }
    setLoading(true)
    // Load lore from brainstorm session
    fetch(`/api/v1/books/${currentBook}/outline`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        // Also try brainstorm session for lore
        fetch(`/api/v1/brainstorm/${currentBook}/session`)
          .then(r => r.ok ? r.json() : null)
          .then(session => {
            const lorData = session?.lore || {}
            setLore(lorData)
            setLoading(false)
          })
          .catch(() => { setLore({}); setLoading(false) })
      })
      .catch(() => { setLore({}); setLoading(false) })
  }, [currentBook])

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><Loader size={18} className="spin" /></div>

  if (!currentBook) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>请先选择一本书</div>
  }

  if (!lore || (!lore.protagonist && !lore.worldSetting)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Users size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p style={{ fontSize: 14 }}>尚未创建角色设定</p>
        <p style={{ fontSize: 12 }}>请在「创意沙盘」中完善角色和世界观设定</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 8px' }}>
      {lore.protagonist && (
        <AccSection title="主角设定" icon={Eye} variant="success" content={lore.protagonist} />
      )}
      {lore.worldSetting && (
        <AccSection title="世界观设定" icon={Target} variant="info" content={lore.worldSetting} />
      )}
      {lore.synopsis && (
        <AccSection title="故事梗概" icon={EyeOff} variant="warning" content={lore.synopsis} />
      )}
      {lore.title && (
        <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-surface)', fontSize: 12 }}>
          <span style={{ fontWeight: 600, marginRight: 8 }}>书名：</span>{lore.title}
        </div>
      )}
    </div>
  )
}

function AccSection({ title, icon: Icon, variant, content }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`acc-item ${open ? 'open' : ''}`}>
      <button className="acc-header" onClick={() => setOpen(!open)}>
        <ChevronRight size={10} />
        {Icon && <Icon size={12} />}
        <span style={{ flex: 1 }}>{title}</span>
        <span className={`badge badge-${variant}`}>{content ? '✓' : '—'}</span>
      </button>
      <div className="acc-body">
        <div style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
          {content || '未设定'}
        </div>
      </div>
    </div>
  )
}
