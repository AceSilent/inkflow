import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { WorkspacePane } from './WorkspacePane'
import { WorkspaceTabs } from './WorkspaceTabs'
import { startNativeWindowDrag } from './nativeWindowDrag'
import { studioChromeLayout } from './studioChrome'
import { WORKSPACE_MIN_WIDTH, clampWorkspaceWidth, isWorkspaceTab, loadWorkspaceLayout, saveWorkspaceLayout } from './workspaceLayout'
import { useI18n } from '../../hooks/useI18n'

function workspaceMaxWidth(viewportWidth) {
  return Math.max(WORKSPACE_MIN_WIDTH, Math.floor(viewportWidth * 0.5))
}

function currentViewportWidth() {
  return window.innerWidth
}

function normalizeLayoutForViewport(layout, viewportWidth) {
  return {
    ...layout,
    width: clampWorkspaceWidth(layout.width, viewportWidth),
  }
}

function loadNormalizedWorkspaceLayout(bookId) {
  const viewportWidth = currentViewportWidth()
  const layout = loadWorkspaceLayout(bookId, undefined, Number.MAX_SAFE_INTEGER)
  const normalized = normalizeLayoutForViewport(layout, viewportWidth)

  if (normalized.width !== layout.width) {
    return saveWorkspaceLayout(bookId, normalized, undefined, viewportWidth)
  }

  return normalized
}

export function StudioShell({
  theme,
  currentBook,
  sidebar,
  chat,
  chapter,
  outline,
  plot,
  game,
  activeWorkspaceTab,
  onWorkspaceTabChange,
}) {
  const { t } = useI18n()
  const bookId = currentBook?.book_id
  const resizeCleanupRef = useRef(null)
  const [viewportWidth, setViewportWidth] = useState(() => currentViewportWidth())
  const [layout, setLayout] = useState(() => loadNormalizedWorkspaceLayout(bookId))

  useEffect(() => {
    setLayout(loadNormalizedWorkspaceLayout(bookId))
  }, [bookId])

  const persistLayout = useCallback((patch, viewportWidth = currentViewportWidth()) => {
    setLayout(prev => saveWorkspaceLayout(bookId, { ...prev, ...patch }, undefined, viewportWidth))
  }, [bookId])

  useEffect(() => {
    if (!isWorkspaceTab(activeWorkspaceTab)) return

    setLayout(prev => {
      if (prev.activeTab === activeWorkspaceTab) return prev

      return saveWorkspaceLayout(
        bookId,
        { ...prev, activeTab: activeWorkspaceTab },
        undefined,
        currentViewportWidth()
      )
    })
  }, [activeWorkspaceTab, bookId])

  const clearResizeListeners = useCallback(() => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])

  useEffect(() => clearResizeListeners, [clearResizeListeners])

  useEffect(() => {
    const handleWindowResize = () => {
      const nextViewportWidth = currentViewportWidth()
      setViewportWidth(nextViewportWidth)
      setLayout(prev => {
        const normalized = normalizeLayoutForViewport(prev, nextViewportWidth)
        if (normalized.width === prev.width) return prev
        return saveWorkspaceLayout(bookId, normalized, undefined, nextViewportWidth)
      })
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [bookId])

  const handleToggleWorkspace = useCallback(() => {
    persistLayout({ collapsed: !layout.collapsed })
  }, [layout.collapsed, persistLayout])

  const handleTabChange = useCallback((tabId) => {
    persistLayout({ activeTab: tabId })
    onWorkspaceTabChange?.(tabId)
  }, [onWorkspaceTabChange, persistLayout])

  const visualWidth = useMemo(() => {
    return clampWorkspaceWidth(layout.width, viewportWidth)
  }, [layout.width, viewportWidth])

  const visualMaxWidth = useMemo(() => {
    return workspaceMaxWidth(viewportWidth)
  }, [viewportWidth])

  const handleResizeStart = useCallback((event) => {
    if (event.button !== 0) return

    event.preventDefault()
    clearResizeListeners()

    const startX = event.clientX
    const startWidth = clampWorkspaceWidth(visualWidth, currentViewportWidth())

    const handlePointerMove = (moveEvent) => {
      const delta = startX - moveEvent.clientX
      const viewportWidth = currentViewportWidth()
      persistLayout({
        collapsed: false,
        width: clampWorkspaceWidth(startWidth + delta, viewportWidth),
      }, viewportWidth)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handleResizeEnd)
      window.removeEventListener('pointercancel', handleResizeEnd)
      window.removeEventListener('blur', handleResizeEnd)
      resizeCleanupRef.current = null
    }

    const handleResizeEnd = () => {
      cleanup()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handleResizeEnd)
    window.addEventListener('pointercancel', handleResizeEnd)
    window.addEventListener('blur', handleResizeEnd)
    resizeCleanupRef.current = cleanup
  }, [clearResizeListeners, persistLayout, visualWidth])

  const handleWorkspaceKeyDown = useCallback((event) => {
    const step = 24
    const viewportWidth = currentViewportWidth()
    const currentWidth = clampWorkspaceWidth(layout.width, viewportWidth)
    let nextWidth

    if (event.key === 'ArrowLeft') {
      nextWidth = currentWidth + step
    } else if (event.key === 'ArrowRight') {
      nextWidth = currentWidth - step
    } else if (event.key === 'Home') {
      nextWidth = WORKSPACE_MIN_WIDTH
    } else if (event.key === 'End') {
      nextWidth = workspaceMaxWidth(viewportWidth)
    } else {
      return
    }

    event.preventDefault()
    persistLayout({
      collapsed: false,
      width: clampWorkspaceWidth(nextWidth, viewportWidth),
    }, viewportWidth)
  }, [layout.width, persistLayout])

  return (
    <div
      className="studio-shell"
      data-theme={theme}
      style={{ '--studio-titlebar-left-inset': `${studioChromeLayout.titlebarLeftInset}px` }}
    >
      <header className="studio-titlebar" data-tauri-drag-region="deep" onMouseDownCapture={startNativeWindowDrag}>
        <div className="studio-titlebar-drag-region" data-tauri-drag-region />
        <div className="studio-titlebar-context" aria-hidden={!currentBook}>
          {currentBook?.title || currentBook?.book_id || ''}
        </div>
        <div className="studio-titlebar-actions">
          <button
            className="studio-titlebar-button workspace-titlebar-toggle"
            data-window-drag-block
            type="button"
            onClick={handleToggleWorkspace}
            title={layout.collapsed ? t('workspace.expand') : t('workspace.collapse')}
            aria-label={layout.collapsed ? t('workspace.expand') : t('workspace.collapse')}
          >
            {layout.collapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </header>

      <aside className="studio-library">
        {sidebar}
      </aside>

      <main className="studio-main">
        <section className="studio-chat">
          {chat}
        </section>
        <WorkspacePane
          collapsed={layout.collapsed}
          width={visualWidth}
          maxWidth={visualMaxWidth}
          activeTab={layout.activeTab}
          onResizeStart={handleResizeStart}
          onKeyDown={handleWorkspaceKeyDown}
        >
          <WorkspaceTabs
            activeTab={layout.activeTab}
            onTabChange={handleTabChange}
            chapter={chapter}
            outline={outline}
            plot={plot}
            game={game}
          />
        </WorkspacePane>
      </main>
    </div>
  )
}
