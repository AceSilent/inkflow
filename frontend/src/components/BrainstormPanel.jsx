import { useState, useEffect, useCallback } from 'react'
import { BookOpen, ChevronRight, ChevronDown } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { AuthorChatPanel } from './AuthorChatPanel.jsx'

// Recursive JSON viewer for lore files
function LoreJsonViewer({ data, depth = 0 }) {
  const { t } = useI18n()
  if (data === null || data === undefined) return null

  // Primitive value
  if (typeof data !== 'object') {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(data)}</span>
  }

  // Array
  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: 'var(--ink-muted)' }}>{t('common.empty')}</span>
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
  if (entries.length === 0) return <span style={{ color: 'var(--ink-muted)' }}>{t('common.empty')}</span>

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
        <span style={{ color: 'var(--ink-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(value ?? '')}</span>
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
        {Array.isArray(value) && <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: 10 }}>({value.length})</span>}
      </div>
      {open && (
        <div style={{ paddingLeft: 16, marginTop: 4 }}>
          <LoreJsonViewer data={value} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

const emptyLoreFiles = { world_setting: null, characters: null }

export function BrainstormPanel({ addToast, currentBook, onDataChanged }) {
  const { t } = useI18n()

  // Lore Book State — world_setting + characters files
  const [loreFiles, setLoreFiles] = useState(emptyLoreFiles)
  const [loreSection, setLoreSection] = useState('world') // 'world' | 'chars'
  const [prevBookId, setPrevBookId] = useState(undefined)

  // Reset lore state on book change (during render, avoids useEffect cascading renders)
  const bookId = currentBook?.book_id
  if (bookId !== prevBookId) {
    setPrevBookId(bookId)
    setLoreFiles(emptyLoreFiles)
  }

  // Load lore from backend (full lore endpoint)
  const fetchLore = useCallback(() => {
    if (!currentBook?.book_id) return
    fetch(`/api/v1/books/${currentBook.book_id}/lore`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setLoreFiles({
          world_setting: data.world_setting || null,
          characters: data.characters || null,
        })
      })
      .catch(() => {})
  }, [currentBook])

  // Fetch lore when book changes
  useEffect(() => {
    fetchLore()
  }, [fetchLore])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 400px', gap: 24, height: '100%', flex: 1, minHeight: 0 }}>

      {/* LEFT PANE: Chat */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={() => { fetchLore(); onDataChanged?.() }} />
      </div>

      {/* RIGHT PANE: Lore Book */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} style={{ color: 'var(--warning)' }}/>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('brainstorm.loreTitle')}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-muted)' }}>{t('brainstorm.loreAutoUpdate')}</span>
          </div>

          <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[['world', t('brainstorm.world')],['chars', t('brainstorm.chars')]].map(([key, label]) => (
                <button key={key} onClick={() => setLoreSection(key)} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
                  background: loreSection === key ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: loreSection === key ? '#fff' : 'var(--ink-secondary)',
                  fontWeight: loreSection === key ? 600 : 400,
                }}>{label}</button>
              ))}
            </div>

            {/* World Setting Section */}
            {loreSection === 'world' && (
              <div style={{ fontSize: 12, color: 'var(--ink-secondary)', lineHeight: 1.8 }}>
                {loreFiles.world_setting ? (
                  <LoreJsonViewer data={loreFiles.world_setting} />
                ) : (
                  <div style={{ color: 'var(--ink-muted)', textAlign: 'center', padding: 20 }}>{t('brainstorm.noLore')}<br/>{t('brainstorm.willAutoGen')}</div>
                )}
              </div>
            )}

            {/* Characters Section */}
            {loreSection === 'chars' && (
              <div style={{ fontSize: 12, color: 'var(--ink-secondary)', lineHeight: 1.8 }}>
                {loreFiles.characters ? (
                  <LoreJsonViewer data={loreFiles.characters} />
                ) : (
                  <div style={{ color: 'var(--ink-muted)', textAlign: 'center', padding: 20 }}>{t('brainstorm.noChars')}<br/>{t('brainstorm.willAutoGen')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
