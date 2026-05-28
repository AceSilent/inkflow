import { useState, useCallback, useEffect } from 'react'
import { Settings, Languages } from 'lucide-react'
import { useI18n } from './hooks/useI18n'
import { Sidebar } from './components/Sidebar'
import { BrainstormPanel } from './components/BrainstormPanel'
import { AuthorChatPanel } from './components/AuthorChatPanel'
import { OutlineView } from './components/OutlineView'
import { PlotGraphView } from './components/PlotGraphView'
import { ChapterWorkbench } from './components/ChapterWorkbench'
import { MemoryLibrary } from './components/MemoryLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { NewBookModal } from './components/NewBookModal'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'
import { useTheme } from './hooks/useTheme'
import { StudioShell } from './components/studio/StudioShell'
import { ChapterWorkspace } from './components/studio/ChapterWorkspace'
import { OutlineWorkspace } from './components/studio/OutlineWorkspace'
import { PlotGraphWorkspace } from './components/studio/PlotGraphWorkspace'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t, lang, switchLang } = useI18n()
  const [activePanel, setActivePanel] = useState('explorer')
  const [activeTab, setActiveTab] = useState('brainstorm')
  const [currentBook, setCurrentBook] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
  const [workspaceChapter, setWorkspaceChapter] = useState(null)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(null)
  const [showNewBook, setShowNewBook] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [authorModel, setAuthorModel] = useState('')
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled) setAuthorModel(data?.authorModel || '')
      })
      .catch(() => {
        if (!cancelled) setAuthorModel('')
      })
    return () => { cancelled = true }
  }, [dataVersion])

  const refreshData = useCallback(() => {
    setDataVersion(prev => prev + 1)
  }, [])

  const handleBookSelect = useCallback((book) => {
    setCurrentBook(book)
    setActiveChapter(null)
    setWorkspaceChapter(null)
    setActiveWorkspaceTab('chapter')
  }, [])

  const handleActivityClick = useCallback((panel) => {
    setActivePanel(panel)
  }, [])

  const handleSceneSelect = useCallback((sceneInfo) => {
    if (sceneInfo.type === 'chapter') {
      const tabId = `chapter-${sceneInfo.id}`
      setActiveTab(tabId)
      setActiveChapter(sceneInfo)
      setWorkspaceChapter(sceneInfo)
      setActiveWorkspaceTab('chapter')
      return
    }
    if (sceneInfo.type === 'volume') {
      setActiveTab('outline')
      setActiveWorkspaceTab('outline')
      return
    }
  }, [])

  // Kept for legacy non-chat tab surfaces until they move into StudioShell.
  // eslint-disable-next-line no-unused-vars
  const renderEditor = () => {
    switch (activeTab) {
      case 'brainstorm': return <BrainstormPanel addToast={addToast} currentBook={currentBook} onDataChanged={refreshData} />;
      case 'author-chat': return <AuthorChatPanel currentBook={currentBook} addToast={addToast} onLoreUpdated={refreshData} />;
      case 'outline':
        return <OutlineView
          currentBook={currentBook}
          addToast={addToast}
          dataVersion={dataVersion}
          onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
        />;
      case 'plot-graph':
        return <PlotGraphView
          currentBook={currentBook}
          addToast={addToast}
          dataVersion={dataVersion}
          onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
        />;
      case 'memory-library': return <MemoryLibrary addToast={addToast} />;
      case 'settings': return <SettingsPanel addToast={addToast} theme={theme} toggleTheme={toggleTheme} currentBook={currentBook} />;
      default:
        if (activeTab.startsWith('chapter-') && activeChapter) {
          return <ChapterWorkbench bookId={currentBook?.book_id} chapterId={activeChapter.id} chapterLabel={activeChapter.label} addToast={addToast} dataVersion={dataVersion} />;
        }
        return <BrainstormPanel addToast={addToast} currentBook={currentBook} onDataChanged={refreshData} />;
    }
  }

  const chatSurface = activePanel === 'settings' ? (
    <SettingsPanel
      addToast={addToast}
      theme={theme}
      toggleTheme={toggleTheme}
      currentBook={currentBook}
    />
  ) : (
    <AuthorChatPanel
      currentBook={currentBook}
      addToast={addToast}
      onLoreUpdated={refreshData}
    />
  )

  const sidebarSurface = (
    <Sidebar
      activePanel={activePanel}
      addToast={addToast}
      onSelect={handleSceneSelect}
      onBookSelect={handleBookSelect}
      onNewBook={() => setShowNewBook(true)}
      dataVersion={dataVersion}
    />
  )

  const statusbarSurface = (
    <footer className="statusbar">
      <div className="statusbar-section">
        <div className="statusbar-item"><span className="status-dot ok" /><span>{t('status.ready')}</span></div>
        <div className="statusbar-item"><Settings size={11} /><span>TS Backend</span></div>
      </div>
      <div className="statusbar-section">
        <div className="statusbar-item"><span>{t('status.model')}: {authorModel || t('status.demo')}</span></div>
      </div>
      <div className="statusbar-section">
        <div className="statusbar-item"><span>{t('status.scene')}: {workspaceChapter?.label || '--'}</span></div>
        <div className="statusbar-item" style={{ cursor: 'pointer' }} onClick={switchLang}>
          <Languages size={11} />
          <span>{lang === 'zh' ? '中文' : 'EN'}</span>
        </div>
      </div>
    </footer>
  )

  return (
    <div data-theme={theme}>
      <StudioShell
        theme={theme}
        currentBook={currentBook}
        activePanel={activePanel}
        onActivityClick={handleActivityClick}
        activeWorkspaceTab={activeWorkspaceTab}
        onWorkspaceTabChange={setActiveWorkspaceTab}
        sidebar={sidebarSurface}
        chat={chatSurface}
        chapter={
          <ChapterWorkspace
            bookId={currentBook?.book_id}
            chapter={workspaceChapter}
            dataVersion={dataVersion}
            addToast={addToast}
          />
        }
        outline={
          <OutlineWorkspace
            currentBook={currentBook}
            addToast={addToast}
            dataVersion={dataVersion}
            onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
          />
        }
        plot={
          <PlotGraphWorkspace
            currentBook={currentBook}
            addToast={addToast}
            dataVersion={dataVersion}
            onChapterOpen={(ch) => handleSceneSelect({ type: 'chapter', id: ch.id, label: ch.label })}
          />
        }
        statusbar={statusbarSurface}
      />
      {showNewBook && (
        <NewBookModal
          onClose={() => setShowNewBook(false)}
          onCreated={(book) => {
            setShowNewBook(false)
            handleBookSelect(book)
            setDataVersion(v => v + 1)
            handleActivityClick('explorer')
          }}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
