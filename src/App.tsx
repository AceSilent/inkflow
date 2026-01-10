import { useEffect } from 'react';
import { MainEditor } from './components/Editor/MainEditor';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { ToastContainer } from './components/Toast/Toast';
import { ResizableSidebar } from './components/ResizableSidebar/ResizableSidebar';
import { useEditorStore } from './store/editorStore';
import { useConfigStore } from './store/configStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { useToastStore } from './store/toastStore';
import { useTranslation } from './i18n';
import './index.css'; // Use the new index.css instead of editor.css
import type { editor } from 'monaco-editor';

function App() {
  const {
    autoSave,
    setLoading,
    content,
    currentChapterPath,
  } = useEditorStore();

  const { theme, language } = useConfigStore();
  const toasts = useToastStore((state) => state.toasts);
  const { t } = useTranslation();

  // 应用主题
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }, [theme]);

  // 应用语言到HTML
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // 强制注入幽灵文字样式
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .ghost-text {
        color: #9ca3af !important;
        opacity: 0.7 !important;
        font-style: italic !important;
        pointer-events: none !important;
        user-select: none !important;
        background: transparent !important;
        padding: 0 2px !important;
        display: inline-block !important;
      }
      .ghost-text-decoration {
        border-left: 2px solid #9ca3af !important;
        background: rgba(156, 163, 175, 0.1) !important;
        margin: 0 2px !important;
      }
      .monaco-editor .ghost-text {
        color: #9ca3af !important;
        opacity: 0.7 !important;
        font-style: italic !important;
        pointer-events: none !important;
        user-select: none !important;
        background: transparent !important;
        padding: 0 2px !important;
        display: inline-block !important;
      }
      .monaco-editor.vs-dark .ghost-text {
        color: #9ca3af !important;
        opacity: 0.7 !important;
      }
      .monaco-editor.vs-dark .ghost-text-decoration {
        border-left: 2px solid #9ca3af !important;
        background: rgba(156, 163, 175, 0.1) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Initialize application
  useEffect(() => {
    const initializeApp = async () => {
      // 1. 首先加载配置
      const { loadConfig } = useConfigStore.getState();
      await loadConfig();

      // 2. 加载配置后，再获取工作区根目录
      const { workspaceRoot } = useConfigStore.getState();

      // 3. 如果配置中有工作区根目录，自动加载工作空间
      if (workspaceRoot) {
        const { setWorkspaceRoot, scanWorkspace } = useWorkspaceStore.getState();
        setWorkspaceRoot(workspaceRoot);
        await scanWorkspace();
      }

      // 编辑器初始化完成，不需要加载示例内容
      setLoading(false);
    };

    initializeApp();
  }, [setLoading]);

  // Setup auto-save interval
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      autoSave();
    }, 30000); // Auto-save every 30 seconds

    // Cleanup on unmount
    return () => {
      clearInterval(autoSaveInterval);
      autoSave(); // Final save on unmount
    };
  }, [autoSave]);

  // Handle editor mount
  const handleEditorMount = (_editor: editor.IStandaloneCodeEditor) => {
    console.log('Monaco Editor mounted successfully');

    // You can perform additional editor setup here
    // For example, register custom themes or commands
  };

  // 统计中文字符数（排除空白字符）
  const wordCount = content.replace(/\s/g, '').length;
  const chapterName = currentChapterPath
    ? currentChapterPath.split('/').pop() || t.editor.untitledChapter
    : t.editor.noChapterLoaded;

  return (
    <div className="flex flex-col w-full h-screen dark:bg-gray-900 bg-white dark:text-gray-100 text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 dark:bg-gray-800 bg-gray-100 dark:border-b border-b dark:border-gray-700 border-gray-200">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold dark:text-white text-gray-900">
            {t.app.title}
          </h1>
          <span className="text-xs dark:text-gray-400 text-gray-600 font-medium">
            {t.app.subtitle}
          </span>
        </div>

        <div className="flex items-center space-x-6">
          {/* Current chapter indicator */}
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 dark:text-gray-400 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm dark:text-gray-300 text-gray-700 font-mono">
              {chapterName}
            </span>
          </div>

          {/* Word count indicator */}
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 dark:text-gray-400 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-sm dark:text-gray-300 text-gray-700">
              {wordCount.toLocaleString()} {language === 'zh-CN' ? '字' : 'words'}
            </span>
          </div>

          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs dark:text-gray-400 text-gray-600">
              {t.editor.ready}
            </span>
          </div>

          {/* Config Panel Button */}
          <ConfigPanel />
        </div>
      </header>

      {/* Main content area: Sidebar (left) + Editor (center) + RightPanel (right) */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <ResizableSidebar side="left" className="dark:bg-gray-900 bg-gray-100 dark:border-gray-700 border-gray-200 border-r">
          <Sidebar />
        </ResizableSidebar>

        {/* Center Editor */}
        <div className="flex-1 relative overflow-hidden">
          <MainEditor
            theme={theme === 'light' ? 'light' : 'vs-dark'}
            onMount={handleEditorMount}
          />
        </div>

        {/* Right Panel */}
        <ResizableSidebar side="right" className="dark:bg-gray-900 bg-gray-100 dark:border-gray-700 border-gray-200 border-l">
          <RightPanel />
        </ResizableSidebar>
      </main>

      {/* Footer with additional info */}
      <footer className="flex items-center justify-between px-6 py-2 dark:bg-gray-800 bg-gray-100 dark:border-t border-t dark:border-gray-700 border-gray-200">
        <div className="text-xs dark:text-gray-500 text-gray-600">
          <kbd className="px-1 py-0.5 dark:bg-gray-700 bg-gray-300 dark:text-gray-300 text-gray-700 rounded text-xs">Tab</kbd> {t.editor.tabToAccept}
        </div>
        <div className="text-xs dark:text-gray-500 text-gray-600">
          {t.editor.autoSaveEnabled}
        </div>
      </footer>

      {/* Global overlay for loading states */}
      <div id="global-loading-overlay" className="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="dark:bg-gray-800 bg-white rounded-lg p-6 max-w-sm mx-4 dark:border border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-100">Loading...</span>
          </div>
        </div>
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

export default App;