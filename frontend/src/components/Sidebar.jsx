import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  BookOpenText,
  BookPlus,
  Brain,
  ChevronRight,
  KeyRound,
  Network,
  Palette,
  Pencil,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { bookResourcePath } from '../api/books'
import { useI18n } from '../hooks/useI18n'
import { bottomSidebarActions, primarySidebarActions, settingsSidebarSections } from './studio/sidebarNavigation'
import { fetchExplorerTree } from './sidebarTreeFetch'
import { resolveRestoredBookSelection } from './sidebarSelection'

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

const settingsIcons = {
  providers: KeyRound,
  models: SlidersHorizontal,
  network: Network,
  context: Brain,
  appearance: Palette,
}

const treeIcons = {
  book: BookOpenText,
}

export function Sidebar({
  activePanel,
  addToast,
  onSelect,
  onBookSelect,
  onNewConversation,
  onCreateBookClick,
  onActivityClick,
  onSettingsBack,
  onBookRenamed,
  dataVersion,
  settingsSection = 'providers',
  onSettingsSectionChange,
}) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(null)
  const [selectedBookId, setSelectedBookId] = useState(null)
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
    const { restored, nextSelectedNodeId } = resolveRestoredBookSelection({
      books,
      savedBookId,
      selectedNodeId: selectedId,
      selectedBookId,
    })
    if (restored) {
      setSelectedId(nextSelectedNodeId)
      setSelectedBookId(restored.id)
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
      setSelectedBookId(node.id)
      onBookSelect?.({ book_id: node.id, title: node.label })
    }
    if (node.type === 'scene') {
      onSelect?.({ id: node.id, label: node.label, type: 'scene', bookId })
    }
    if (node.type === 'chapter' || node.type === 'volume' || node.type === 'draft') {
      // Also set book context so ChapterWorkbench gets the bookId
      if (bookId) {
        localStorage.setItem('autonovel:lastBookId', bookId)
        setSelectedBookId(bookId)
        onBookSelect?.({ book_id: bookId, title: '' })
      }
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
        setSelectedBookId(null)
        fetchTree()
      } else {
        addToast?.(t('sidebar.deleteFailed'), 'error')
      }
    } catch {
      addToast?.(t('sidebar.deleteFailed'), 'error')
    }
  }

  const handleRenameBook = async (node, rawName) => {
    const title = (rawName || '').trim()
    if (!title || title === node.label) return false
    try {
      const res = await fetch(bookResourcePath(node.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (res.ok) {
        addToast?.(t('sidebar.renamed').replace('{label}', title), 'success')
        onBookRenamed?.(node.id, title)
        fetchTree()
        return true
      }
      addToast?.(t('sidebar.renameFailed'), 'error')
    } catch {
      addToast?.(t('sidebar.renameFailed'), 'error')
    }
    return false
  }

  const handlePrimaryAction = (id) => {
    if (id === 'new-chat') {
      setSelectedId(null)
      setSelectedBookId(null)
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

  if (activePanel === 'settings') {
    return (
      <aside className="sidebar studio-sidebar-panel studio-settings-sidebar">
        <div className="studio-settings-sidebar-head">
          <button
            type="button"
            className="studio-settings-back"
            onClick={() => onSettingsBack?.()}
            aria-label={t('settings.back')}
          >
            <ArrowLeft size={16} />
            <span>{t('settings.back')}</span>
          </button>
          <div className="studio-sidebar-section-label">{t('settings.title')}</div>
        </div>
        <nav className="studio-settings-nav" aria-label={t('settings.title')}>
          {settingsSidebarSections(t).map(section => {
            const Icon = settingsIcons[section.id] || Settings
            const active = section.id === settingsSection
            return (
              <button
                key={section.id}
                type="button"
                className={`studio-sidebar-action studio-settings-nav-item ${active ? 'active' : ''}`}
                onClick={() => onSettingsSectionChange?.(section.id)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            )
          })}
        </nav>

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
            return (
              <button
                key={action.id}
                type="button"
                className="studio-sidebar-action studio-sidebar-settings active"
                onClick={() => onSettingsBack?.()}
                aria-current="page"
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
          <TreeNode key={node.id} node={node} index={idx} bookId={node.type === 'book' ? node.id : null} selectedId={selectedId} onSelect={handleNodeSelect} onDeleteBook={handleDeleteBook} onRenameBook={handleRenameBook} pendingDelete={pendingDelete} />
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

function TreeNode({ node, index = 0, bookId, level = 0, selectedId, onSelect, onDeleteBook, onRenameBook, pendingDelete }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(level < 2)
  const [hovered, setHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const hasChildren = node.children?.length > 0
  const Icon = typeof node.icon === 'function' ? node.icon : treeIcons[node.type]
  const isBook = node.type === 'book'
  const isConfirming = pendingDelete === node.id
  const effectiveBookId = node.type === 'book' ? node.id : bookId
  const activateNode = () => {
    if (hasChildren) setOpen(!open)
    onSelect?.(node, effectiveBookId)
  }
  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activateNode()
  }
  const beginRename = () => {
    setDraftName(node.label)
    setRenaming(true)
  }
  const commitRename = () => {
    if (!renaming) return
    setRenaming(false)
    onRenameBook?.(node, draftName)
  }
  const cancelRename = () => setRenaming(false)

  return (
    <div>
      <div 
        className={`tree-item ${selectedId === node.id ? 'active' : ''}`} 
        style={{ paddingLeft: 12 + level * 16 }}
        role="treeitem"
        tabIndex={0}
        aria-selected={selectedId === node.id}
        aria-expanded={hasChildren ? open : undefined}
        onClick={activateNode}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className={`tree-item-toggle ${open ? 'open' : ''}`} style={{ visibility: hasChildren ? 'visible' : 'hidden' }}><ChevronRight size={12} /></span>
        {Icon && <span className="tree-item-icon"><Icon size={14} /></span>}
        {isBook && renaming ? (
          <input
            className="tree-item-rename-input"
            autoFocus
            value={draftName}
            aria-label={t('sidebar.renameBook')}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
            }}
            onBlur={commitRename}
          />
        ) : (
          <span className="tree-item-label">
            {node.type === 'volume' && node.id !== '__orphan_drafts__' && (
              <span className="label-sc" style={{ color: 'var(--accent)', marginRight: 6 }}>
                Vol. {index + 1}
              </span>
            )}
            {node.type === 'chapter' && (
              <span className="label-sc" style={{ color: 'var(--accent)', marginRight: 4 }}>
                {index + 1}.
              </span>
            )}
            {node.label}
          </span>
        )}
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
        {isBook && hovered && !isConfirming && !renaming && (
          <>
            <button
              className="btn-icon"
              style={{ marginLeft: 'auto', opacity: 0.7, padding: 2 }}
              title={t('sidebar.renameBook')}
              onClick={(e) => { e.stopPropagation(); beginRename() }}
            >
              <Pencil size={12} />
            </button>
            <button
              className="btn-icon"
              style={{ color: 'var(--danger)', opacity: 0.7, padding: 2 }}
              title={t('sidebar.deleteBook')}
              onClick={(e) => { e.stopPropagation(); onDeleteBook?.(node); }}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
      {hasChildren && <div className={`tree-children ${!open ? 'collapsed' : ''}`}>{node.children.map((c, i) => <TreeNode key={c.id} node={c} index={i} bookId={effectiveBookId} level={level+1} selectedId={selectedId} onSelect={onSelect} onDeleteBook={onDeleteBook} onRenameBook={onRenameBook} pendingDelete={pendingDelete} />)}</div>}
    </div>
  )
}
