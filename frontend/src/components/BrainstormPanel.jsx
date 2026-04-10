import { useState, useEffect } from 'react'
import { BookOpen, User, Globe, FileText, Settings, ChevronRight, ChevronDown } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'
import { AuthorChatPanel } from './AuthorChatPanel.jsx'

// Recursive JSON viewer for lore files
function LoreJsonViewer({ data, depth = 0 }) {
  if (data === null || data === undefined) return null

  // Primitive value
  if (typeof data !== 'object') {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(data)}</span>
  }

  // Array
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--text-muted)' }}>（空）</span>
    // Array of primitives — inline
    if (data.every(v => typeof v !== 'object')) {
      return <span>{data.join('、')}</span>
    }
    return (
      <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
        {data.map((item, i) => (
          <div key={i} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: '2px solid var(--border-subtle)' }}>
            <LoreJsonViewer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  // Object
  const entries = Object.entries(data)
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)' }}>（空）</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(([key, val]) => {
        const isComplex = val && typeof val === 'object'
        return (
          <LoreEntry key={key} label={key} value={val} isComplex={isComplex} depth={depth} />
        )
      })}
    </div>
  )
}

function LoreEntry({ label, value, isComplex, depth }) {
  const [open, setOpen] = useState(depth < 2)
  const prettyLabel = label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  if (!isComplex) {
    return (
      <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--accent)', minWidth: 60, flexShrink: 0 }}>{prettyLabel}:</span>
        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(value ?? '')}</span>
      </div>
    )
  }

  return (
    <div style={{ fontSize: 12 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {prettyLabel}
        {Array.isArray(value) && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>({value.length})</span>}
      </div>
      {open && (
        <div style={{ paddingLeft: 16, marginTop: 4 }}>
          <LoreJsonViewer data={value} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

export function BrainstormPanel({ addToast, currentBook, onDataChanged }) {
  const { t } = useI18n()

  // Lore Book State — now includes all lore files
  const [lore, setLore] = useState({
    title: '', genre: '', tone: '',
    protagonist: '', worldSetting: '', synopsis: '',
    targetWords: 500000,
  })
  const [loreFiles, setLoreFiles] = useState({ world_setting: null, characters: null, outline: null })
  const [loreSection, setLoreSection] = useState('meta') // 'meta' | 'world' | 'chars' | 'outline'

  // Load lore from backend (full lore endpoint)
  const fetchLore = () => {
    if (!currentBook?.book_id) return
    fetch(`/api/v1/books/${currentBook.book_id}/lore`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const m = data.meta || {}
        setLore(prev => ({
          ...prev,
          title: m.title || '',
          genre: m.genre || '',
          tone: m.tone || '',
          protagonist: m.protagonist || '',
          worldSetting: m.world_setting || '',
          synopsis: m.synopsis || '',
          targetWords: m.target_words || 500000,
        }))
        setLoreFiles({
          world_setting: data.world_setting || null,
          characters: data.characters || null,
          outline: data.outline || null,
        })
      })
      .catch(() => {})
  }

  // Reset lore state and reload on book change
  useEffect(() => {
    if (!currentBook?.book_id) {
      setLore({ title: '', genre: '', tone: '', protagonist: '', worldSetting: '', synopsis: '', targetWords: 500000 })
      return
    }

    // Reset state for clean book switch
    setLore({ title: '', genre: '', tone: '', protagonist: '', worldSetting: '', synopsis: '', targetWords: 500000 })
    fetchLore()
  }, [currentBook])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 400px', gap: 24, height: '100%', flex: 1, minHeight: 0 }}>

      {/* LEFT PANE: Chat */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={() => { fetchLore(); onDataChanged?.() }} />
      </div>

      {/* RIGHT PANE: Lore Book */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} style={{ color: 'var(--warning)' }}/>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('brainstorm.loreTitle')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{t('brainstorm.loreAutoUpdate')}</span>
          </div>

          <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['meta','基础'],['world','世界观'],['chars','角色'],['outline','大纲']].map(([key, label]) => (
                <button key={key} onClick={() => setLoreSection(key)} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
                  background: loreSection === key ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: loreSection === key ? '#fff' : 'var(--text-secondary)',
                  fontWeight: loreSection === key ? 600 : 400,
                }}>{label}</button>
              ))}
            </div>

            {/* Meta Section */}
            {loreSection === 'meta' && (
              <>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Settings size={12}/> 书名</label>
                  <input className="input" value={lore.title} onChange={e => setLore(prev => ({ ...prev, title: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={12}/> 主角设定</label>
                  <textarea className="textarea" rows={3} value={lore.protagonist} onChange={e => setLore(prev => ({ ...prev, protagonist: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Globe size={12}/> 世界观</label>
                  <textarea className="textarea" rows={3} value={lore.worldSetting} onChange={e => setLore(prev => ({ ...prev, worldSetting: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12}/> 核心梗概</label>
                  <textarea className="textarea" rows={3} value={lore.synopsis} onChange={e => setLore(prev => ({ ...prev, synopsis: e.target.value }))} />
                </div>
              </>
            )}

            {/* World Setting Section */}
            {loreSection === 'world' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.world_setting ? (
                  <LoreJsonViewer data={loreFiles.world_setting} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无世界观设定数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}

            {/* Characters Section */}
            {loreSection === 'chars' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.characters ? (
                  <LoreJsonViewer data={loreFiles.characters} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无角色设定数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}

            {/* Outline Section */}
            {loreSection === 'outline' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {loreFiles.outline ? (
                  <LoreJsonViewer data={loreFiles.outline} />
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>暂无大纲数据<br/>Agent讨论后会自动生成</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
