import { useState, useCallback, useEffect, useMemo } from 'react'
import { useI18n } from './hooks/useI18n'
import { Sidebar } from './components/Sidebar'
import { BrainstormPanel } from './components/BrainstormPanel'
import { AuthorChatPanel } from './components/AuthorChatPanel'
import { OutlineView } from './components/OutlineView'
import { PlotGraphView } from './components/PlotGraphView'
import { ChapterWorkbench } from './components/ChapterWorkbench'
import { MemoryLibrary } from './components/MemoryLibrary'
import { SettingsPanel } from './components/SettingsPanel'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'
import { useTheme } from './hooks/useTheme'
import { StudioShell } from './components/studio/StudioShell'
import { ChapterWorkspace } from './components/studio/ChapterWorkspace'
import { OutlineWorkspace } from './components/studio/OutlineWorkspace'
import { PlotGraphWorkspace } from './components/studio/PlotGraphWorkspace'
import { createBookFromDraft } from './components/books/createBookFromDraft'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t } = useI18n()
  const [activePanel, setActivePanel] = useState('explorer')
  const [activeTab, setActiveTab] = useState('brainstorm')
  const [currentBook, setCurrentBook] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
  const [workspaceChapter, setWorkspaceChapter] = useState(null)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(null)
  const [dataVersion, setDataVersion] = useState(0)
  const [settings, setSettings] = useState(null)
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled) setSettings(data || null)
      })
      .catch(() => {
        if (!cancelled) setSettings(null)
      })
    return () => { cancelled = true }
  }, [dataVersion])

  const authorModel = settings?.authorModel || ''

  const availableModels = useMemo(() => {
    return (settings?.providers || []).flatMap(provider =>
      (provider.models || []).map(model => ({
        value: `${provider.id}/${model}`,
        label: model,
        provider: provider.name,
      }))
    )
  }, [settings])

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

  const handleNewConversation = useCallback(() => {
    setCurrentBook(null)
    setActiveChapter(null)
    setWorkspaceChapter(null)
    setActiveWorkspaceTab(null)
    setActivePanel('explorer')
  }, [])

  const handleCreateBookRequest = useCallback(async (draft) => {
    try {
      const book = await createBookFromDraft(draft)
      addToast?.(t('newBook.created'), 'success')
      handleBookSelect(book)
      setActivePanel('explorer')
      setDataVersion(v => v + 1)
    } catch (e) {
      addToast?.(`创建失败：${e.message}`, 'error')
    }
  }, [addToast, handleBookSelect, t])

  const handleAuthorModelChange = useCallback(async (model) => {
    if (!settings) return
    const nextSettings = { ...settings, authorModel: model }
    setSettings(nextSettings)
    try {
      const resp = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!resp.ok) throw new Error('save failed')
      addToast?.('作者模型已切换', 'success')
    } catch {
      setSettings(settings)
      addToast?.('模型切换失败', 'error')
    }
  }, [addToast, settings])

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
      onCreateBookRequest={handleCreateBookRequest}
      authorModel={authorModel}
      availableModels={availableModels}
      onAuthorModelChange={handleAuthorModelChange}
    />
  )

  const sidebarSurface = (
    <Sidebar
      activePanel={activePanel}
      addToast={addToast}
      onSelect={handleSceneSelect}
      onBookSelect={handleBookSelect}
      onNewConversation={handleNewConversation}
      onActivityClick={handleActivityClick}
      dataVersion={dataVersion}
    />
  )

  return (
    <div data-theme={theme}>
      <StudioShell
        theme={theme}
        currentBook={currentBook}
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
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
