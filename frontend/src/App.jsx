import { useState, useCallback, useEffect } from 'react'
import { Moon, Sun, Settings, BookOpen, Languages } from 'lucide-react'
import { useI18n } from './hooks/useI18n'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
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

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t, lang, switchLang } = useI18n()
  const [sidebarOpen] = useState(true)
  const [activePanel, setActivePanel] = useState('explorer')
  const [tabs, setTabs] = useState([{ id: 'brainstorm', label: 'tab.brainstorm' }])
  const [activeTab, setActiveTab] = useState('brainstorm')
  const [currentBook, setCurrentBook] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
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

  const openTab = useCallback((id, labelKey) => {
    setTabs(prev => { if (prev.find(t => t.id === id)) return prev; return [...prev, { id, label: labelKey }]; });
    setActiveTab(id);
  }, [])

  const closeTab = useCallback((id) => {
    setTabs(prev => prev.filter(t => t.id !== id));
    setActiveTab(prev => prev === id ? 'brainstorm' : prev);
  }, [])

  const handleActivityClick = useCallback((panel) => {
    setActivePanel(panel);
    const tabMap = {
      brainstorm: ['brainstorm', 'tab.brainstorm'],
      'author-chat': ['author-chat', 'tab.authorChat'],
      outline: ['outline', 'tab.outline'],
      'plot-graph': ['plot-graph', 'tab.plotGraph'],
      'memory-library': ['memory-library', 'tab.memoryLibrary'],
      settings: ['settings', 'tab.settings'],
    };
    if (tabMap[panel]) openTab(tabMap[panel][0], tabMap[panel][1]);
  }, [openTab])

  const handleSceneSelect = useCallback((sceneInfo) => {
    if (sceneInfo.type === 'chapter') {
      const tabId = `chapter-${sceneInfo.id}`
      openTab(tabId, sceneInfo.label)
      setActiveTab(tabId)
      setActiveChapter(sceneInfo)
      return
    }
    if (sceneInfo.type === 'volume') {
      openTab('outline', 'tab.outline')
      setActiveTab('outline')
      return
    }
  }, [openTab])

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

  return (
    <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`} data-theme={theme}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <BookOpen size={16} />
          <span className="wordmark">InkFlow · Studio</span>
          <span className="label-sc" style={{ opacity: 0.4 }}>{t('app.version')}</span>
        </div>
        <div className="titlebar-actions">
          <button className="btn-icon" onClick={switchLang} title={t('settings.language')}>
            <Languages size={15} />
          </button>
          <button className="btn-icon" onClick={toggleTheme} title={t('settings.theme')}>
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button className="btn-icon" onClick={() => handleActivityClick('settings')} title={t('nav.settings')}>
            <Settings size={15} />
          </button>
        </div>
      </header>

      <ActivityBar active={activePanel} onClick={handleActivityClick} />
      <Sidebar activePanel={activePanel} addToast={addToast} onSelect={handleSceneSelect} onBookSelect={(book) => setCurrentBook(book)} onNewBook={() => setShowNewBook(true)} dataVersion={dataVersion} />

      <main className="main-area">
        <div className="editor-section">
          <TabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} onClose={closeTab} />
          <div className="editor-content anim-fade" key={activeTab}>
            {renderEditor()}
          </div>
        </div>
      </main>

      <footer className="statusbar">
        <div className="statusbar-section">
          <div className="statusbar-item"><span className="status-dot ok" /><span>{t('status.ready')}</span></div>
          <div className="statusbar-item"><Settings size={11} /><span>TS Backend</span></div>
        </div>
        <div className="statusbar-section">
          <div className="statusbar-item"><span>{t('status.model')}: {authorModel || t('status.demo')}</span></div>
        </div>
        <div className="statusbar-section">
          <div className="statusbar-item"><span>{t('status.words')}: 0</span></div>
          <div className="statusbar-item"><span>{t('status.scene')}: {activeChapter?.label || '--'}</span></div>
          <div className="statusbar-item" style={{ cursor: 'pointer' }} onClick={switchLang}>
            <Languages size={11} />
            <span>{lang === 'zh' ? '中文' : 'EN'}</span>
          </div>
        </div>
      </footer>

      {/* New Book Modal */}
      {showNewBook && (
        <NewBookModal
          onClose={() => setShowNewBook(false)}
          onCreated={(book) => {
            setShowNewBook(false)
            setCurrentBook(book)
            setDataVersion(v => v + 1)
            handleActivityClick('brainstorm')
          }}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
