import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { ChapterList } from './ChapterList';
import { OutlinePanel } from './OutlinePanel';
import { CreateNewNovel } from '../CreateNewNovel';

export const Sidebar: React.FC = () => {
  const {
    projectName,
    rootPath,
    workspaceRoot,
    novels,
    activeTab,
    isLoading,
    error,
    openWorkspaceRoot,
    openNovelProject,
    setActiveTab,
    clearError,
  } = useWorkspaceStore();

  const { clearGhostText } = useEditorStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleOpenWorkspaceRoot = async () => {
    clearGhostText();
    clearError();
    await openWorkspaceRoot();
  };

  const handleOpenNovel = async (novelPath: string) => {
    clearGhostText();
    clearError();
    await openNovelProject(novelPath);
  };

  const handleCreateSuccess = () => {
    // 重新扫描工作空间
    useWorkspaceStore.getState().scanWorkspace();
  };

  return (
    <div className="w-80 dark:bg-gray-900 bg-transparent dark:border-gray-700 border-gray-200 border-r flex flex-col h-full">
      {/* 顶部：工作空间信息 */}
      <div className="p-4 dark:border-b border-b dark:border-gray-700 border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold dark:text-white text-gray-900 truncate">
              {rootPath ? projectName : workspaceRoot ? '选择小说项目' : '未打开工作空间'}
            </h2>
            {workspaceRoot && (
              <div className="text-xs dark:text-gray-500 text-gray-600 truncate" title={workspaceRoot}>
                {workspaceRoot}
              </div>
            )}
            {rootPath && (
              <div className="text-xs dark:text-gray-500 text-gray-600 truncate" title={rootPath}>
                {rootPath}
              </div>
            )}
          </div>
          <button
            onClick={handleOpenWorkspaceRoot}
            className="p-2 dark:hover:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            title={workspaceRoot ? "更换工作空间" : "打开工作空间"}
          >
            <svg className="w-5 h-5 dark:text-gray-400 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-900/20 dark:border border-red-700/50 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center space-x-2 text-sm dark:text-gray-400 text-gray-600">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span>加载中...</span>
          </div>
        )}

        {/* 项目列表 */}
        {workspaceRoot && !rootPath && novels.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium dark:text-gray-400 text-gray-600">
                小说项目 ({novels.length})
              </span>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                title="创建新小说"
              >
                + 新建
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {novels.map((novel) => (
                <button
                  key={novel.path}
                  onClick={() => handleOpenNovel(novel.path)}
                  className="w-full text-left px-3 py-2 dark:bg-gray-800 bg-gray-200 hover:dark:bg-gray-700 hover:bg-gray-300 rounded-lg transition-colors"
                  title={`${novel.name} - ${novel.chapter_count} 章节, ${novel.total_word_count} 字`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium dark:text-gray-200 text-gray-800 truncate">
                        {novel.name}
                      </div>
                      <div className="text-xs dark:text-gray-500 text-gray-600">
                        {novel.chapter_count} 章 · {novel.total_word_count} 字
                      </div>
                    </div>
                    {novel.has_outline && (
                      <svg className="w-4 h-4 dark:text-blue-400 text-blue-600 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {workspaceRoot && !rootPath && novels.length === 0 && (
          <div className="mt-3 text-center py-4 dark:bg-gray-800 bg-gray-200 rounded-lg">
            <p className="text-sm dark:text-gray-400 text-gray-600 mb-3">
              工作空间中暂无小说项目
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              + 创建第一个小说
            </button>
          </div>
        )}
      </div>

      {/* 切换卡 - 只在有打开项目时显示 */}
      {rootPath && (
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
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {!rootPath && !workspaceRoot && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
            <svg className="w-16 h-16 dark:text-gray-700 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <div>
              <p className="text-sm dark:text-gray-400 text-gray-600 font-medium">未打开工作空间</p>
              <p className="text-xs dark:text-gray-600 text-gray-500 mt-1">点击上方文件夹图标打开工作空间</p>
            </div>
          </div>
        )}
        {rootPath && (
          <AnimatePresence mode="wait">
            {activeTab === 'chapters' ? (
              <ChapterList key="chapters" />
            ) : (
              <OutlinePanel key="outline" />
            )}
          </AnimatePresence>
        )}
      </div>

      {/* 创建新小说对话框 */}
      {workspaceRoot && (
        <CreateNewNovel
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          workspaceRoot={workspaceRoot}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  );
};
