import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Brain, Library, Search, Settings } from 'lucide-react'
import { WorkspacePane } from './WorkspacePane'
import { WorkspaceTabs } from './WorkspaceTabs'
import { clampWorkspaceWidth, loadWorkspaceLayout, saveWorkspaceLayout } from './workspaceLayout'

export function StudioShell({
  theme,
  currentBook,
  activePanel,
  onActivityClick,
  sidebar,
  chat,
  chapter,
  outline,
  plot,
  statusbar,
}) {
  const bookId = currentBook?.book_id
  const [layout, setLayout] = useState(() => loadWorkspaceLayout(bookId))

  useEffect(() => {
    setLayout(loadWorkspaceLayout(bookId))
  }, [bookId])

  const persistLayout = useCallback((patch) => {
    setLayout(prev => saveWorkspaceLayout(bookId, { ...prev, ...patch }))
  }, [bookId])

  const railItems = useMemo(() => [
    { id: 'explorer', icon: Library, label: '书籍' },
    { id: 'author-chat', icon: Brain, label: 'Agent' },
    { id: 'search', icon: Search, label: '搜索' },
    { id: 'settings', icon: Settings, label: '设置' },
  ], [])

  const handleToggleWorkspace = useCallback(() => {
    persistLayout({ collapsed: !layout.collapsed })
  }, [layout.collapsed, persistLayout])

  const handleTabChange = useCallback((tabId) => {
    persistLayout({ activeTab: tabId })
  }, [persistLayout])

  const handleResizeStart = useCallback((event) => {
    if (event.button !== 0) return

    event.preventDefault()

    const startX = event.clientX
    const startWidth = layout.width

    const handlePointerMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      persistLayout({
        collapsed: false,
        width: clampWorkspaceWidth(startWidth + delta, window.innerWidth),
      })
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
  }, [layout.width, persistLayout])

  return (
    <div className="studio-shell" data-theme={theme}>
      <header className="studio-titlebar">
        <div className="studio-titlebar-brand">
          <BookOpen size={16} />
          <span>InkFlow Studio</span>
        </div>
        <div className="studio-titlebar-context">
          {currentBook?.title || currentBook?.book_id || '未选择作品'}
        </div>
      </header>

      <nav className="studio-rail" aria-label="工作区">
        {railItems.map(item => {
          const Icon = item.icon
          const active = activePanel === item.id

          return (
            <button
              key={item.id}
              className={`studio-rail-item ${active ? 'active' : ''}`}
              type="button"
              onClick={() => onActivityClick?.(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <aside className="studio-library">
        {sidebar}
      </aside>

      <main className="studio-main">
        <section className="studio-chat">
          {chat}
        </section>
        <WorkspacePane
          collapsed={layout.collapsed}
          width={layout.width}
          activeTab={layout.activeTab}
          onToggle={handleToggleWorkspace}
          onResizeStart={handleResizeStart}
          onTabChange={handleTabChange}
        >
          <WorkspaceTabs
            activeTab={layout.activeTab}
            onTabChange={handleTabChange}
            chapter={chapter}
            outline={outline}
            plot={plot}
          />
        </WorkspacePane>
      </main>

      <footer className="statusbar">
        {statusbar}
      </footer>
    </div>
  )
}
