import { useState, useEffect } from 'react'
import { ChevronRight, Plus, Trash2, GripVertical, BookOpen, Folder, FileText, ScrollText, Edit3, Check } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

const defaultOutline = {
  id: 'book_1',
  label: 'outline.myNovel',
  type: 'book',
  children: []
}

const iconMap = { book: BookOpen, volume: Folder, chapter: FileText, scene: ScrollText }

export function OutlineTreeEditor({ addToast, currentBook }) {
  const { t } = useI18n()
  const [tree, setTree] = useState(defaultOutline)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentBook) {
      setLoading(false)
      return
    }
    fetch(`/api/v1/books/${currentBook.book_id}/outline`)
      .then(r => r.json())
      .then(data => {
        setTree(data)
        setLoading(false)
      })
      .catch(e => {
        console.error("Failed to load outline", e)
        setLoading(false)
      })
  }, [currentBook])

  const handleSave = async () => {
    if (!currentBook) {
      addToast?.('No book selected', 'warning')
      return
    }
    
    try {
      const resp = await fetch(`/api/v1/books/${currentBook.book_id}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree)
      })
      if (resp.ok) {
        addToast?.(t('outline.saved') || '大纲已保存', 'success')
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
        <p>{t('outline.noBook') || '请先在左侧资源管理器中选择或创建一本小说'}</p>
      </div>
    )
  }

  const updateNodeLabel = (nodeId, newLabel) => {
    const updateTree = (nodes) => {
      // Handle the root node case
      if (nodes.id === nodeId) {
        return { ...nodes, label: newLabel }
      }
      if (!nodes.children) return nodes
      return {
        ...nodes,
        children: nodes.children.map(child => {
          if (child.id === nodeId) {
            return { ...child, label: newLabel }
          }
          if (child.children) {
            return updateTree(child)
          }
          return child
        })
      }
    }
    setTree(updateTree(tree))
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="field-label">{t('outline.title')}</div>
        <button className="btn btn-sm" onClick={handleSave}>
          <Check size={12} /> {t('outline.save')}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{t('outline.hint')}</div>
      <OutlineNode node={tree} level={0} t={t} onLabelChange={updateNodeLabel} />
    </div>
  )
}

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
