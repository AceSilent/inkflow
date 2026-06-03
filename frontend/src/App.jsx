import { useState, useCallback } from 'react'
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
import { GameScriptWorkspace } from './components/studio/GameScriptWorkspace'
import { createBookFromDraft } from './components/books/createBookFromDraft'

function createDraftSessionId() {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const { t } = useI18n()
  const [activePanel, setActivePanel] = useState('explorer')
  const [activeTab, setActiveTab] = useState('brainstorm')
  const [currentBook, setCurrentBook] = useState(null)
  const [activeChapter, setActiveChapter] = useState(null)
  const [workspaceChapter, setWorkspaceChapter] = useState(null)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState(null)
  const [draftSessionId, setDraftSessionId] = useState(() => createDraftSessionId())
  const [createWorkOpen, setCreateWorkOpen] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const { toasts, addToast, removeToast } = useToast()

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
    setDraftSessionId(createDraftSessionId())
    setActivePanel('explorer')
  }, [])

  const handleCreateBookRequest = useCallback(async (draft) => {
    try {
      const book = await createBookFromDraft({
        ...draft,
        ...(!currentBook ? { sourceSessionId: draftSessionId } : {}),
      })
      addToast?.(t('newBook.created'), 'success')
      handleBookSelect(book)
      setActivePanel('explorer')
      setDataVersion(v => v + 1)
    } catch (e) {
      addToast?.(t('authorChat.createFailed').replace('{message}', e.message), 'error')
    }
  }, [addToast, currentBook, draftSessionId, handleBookSelect, t])

  const handleBookCreatedByAgent = useCallback((book) => {
    handleBookSelect(book)
    setActivePanel('explorer')
    setDataVersion(v => v + 1)
    addToast?.(t('newBook.created'), 'success')
  }, [addToast, handleBookSelect, t])

  const handleCreateBookClick = useCallback(() => {
    setCreateWorkOpen(true)
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
      draftSessionId={draftSessionId}
      onBookCreated={handleBookCreatedByAgent}
    />
  )

  const sidebarSurface = (
    <Sidebar
      activePanel={activePanel}
      addToast={addToast}
      onSelect={handleSceneSelect}
      onBookSelect={handleBookSelect}
      onNewConversation={handleNewConversation}
      onCreateBookClick={handleCreateBookClick}
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
        game={
          <GameScriptWorkspace
            currentBook={currentBook}
            dataVersion={dataVersion}
          />
        }
      />

      {createWorkOpen && (
        <CreateWorkDialog
          onCancel={() => setCreateWorkOpen(false)}
          onCreate={async (name) => {
            await handleCreateBookRequest({ name })
            setCreateWorkOpen(false)
          }}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

function CreateWorkDialog({ onCancel, onCreate }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const value = name.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await onCreate(value)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal create-work-dialog" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('newBook.title')}</div>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">{t('newBook.bookTitle')}</label>
            <input
              className="input"
              value={name}
              autoFocus
              placeholder={t('sidebar.newWorkPrompt')}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') submit()
                if (event.key === 'Escape') onCancel()
              }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={!name.trim() || submitting} onClick={submit}>
            {submitting ? t('newBook.creating') : t('newBook.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
