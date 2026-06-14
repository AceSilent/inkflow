import { useEffect, useState } from 'react'

const emptyLore = { world_setting: null, characters: null }

function SectionSwitch({ active, onChange }) {
  return (
    <div className="lore-workspace-switch" role="tablist" aria-label="设定分类">
      {[
        ['world_setting', '世界观'],
        ['characters', '角色'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`lore-workspace-chip ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function JsonBranch({ value, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)

  if (value === null || value === undefined || value === '') {
    return <span className="lore-workspace-muted">暂无内容</span>
  }

  if (typeof value !== 'object') {
    return <span className="lore-workspace-value">{String(value)}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="lore-workspace-muted">暂无内容</span>
    if (value.every(item => item === null || typeof item !== 'object')) {
      return <span className="lore-workspace-value">{value.filter(Boolean).join('、')}</span>
    }

    return (
      <div className="lore-workspace-branch">
        {value.map((item, index) => (
          <div key={index} className="lore-workspace-array-item">
            <JsonBranch value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) return <span className="lore-workspace-muted">暂无内容</span>

  if (depth > 0) {
    return (
      <div className="lore-workspace-fold">
        <button type="button" onClick={() => setOpen(!open)}>
          <span>{open ? '收起' : '展开'}</span>
        </button>
        {open && <JsonEntries entries={entries} depth={depth} />}
      </div>
    )
  }

  return <JsonEntries entries={entries} depth={depth} />
}

function JsonEntries({ entries, depth }) {
  return (
    <div className="lore-workspace-branch">
      {entries.map(([key, value]) => {
        const complex = value && typeof value === 'object'
        const label = key.replace(/_/g, ' ')
        return (
          <div key={key} className={`lore-workspace-row ${complex ? 'complex' : ''}`}>
            <div className="lore-workspace-key">{label}</div>
            <div className="lore-workspace-cell">
              <JsonBranch value={value} depth={depth + 1} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function LoreWorkspace({ currentBook, dataVersion }) {
  const bookId = currentBook?.book_id || currentBook?.id
  const [activeSection, setActiveSection] = useState('world_setting')
  const [lore, setLore] = useState(emptyLore)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadLore() {
      if (!bookId) {
        if (!cancelled) {
          setLore(emptyLore)
          setError(false)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(false)

      try {
        const response = await fetch(`/api/v1/books/${bookId}/lore`)
        if (!response.ok) throw new Error('lore load failed')
        const data = await response.json()
        if (cancelled) return
        setLore({
          world_setting: data?.world_setting || null,
          characters: data?.characters || null,
        })
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    window.setTimeout(loadLore, 0)

    return () => {
      cancelled = true
    }
  }, [bookId, dataVersion])

  if (!bookId) {
    return <div className="lore-workspace-empty">选择作品后查看设定</div>
  }

  const current = lore[activeSection]

  return (
    <div className="lore-workspace">
      <header className="lore-workspace-head">
        <div>
          <div className="lore-workspace-kicker">作品设定</div>
          <h2>{currentBook?.title || currentBook?.book_id || '未命名作品'}</h2>
        </div>
        <SectionSwitch active={activeSection} onChange={setActiveSection} />
      </header>

      <section className="lore-workspace-panel">
        {loading ? (
          <div className="lore-workspace-empty">正在读取设定</div>
        ) : error ? (
          <div className="lore-workspace-empty">设定读取失败</div>
        ) : current ? (
          <JsonBranch value={current} />
        ) : (
          <div className="lore-workspace-empty">
            {activeSection === 'characters' ? '暂无角色设定' : '暂无世界观设定'}
          </div>
        )}
      </section>
    </div>
  )
}
