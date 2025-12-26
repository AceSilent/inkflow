import { useEffect } from 'react';
import { MainEditor } from './components/Editor/MainEditor';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { ToastContainer } from './components/Toast/Toast';
import { ResizableSidebar } from './components/ResizableSidebar/ResizableSidebar';
import { useEditorStore } from './store/editorStore';
import { useConfigStore } from './store/configStore';
import { useToastStore } from './store/toastStore';
import './index.css'; // Use the new index.css instead of editor.css
import type { editor } from 'monaco-editor';

function App() {
  const {
    loadChapterContent,
    autoSave,
    setLoading,
    content,
    currentChapterPath,
  } = useEditorStore();

  const { theme, language } = useConfigStore();
  const toasts = useToastStore((state) => state.toasts);

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

  // Initialize editor with a sample chapter
  useEffect(() => {
    const initializeApp = async () => {
      // 1. 首先加载配置
      const { loadConfig } = useConfigStore.getState();
      await loadConfig();

      // 2. 然后初始化编辑器
      try {
        // For demo purposes, create a sample chapter
        // In a real app, this would be loaded from the file system
        const sampleContent = `# 晨曦

雨后的清晨，空气中弥漫着泥土的清香。

李晓雨站在窗前，凝视着远处的山峦被薄雾笼罩。咖啡杯里升起的热气在眼前袅袅散开，就像她此刻纷乱的心绪。

"已经过去三年了。"她轻声对自己说。

三年前那个改变一切的夜晚，仍然历历在目。那时的她还是个刚刚走出校园的年轻人，对未来充满了无限的憧憬和期待。而现在...

`;

        // Simulate loading a chapter
        setTimeout(() => {
          // In a real app, you'd call:
          // await loadChapterContent('/path/to/chapter.md');

          // For demo, we'll set the content directly
          useEditorStore.setState({
            content: sampleContent,
            lastSavedContent: sampleContent,
            currentChapterPath: '/demo/chapter1.md',
            isDirty: false,
          });
          setLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Failed to initialize editor:', error);
        setLoading(false);
      }
    };

    initializeApp();
  }, [loadChapterContent, setLoading]);

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

  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  const chapterName = currentChapterPath ? currentChapterPath.split('/').pop() || 'Untitled Chapter' : 'No chapter loaded';

  return (
    <div className="flex flex-col w-full h-screen dark:bg-gray-900 bg-white dark:text-gray-100 text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 dark:bg-gray-800 bg-gray-100 dark:border-b border-b dark:border-gray-700 border-gray-200">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-bold dark:text-white text-gray-900">
            InkFlow
          </h1>
          <span className="text-xs dark:text-gray-400 text-gray-600 font-medium">
            AI-Powered Novel Editor
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
              {wordCount.toLocaleString()} words
            </span>
          </div>

          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-xs dark:text-gray-400 text-gray-600">
              Ready
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
          Press <kbd className="px-1 py-0.5 dark:bg-gray-700 bg-gray-300 dark:text-gray-300 text-gray-700 rounded text-xs">Tab</kbd> to accept AI suggestions
        </div>
        <div className="text-xs dark:text-gray-500 text-gray-600">
          Auto-save enabled
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