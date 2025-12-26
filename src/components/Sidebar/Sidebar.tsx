import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { ChapterList } from './ChapterList';
import { OutlinePanel } from './OutlinePanel';

export const Sidebar: React.FC = () => {
  const {
    projectName,
    rootPath,
    activeTab,
    isLoading,
    error,
    openWorkspace,
    setActiveTab,
    clearError,
  } = useWorkspaceStore();

  const { clearGhostText } = useEditorStore();

  const handleOpenWorkspace = async () => {
    clearGhostText(); // Clear AI suggestions
    clearError();
    await openWorkspace();
  };

  return (
    <div className="w-80 dark:bg-gray-900 bg-transparent dark:border-gray-700 border-gray-200 border-r flex flex-col h-full">
      {/* 顶部：项目信息 */}
      <div className="p-4 dark:border-b border-b dark:border-gray-700 border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold dark:text-white text-gray-900 truncate">
            {projectName || '未打开项目'}
          </h2>
          <button
            onClick={handleOpenWorkspace}
            className="p-2 dark:hover:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            title="打开小说文件夹"
          >
            <svg className="w-5 h-5 dark:text-gray-400 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>

        {rootPath && (
          <div className="text-xs dark:text-gray-500 text-gray-600 truncate" title={rootPath}>
            {rootPath}
          </div>
        )}

        {error && (
          <div className="mt-3 p-2 bg-red-900/20 dark:border border-red-700/50 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-3 flex items-center space-x-2 text-sm dark:text-gray-400 text-gray-600">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span>加载中...</span>
          </div>
        )}
      </div>

      {/* 切换卡 */}
      <div className="flex dark:border-b border-b dark:border-gray-700 border-gray-200">
        <button
          onClick={() => setActiveTab('chapters')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chapters'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'dark:text-gray-400 text-gray-600 dark:hover:text-gray-300 hover:text-gray-900'
          }`}
        >
          章节列表
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'outline'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'dark:text-gray-400 text-gray-600 dark:hover:text-gray-300 hover:text-gray-900'
          }`}
        >
          大纲讨论
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'chapters' ? (
            <ChapterList key="chapters" />
          ) : (
            <OutlinePanel key="outline" />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
