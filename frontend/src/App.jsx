import { useState, useCallback } from 'react'
import { Moon, Sun, Settings, BookOpen, Languages } from 'lucide-react'
import { useI18n } from './i18n/index.jsx'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { WelcomePanel } from './components/WelcomePanel'
import { BrainstormPanel } from './components/BrainstormPanel'
import { IcebergPanel } from './components/IcebergPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { CharactersPanel } from './components/CharactersPanel'
import { EmotionPanel } from './components/EmotionPanel'
import { InboxPanel } from './components/InboxPanel'
import { OutlineTreeEditor } from './components/OutlineTreeEditor'
import { ChapterEditor } from './components/ChapterEditor'
import { DirectorConsole } from './components/DirectorConsole'
import { NewBookModal } from './components/NewBookModal'
import { ToastContainer, useToast } from './components/Toast'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t, lang, switchLang } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activePanel, setActivePanel] = useState('explorer')
  const [tabs, setTabs] = useState([{ id: 'welcome', label: 'tab.welcome' }])
  const [activeTab, setActiveTab] = useState('welcome')
  const [sidePanelContent, setSidePanelContent] = useState(null)
  const [workflowPhase, setWorkflowPhase] = useState('INIT')
  const [activeScene, setActiveScene] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
  const [directorItem, setDirectorItem] = useState(null)
  const [showNewBook, setShowNewBook] = useState(false)
  const [currentBook, setCurrentBook] = useState(null)
  const { toasts, addToast, removeToast } = useToast()

  const openTab = useCallback((id, labelKey) => {
    setTabs(prev => { if (prev.find(t => t.id === id)) return prev; return [...prev, { id, label: labelKey }]; });
    setActiveTab(id);
  }, [])

  const closeTab = useCallback((id) => {
    setTabs(prev => prev.filter(t => t.id !== id));
    setActiveTab(prev => prev === id ? 'welcome' : prev);
  }, [])

  const handleActivityClick = useCallback((panel) => {
    setActivePanel(panel);
    const tabMap = {
      brainstorm: ['brainstorm', 'tab.brainstorm'],
      write: ['iceberg', 'tab.iceberg'],
      review: ['review', 'tab.review'],
      settings: ['settings', 'tab.settings'],
      inbox: ['inbox', 'tab.inbox'],
      outline: ['outline', 'tab.outline'],
    };
    if (tabMap[panel]) openTab(tabMap[panel][0], tabMap[panel][1]);
    if (panel === 'characters') setSidePanelContent('characters');
    else if (panel === 'statistics') setSidePanelContent('emotion');
    else setSidePanelContent(null);
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
    const tabId = `scene-${sceneInfo.id}`
    openTab(tabId, sceneInfo.label)
    setActiveTab(tabId)
    setActiveScene(sceneInfo)
  }, [openTab])

  const handleOpenDirector = useCallback((item) => {
    setDirectorItem(item)
  }, [])

  const renderEditor = () => {
    switch (activeTab) {
      case 'welcome': return <WelcomePanel onNewBook={() => setShowNewBook(true)} onOpenBrainstorm={() => handleActivityClick('brainstorm')} />;
      case 'brainstorm': return <BrainstormPanel addToast={addToast} currentBook={currentBook} onNext={() => { openTab('iceberg', 'tab.iceberg'); setActiveTab('iceberg'); }} />;
      case 'iceberg': return <IcebergPanel addToast={addToast} currentBook={currentBook?.book_id} currentChapter={activeChapter?.id} onReview={() => { openTab('review', 'tab.review'); setActiveTab('review'); }} />;
      case 'review': return <ReviewPanel addToast={addToast} currentBook={currentBook?.book_id} />;
      case 'settings': return <SettingsPanel addToast={addToast} theme={theme} toggleTheme={toggleTheme} />;
      case 'inbox': return <InboxPanel addToast={addToast} currentBook={currentBook?.book_id} onOpenDirector={handleOpenDirector} />;
      case 'outline': return <OutlineTreeEditor addToast={addToast} currentBook={currentBook} />;
      default:
        if (activeTab.startsWith('chapter-') && activeChapter) {
          return <ChapterEditor bookId={currentBook?.book_id} chapterId={activeChapter.id} chapterLabel={activeChapter.label} addToast={addToast} />;
        }
        if (activeTab.startsWith('scene-')) {
          return <IcebergPanel addToast={addToast} currentBook={currentBook?.book_id} currentChapter={activeChapter?.id} sceneLabel={activeScene?.label} onReview={() => { openTab('review', 'tab.review'); setActiveTab('review'); }} />;
        }
        return <WelcomePanel />;
    }
  }

  return (
    <div className={`app-shell ${!sidebarOpen ? 'sidebar-collapsed' : ''}`} data-theme={theme}>
      <header className="titlebar">
        <div className="titlebar-brand">
          <BookOpen size={16} />
          <span>{t('app.brand')}</span>
          <span style={{ opacity: 0.4, fontSize: 10 }}>{t('app.version')}</span>
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
      <Sidebar activePanel={activePanel} addToast={addToast} onSelect={handleSceneSelect} onBookSelect={(book) => setCurrentBook(book)} onNewBook={() => setShowNewBook(true)} />

      <main className={`main-area ${sidePanelContent ? 'with-panel' : ''}`}>
        <div className="editor-section">
          <TabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} onClose={closeTab} />
          <div className="editor-content anim-fade" key={activeTab}>
            {renderEditor()}
          </div>
        </div>
        {sidePanelContent && (
          <aside className="side-panel">
            <div className="side-panel-header">
              <span>{sidePanelContent === 'characters' ? t('nav.characters') : t('nav.statistics')}</span>
              <button className="btn-icon" onClick={() => setSidePanelContent(null)}>
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="side-panel-content">
              {sidePanelContent === 'characters' ? <CharactersPanel currentBook={currentBook?.book_id} /> : <EmotionPanel />}
            </div>
          </aside>
        )}
      </main>

      <footer className="statusbar">
        <div className="statusbar-section">
          <div className="statusbar-item"><span className="status-dot ok" /><span>{t('status.ready')}</span></div>
          <div className="statusbar-item"><Settings size={11} /><span>{workflowPhase}</span></div>
        </div>
        <div className="statusbar-section">
          <div className="statusbar-item"><span>{t('status.model')}: {t('status.demo')}</span></div>
        </div>
        <div className="statusbar-section">
          <div className="statusbar-item"><span>{t('status.words')}: 0</span></div>
          <div className="statusbar-item"><span>{t('status.scene')}: {activeScene?.label || '--'}</span></div>
          <div className="statusbar-item" style={{ cursor: 'pointer' }} onClick={switchLang}>
            <Languages size={11} />
            <span>{lang === 'zh' ? '中文' : 'EN'}</span>
          </div>
        </div>
      </footer>

      {/* Director Console Modal */}
      {directorItem && (
        <DirectorConsole item={directorItem} onClose={() => setDirectorItem(null)} addToast={addToast} />
      )}

      {/* New Book Modal */}
      {showNewBook && (
        <NewBookModal
          onClose={() => setShowNewBook(false)}
          onCreated={(book) => {
            setShowNewBook(false)
            setCurrentBook(book)
            handleActivityClick('brainstorm')
          }}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
