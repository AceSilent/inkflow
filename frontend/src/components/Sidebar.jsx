import { useState, useEffect } from 'react'
import {
  BookMarked,
  BookPlus,
  ChevronRight,
  FilePenLine,
  Files,
  Layers3,
  ScrollText,
  Search,
  Settings,
  Smartphone,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { bookResourcePath } from '../api/books'
import { useI18n } from '../hooks/useI18n'
import { bottomSidebarActions, primarySidebarActions } from './studio/sidebarNavigation'
import { fetchExplorerTree } from './sidebarTreeFetch'
import { toRoman } from '../utils/roman'

function matchesTreeQuery(node, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return `${node.label || ''} ${node.id || ''}`.toLowerCase().includes(normalized)
}

function filterTree(nodes, query) {
  const normalized = query.trim()
  if (!normalized) return nodes

  return nodes
    .map(node => {
      const children = node.children ? filterTree(node.children, normalized) : []
      if (matchesTreeQuery(node, normalized) || children.length > 0) {
        return { ...node, children }
      }
      return null
    })
    .filter(Boolean)
}

const primaryIcons = {
  'new-chat': SquarePen,
  'new-book': BookPlus,
  search: Search,
}

const bottomIcons = {
  settings: Settings,
  mobile: Smartphone,
}

const treeIcons = {
  book: BookMarked,
  volume: Layers3,
  chapter: ScrollText,
  draft: FilePenLine,
  scene: Files,
}

function treeIconColor(type) {
  if (type === 'book') return 'var(--accent)'
  if (type === 'volume') return 'var(--ink-secondary)'
  if (type === 'chapter') return 'color-mix(in oklch, var(--accent) 72%, var(--ink-secondary))'
  return 'var(--ink-muted)'
}

export function Sidebar({ activePanel, addToast, onSelect, onBookSelect, onNewConversation, onCreateBookClick, onActivityClick, dataVersion }) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [treeData, setTreeData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTree = async (showFeedback = false) => {
    setLoading(true)
    const result = await fetchExplorerTree()
    setLoading(false)

    if (!result.ok) {
      if (result.error) console.error(result.error)
      if (showFeedback) addToast?.(t('sidebar.refreshFailed'), 'error')
      return null
    }

    const tree = result.tree
    setTreeData(tree)
    const books = tree.filter(n => n.type === 'book')
    const savedBookId = localStorage.getItem('autonovel:lastBookId')
    const restored = books.find(n => n.id === savedBookId) || (!selectedId ? books[books.length - 1] : null)
    if (restored && selectedId !== restored.id) {
      setSelectedId(restored.id)
      onBookSelect?.({ book_id: restored.id, title: restored.label })
    }
    if (showFeedback) addToast?.(t('sidebar.refreshed'), 'success')
    return books.map(n => n.id)
  }

  useEffect(() => {
    fetchTree()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])

  const handleNodeSelect = (node, bookId) => {
    setSelectedId(node.id)
    onActivityClick?.('explorer')
    if (node.type === 'book') {
      localStorage.setItem('autonovel:lastBookId', node.id)
      onBookSelect?.({ book_id: node.id, title: node.label })
    }
    if (node.type === 'scene') {
      onSelect?.({ id: node.id, label: node.label, type: 'scene', bookId })
    }
    if (node.type === 'chapter' || node.type === 'volume' || node.type === 'draft') {
      // Also set book context so ChapterWorkbench gets the bookId
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
      const res = await fetch(bookResourcePath(node.id), { method: 'DELETE' })
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

  const handlePrimaryAction = (id) => {
    if (id === 'new-chat') {
      setSelectedId(null)
      setSearchQuery('')
      onNewConversation?.()
      return
    }
    if (id === 'new-book') {
      onCreateBookClick?.()
      return
    }
    onActivityClick?.(id)
  }

  const visibleTree = filterTree(treeData, activePanel === 'search' ? searchQuery : '')

  return (
    <aside className="sidebar studio-sidebar-panel">
      <div className="studio-sidebar-actions" aria-label={t('sidebar.primaryNav')}>
        {primarySidebarActions(t).map(action => {
          const Icon = primaryIcons[action.id]
          const active = action.id === 'search' && activePanel === 'search'
          return (
            <button
              key={action.id}
              type="button"
              className={`studio-sidebar-action ${active ? 'active' : ''}`}
              onClick={() => handlePrimaryAction(action.id)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{action.label}</span>
              {action.shortcut && <kbd>{action.shortcut}</kbd>}
            </button>
          )
        })}
      </div>

      {activePanel === 'search' && (
        <div className="studio-sidebar-search">
          <Search size={15} />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            autoFocus
          />
        </div>
      )}

      <div className="studio-sidebar-section-label">{t('sidebar.works')}</div>

      <div className="sidebar-content studio-project-list">
        {visibleTree.map((node, idx) => (
          <TreeNode key={node.id} node={node} index={idx} bookId={node.type === 'book' ? node.id : null} selectedId={selectedId} onSelect={handleNodeSelect} onDeleteBook={handleDeleteBook} pendingDelete={pendingDelete} />
        ))}
        {!loading && visibleTree.length === 0 && (
          <div className="studio-sidebar-empty">
            {activePanel === 'search' && searchQuery.trim() ? t('sidebar.noMatches') : t('sidebar.startFromChat')}
          </div>
        )}
      </div>

      <div className="studio-sidebar-bottom">
        {bottomSidebarActions(t).map(action => {
          const Icon = bottomIcons[action.id]
          if (!action.enabled) {
            return (
              <span key={action.id} className="studio-sidebar-mobile" title={action.label}>
                <Icon size={18} />
              </span>
            )
          }
          const active = action.id === activePanel
          return (
            <button
              key={action.id}
              type="button"
              className={`studio-sidebar-action studio-sidebar-settings ${active ? 'active' : ''}`}
              onClick={() => onActivityClick?.(action.id)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{action.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function TreeNode({ node, index = 0, bookId, level = 0, selectedId, onSelect, onDeleteBook, pendingDelete }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(level < 2)
  const [hovered, setHovered] = useState(false)
  const hasChildren = node.children?.length > 0
  const Icon = typeof node.icon === 'function' ? node.icon : (treeIcons[node.type] || FilePenLine)
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
        onMouseLeave={() => setHovered(false)}
      >
        <span className={`tree-item-toggle ${open ? 'open' : ''}`} style={{ visibility: hasChildren ? 'visible' : 'hidden' }}><ChevronRight size={12} /></span>
        <span className="tree-item-icon" style={{ color: treeIconColor(node.type) }}><Icon size={15} /></span>
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
      {hasChildren && <div className={`tree-children ${!open ? 'collapsed' : ''}`}>{node.children.map((c, i) => <TreeNode key={c.id} node={c} index={i} bookId={effectiveBookId} level={level+1} selectedId={selectedId} onSelect={onSelect} onDeleteBook={onDeleteBook} pendingDelete={pendingDelete} />)}</div>}
    </div>
  )
}
