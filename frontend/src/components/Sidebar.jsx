import { useState, useEffect } from 'react'
import { ChevronRight, FilePlus, RefreshCw, BookOpen, FileText, ScrollText, Folder, Trash2 } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'
import { toRoman } from '../utils/roman'

export function Sidebar({ activePanel, addToast, onSelect, onBookSelect, onNewBook, dataVersion }) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(null)

  const [treeData, setTreeData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTree = async (showFeedback = false) => {
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/books/explorer')
      if (resp.ok) {
        const data = await resp.json()
        const tree = Array.isArray(data) ? data : (data.tree || [])
        setTreeData(tree)
        if (showFeedback) addToast?.(t('sidebar.refreshed'), 'success')
        return tree.filter(n => n.type === 'book').map(n => n.id)
      }
    } catch (e) {
      console.error(e)
      if (showFeedback) addToast?.(t('sidebar.refreshFailed'), 'error')
    } finally {
      setLoading(false)
    }
    return null
  }

  useEffect(() => {
    fetchTree()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const navLabels = {
    explorer: t('nav.explorer'), brainstorm: t('nav.brainstorm'), write: t('nav.write'),
    review: t('nav.review'), characters: t('nav.characters'), statistics: t('nav.statistics'), settings: t('nav.settings'),
  }

  const handleNodeSelect = (node, bookId) => {
    setSelectedId(node.id)
    if (node.type === 'book') {
      onBookSelect?.({ book_id: node.id, title: node.label })
    }
    if (node.type === 'scene') {
      onSelect?.({ id: node.id, label: node.label, type: 'scene', bookId })
    }
    if (node.type === 'chapter' || node.type === 'volume' || node.type === 'draft') {
      // Also set book context so ChapterEditor gets the bookId
      if (bookId) onBookSelect?.({ book_id: bookId, title: '' })
      onSelect?.({ id: node.id, label: node.label, type: node.type, summary: node.summary, bookId })
    }
  }

  const [pendingDelete, setPendingDelete] = useState(null) // book id pending confirmation

  const handleDeleteBook = async (node) => {
    if (pendingDelete !== node.id) {
      // First click — enter confirmation mode
      setPendingDelete(node.id)
      return
    }
    // Second click — confirmed, actually delete
    setPendingDelete(null)
    try {
      const res = await fetch(`/api/v1/books/${node.id}`, { method: 'DELETE' })
      if (res.ok) {
        addToast?.(t('sidebar.deleted').replace('{label}', node.label), 'success')
        onBookSelect?.(null)  // Clear current book
        setSelectedId(null)
        fetchTree()
      } else {
        addToast?.(t('sidebar.deleteFailed'), 'error')
      }
    } catch {
      addToast?.(t('sidebar.deleteFailed'), 'error')
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>{navLabels[activePanel] || t('nav.explorer')}</span>
        <div className="sidebar-header-actions">
          <button className="btn-icon" title={t('sidebar.newBook')} onClick={() => onNewBook?.()}>
            <FilePlus size={14} />
          </button>
          <button className="btn-icon" title={t('sidebar.refresh')} onClick={async () => {
            const bookIds = await fetchTree(true)
            // If current book no longer exists, clear selection
            if (bookIds && selectedId && !bookIds.includes(selectedId)) {
              onBookSelect?.(null)
              setSelectedId(null)
            }
          }}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        {treeData.map((node, idx) => (
          <TreeNode key={node.id} node={node} index={idx} bookId={node.type === 'book' ? node.id : null} selectedId={selectedId} onSelect={handleNodeSelect} onDeleteBook={handleDeleteBook} pendingDelete={pendingDelete} onCancelDelete={() => setPendingDelete(null)} />
        ))}
      </div>
    </aside>
  )
}

function TreeNode({ node, index = 0, bookId, level = 0, selectedId, onSelect, onDeleteBook, pendingDelete, onCancelDelete }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(level < 2)
  const [hovered, setHovered] = useState(false)
  const hasChildren = node.children?.length > 0
  const Icon = node.icon || FileText
  const isBook = node.type === 'book'
  const isConfirming = pendingDelete === node.id
  const effectiveBookId = node.type === 'book' ? node.id : bookId
  
  return (
    <div>
      <div 
        className={`tree-item ${selectedId === node.id ? 'active' : ''}`} 
        style={{ paddingLeft: 12 + level * 16 }}
        onClick={() => { if (hasChildren) setOpen(!open); onSelect?.(node, effectiveBookId); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (isConfirming) onCancelDelete?.(); }}
      >
        <span className={`tree-item-toggle ${open ? 'open' : ''}`} style={{ visibility: hasChildren ? 'visible' : 'hidden' }}><ChevronRight size={12} /></span>
        <span className="tree-item-icon" style={{ color: hasChildren ? 'var(--warning)' : 'var(--accent)' }}><Icon size={15} /></span>
        <span className="tree-item-label">
          {node.type === 'volume' && node.id !== '__orphan_drafts__' && (
            <span className="label-sc" style={{ color: 'var(--accent)', marginRight: 6 }}>
              Vol. {toRoman(index + 1)}
            </span>
          )}
          {node.type === 'chapter' && (
            <span className="label-sc" style={{ color: 'var(--accent)', marginRight: 4 }}>
              {toRoman(index + 1)}.
            </span>
          )}
          {node.label}
        </span>
        {node.type === 'chapter' && node.status && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginLeft: 4,
            background: node.status === 'draft' ? 'var(--success)' : node.status === 'reviewed' ? 'var(--accent)' : 'var(--warning)',
          }} title={node.status === 'draft' ? t('sidebar.statusDraft') : node.status === 'reviewed' ? t('sidebar.statusReviewed') : t('sidebar.statusOutline')} />
        )}
        {isBook && isConfirming && (
          <button
            style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 4, padding: '1px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
            onClick={(e) => { e.stopPropagation(); onDeleteBook?.(node); }}
          >
            {t('sidebar.confirmDelete')}
          </button>
        )}
        {isBook && hovered && !isConfirming && (
          <button
            className="btn-icon"
            style={{ marginLeft: 'auto', color: 'var(--danger)', opacity: 0.7, padding: 2 }}
            title={t('sidebar.deleteBook')}
            onClick={(e) => { e.stopPropagation(); onDeleteBook?.(node); }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {hasChildren && <div className={`tree-children ${!open ? 'collapsed' : ''}`}>{node.children.map((c, i) => <TreeNode key={c.id} node={c} index={i} bookId={effectiveBookId} level={level+1} selectedId={selectedId} onSelect={onSelect} onDeleteBook={onDeleteBook} pendingDelete={pendingDelete} onCancelDelete={onCancelDelete} />)}</div>}
    </div>
  )
}
