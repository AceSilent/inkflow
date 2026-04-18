import { useState, useEffect, useCallback } from 'react'
import { Loader, Brain } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { AddMemoryModal } from './memory/AddMemoryModal'
import { EditableField } from './outline/EditableField'

export function MemoryLibrary({ addToast }) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState('pending')
  const [counts, setCounts] = useState({ pending: 0, active: 0, archived: 0 })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [p, a, x] = await Promise.all([
        fetch('/api/v1/memory/pending').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/v1/memory/active').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/v1/memory/archived').then(r => r.ok ? r.json() : []).catch(() => []),
      ])
      setCounts({
        pending: Array.isArray(p) ? p.length : 0,
        active: Array.isArray(a) ? a.length : 0,
        archived: Array.isArray(x) ? x.length : 0,
      })
      const current = activeTab === 'pending' ? p : activeTab === 'active' ? a : x
      setItems(Array.isArray(current) ? current : [])
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { reload() }, [reload])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader size={20} className="anim-spin" />
      </div>
    )
  }

  return (
    <div className="memory-library">
      <div className="memory-topbar">
        <div className="label-sc" style={{ color: 'var(--accent)' }}>— Memory Library —</div>
        <div className="memory-tabs">
          {['pending', 'active', 'archived'].map(k => (
            <button
              key={k}
              className={`memory-tab ${activeTab === k ? 'active' : ''}`}
              onClick={() => setActiveTab(k)}
            >
              {t(`memory.${k}`)} ({counts[k]})
            </button>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => setAddOpen(true)}>
          {t('memory.addManual')}
        </button>
      </div>

      <div className="memory-content">
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
            <Brain size={32} opacity={0.3} />
            <p>暂无记忆</p>
          </div>
        )}
        {items.map(m => (
          <MemoryCard key={m.frontmatter.id} entry={m} tab={activeTab} onAction={reload} addToast={addToast} />
        ))}
      </div>

      <AddMemoryModal
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onSubmit={async ({ text, scope }) => {
          const body = { text, scope, type: 'preference', tags: [] }
          const r = await fetch('/api/v1/memory/remember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          if (r.ok) { addToast?.('已记住', 'success'); setAddOpen(false); reload() }
          else addToast?.('失败', 'error')
        }}
      />
    </div>
  )
}

function MemoryCard({ entry, tab, onAction, addToast }) {
  const { frontmatter: fm, body } = entry
  const rawBody = String(body || '')
  // The server stores auto-extracted memories with a leading `# Title` line
  // (see extractor.ts). We strip it for display but preserve it on save so
  // a user editing just the body portion doesn't accidentally erase the title.
  const titleMatch = rawBody.match(/^(#[^\n]*\n+)/)
  const titlePrefix = titleMatch ? titleMatch[1] : ''
  const bodyText = rawBody.replace(/^#[^\n]*\n+/, '').trim()

  async function patchBody(newBody) {
    try {
      const r = await fetch(`/api/v1/memory/${fm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `${titlePrefix}${newBody}` }),
      })
      if (!r.ok) throw new Error(await r.text() || 'failed')
      addToast?.('已保存', 'success')
      onAction()
    } catch (e) {
      addToast?.(e.message, 'error')
    }
  }

  return (
    <div className="memory-card">
      <div className="memory-card-head">
        <span className="label-sc" style={{ color: 'var(--accent)' }}>{fm.type}</span>
        <span className="label-sc" style={{ color: 'var(--ink-muted)' }}>
          conf {Number(fm.confidence).toFixed(2)} · {fm.scope} · {fm.source}
        </span>
      </div>
      <div className="memory-card-body">
        <EditableField multiline value={bodyText} onSave={patchBody} />
      </div>
      <MemoryActions id={fm.id} tab={tab} onAction={onAction} addToast={addToast} />
    </div>
  )
}

function MemoryActions({ id, tab, onAction, addToast }) {
  async function call(path, method = 'POST') {
    try {
      const r = await fetch(`/api/v1/memory/${id}${path}`, { method })
      if (r.ok) {
        addToast?.('已处理', 'success')
        onAction()
      } else {
        addToast?.('失败', 'error')
      }
    } catch (e) {
      addToast?.(e.message, 'error')
    }
  }
  if (tab === 'pending') {
    return (
      <div className="memory-actions">
        <button onClick={() => call('/approve')}>✓ 采用</button>
        <button onClick={() => call('/reject', 'POST')}>✗ 丢弃</button>
      </div>
    )
  }
  if (tab === 'active') {
    return (
      <div className="memory-actions">
        <button onClick={() => call('/archive')}>归档</button>
        <button onClick={() => call('', 'DELETE')}>删除</button>
      </div>
    )
  }
  if (tab === 'archived') {
    return (
      <div className="memory-actions">
        <button onClick={() => call('/restore')}>恢复激活</button>
        <button onClick={() => call('', 'DELETE')}>彻底删除</button>
      </div>
    )
  }
  return null
}
