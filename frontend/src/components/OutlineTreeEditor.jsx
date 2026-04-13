import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, BookOpen, Folder, FileText, ScrollText, Edit3, Check, GitBranch, ListTree, RefreshCw } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

const defaultOutline = {
  id: 'book_1',
  label: 'outline.myNovel',
  type: 'book',
  children: []
}

const iconMap = { book: BookOpen, volume: Folder, chapter: FileText, scene: ScrollText }

export function OutlineTreeEditor({ addToast, currentBook, dataVersion }) {
  const { t } = useI18n()
  const [tree, setTree] = useState(defaultOutline)
  const [plotTree, setPlotTree] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('outline') // 'outline' | 'plot-tree'

  const fetchOutline = useCallback(() => {
    if (!currentBook) { setLoading(false); return }
    fetch(`/api/v1/books/${currentBook.book_id}/outline`)
      .then(r => r.json())
      .then(data => { setTree(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [currentBook])

  const fetchPlotTree = useCallback(() => {
    if (!currentBook) return
    fetch(`/api/v1/books/${currentBook.book_id}/plot-tree`)
      .then(r => r.json())
      .then(data => setPlotTree(data))
      .catch(() => {})
  }, [currentBook])

  // Re-fetch when book changes or dataVersion bumps
  useEffect(() => {
    setLoading(true)
    fetchOutline()
    fetchPlotTree()
  }, [currentBook, dataVersion, fetchOutline, fetchPlotTree])

  const handleSave = async () => {
    if (!currentBook) { addToast?.('No book selected', 'warning'); return }
    try {
      const resp = await fetch(`/api/v1/books/${currentBook.book_id}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree)
      })
      if (resp.ok) {
        addToast?.(t('outline.saved'), 'success')
      } else {
        throw new Error('Save failed')
      }
    } catch (e) {
      console.error(e)
      addToast?.('Failed to save outline', 'error')
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>

  if (!currentBook) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <BookOpen size={32} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
        <p>{t('outline.noBook')}</p>
      </div>
    )
  }

  const updateNodeLabel = (nodeId, newLabel) => {
    const updateNode = (node) => {
      if (node.id === nodeId) return { ...node, label: newLabel }
      if (!node.children) return node
      return { ...node, children: node.children.map(updateNode) }
    }
    setTree(updateNode(tree))
  }

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with mode toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setMode('outline')} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
            background: mode === 'outline' ? 'var(--accent)' : 'var(--bg-subtle)',
            color: mode === 'outline' ? '#fff' : 'var(--text-secondary)',
            fontWeight: mode === 'outline' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4,
          }}><ListTree size={12} /> {t('outline.tabOutline')}</button>
          <button onClick={() => setMode('plot-tree')} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 11, border: 'none', cursor: 'pointer',
            background: mode === 'plot-tree' ? 'var(--accent)' : 'var(--bg-subtle)',
            color: mode === 'plot-tree' ? '#fff' : 'var(--text-secondary)',
            fontWeight: mode === 'plot-tree' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4,
          }}><GitBranch size={12} /> {t('outline.tabPlotTree')}</button>
        </div>
        {mode === 'outline' && (
          <button className="btn btn-sm" onClick={handleSave}>
            <Check size={12} /> {t('outline.save')}
          </button>
        )}
        {mode === 'plot-tree' && (
          <button className="btn btn-sm" onClick={fetchPlotTree}>
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {mode === 'outline' && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, flexShrink: 0 }}>{t('outline.hint')}</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <OutlineNode node={tree} level={0} t={t} onLabelChange={updateNodeLabel} />
          </div>
        </>
      )}

      {mode === 'plot-tree' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PlotTreeView data={plotTree} />
        </div>
      )}
    </div>
  )
}

// ── Outline tree node ──

function OutlineNode({ node, level, t, onLabelChange }) {
  const [open, setOpen] = useState(level < 3)
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState((node.label || '').includes('outline.') ? t(node.label) : (node.label || ''))
  const hasChildren = node.children?.length > 0
  const Icon = iconMap[node.type] || FileText

  const finishEditing = () => {
    setEditing(false)
    onLabelChange(node.id, label)
  }

  return (
    <div>
      <div className={`tree-item ${editing ? 'editing' : ''}`} style={{ paddingLeft: 8 + level * 20, display: 'flex', alignItems: 'center', gap: 4 }}>
        <GripVertical size={10} style={{ opacity: 0.3, cursor: 'grab' }} />
        <span className={`tree-item-toggle ${open ? 'open' : ''}`}
          style={{ visibility: hasChildren ? 'visible' : 'hidden', cursor: 'pointer' }}
          onClick={() => setOpen(!open)}>
          <ChevronRight size={12} />
        </span>
        <span style={{ color: hasChildren ? 'var(--warning)' : 'var(--accent)' }}><Icon size={14} /></span>
        {editing ? (
          <input
            className="input input-sm"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={e => e.key === 'Enter' && finishEditing()}
            autoFocus
            style={{ flex: 1, height: 22, fontSize: 12 }}
          />
        ) : (
          <span className="tree-item-label" style={{ flex: 1 }} onDoubleClick={() => setEditing(true)}>{(node.label || '').includes('outline.') ? t(node.label) : (node.label || '')}</span>
        )}
        <button className="btn-icon" onClick={() => setEditing(!editing)} style={{ opacity: 0.5 }}><Edit3 size={11} /></button>
        {node.type === 'scene' && <button className="btn-icon" style={{ opacity: 0.3 }}><Trash2 size={11} /></button>}
        {hasChildren && <button className="btn-icon" style={{ opacity: 0.3 }}><Plus size={11} /></button>}
      </div>
      {node.summary && !editing && (
        <div style={{ paddingLeft: 30 + level * 20, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, marginBottom: 2 }}>
          {t(node.summary)}
        </div>
      )}
      {hasChildren && open && (
        <div>{node.children.map(c => <OutlineNode key={c.id} node={c} level={level + 1} t={t} onLabelChange={onLabelChange} />)}</div>
      )}
    </div>
  )
}

// ── Plot Tree visualization ──

const statusColors = {
  confirmed: 'var(--success)',
  draft: 'var(--accent)',
  pruned: 'var(--text-muted)',
  alternative: 'var(--warning)',
}

const typeIcons = {
  arc: '📂',
  chapter: '📄',
  turning_point: '⚡',
  branch: '🌿',
  convergence: '🔀',
}

function PlotTreeView({ data }) {
  const { t } = useI18n()
  if (!data || !data.nodes || Object.keys(data.nodes).length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        <GitBranch size={32} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
        <p>{t('outline.noPlotTree')}</p>
        <p style={{ fontSize: 11 }}>{t('outline.plotTreeHint')}</p>
      </div>
    )
  }

  const nodes = data.nodes
  const rootId = data.root_id

  // Build children map for tree traversal
  const childrenMap = {}
  for (const [id, node] of Object.entries(nodes)) {
    const parentId = node.parent
    if (parentId) {
      if (!childrenMap[parentId]) childrenMap[parentId] = []
      childrenMap[parentId].push(id)
    }
  }

  // Find root nodes: explicit root_id, or any node whose parent doesn't resolve to a real node
  // (parent missing, null, or pointing to a sentinel like "root")
  let rootNodes = []
  if (rootId && nodes[rootId]) {
    rootNodes = [rootId]
  } else {
    rootNodes = Object.entries(nodes)
      .filter(([, n]) => !n.parent || !nodes[n.parent])
      .map(([id]) => id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rootNodes.map(id => (
        <PlotTreeNode key={id} nodeId={id} nodes={nodes} childrenMap={childrenMap} level={0} />
      ))}
    </div>
  )
}

function PlotTreeNode({ nodeId, nodes, childrenMap, level }) {
  const [open, setOpen] = useState(level < 2)
  const node = nodes[nodeId]
  if (!node) return null

  const children = childrenMap[nodeId] || []
  const hasChildren = children.length > 0
  const status = node.status || 'draft'
  const color = statusColors[status] || 'var(--text-secondary)'
  const icon = typeIcons[node.type] || '📝'

  return (
    <div>
      <div style={{
        paddingLeft: 8 + level * 20,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 0',
        opacity: status === 'pruned' ? 0.45 : 1,
      }}>
        <span
          style={{ cursor: hasChildren ? 'pointer' : 'default', color: 'var(--text-muted)', width: 14, textAlign: 'center' }}
          onClick={() => hasChildren && setOpen(!open)}
        >
          {hasChildren ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : ''}
        </span>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{node.title || nodeId}</span>
        <span style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
          background: color, color: '#fff', opacity: 0.85,
        }}>{status}</span>
        {node.type && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{node.type}</span>}
      </div>
      {node.description && open && (
        <div style={{ paddingLeft: 34 + level * 20, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 2 }}>
          {node.description}
        </div>
      )}
      {hasChildren && open && children.map(childId => (
        <PlotTreeNode key={childId} nodeId={childId} nodes={nodes} childrenMap={childrenMap} level={level + 1} />
      ))}
    </div>
  )
}
