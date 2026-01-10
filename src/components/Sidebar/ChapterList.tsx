import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { useTranslation } from '../../i18n';

export const ChapterList: React.FC = () => {
  const { chapters, currentChapter, selectChapter, createNewChapter } = useWorkspaceStore();
  const { clearGhostText } = useEditorStore();
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const handleChapterClick = async (chapter: { filename: string; title: string; chapter_number: number; word_count: number; path: string }) => {
    clearGhostText(); // Clear AI suggestions
    try {
      // selectChapter 会处理所有事情：读取文件、更新编辑器、更新当前章节
      await selectChapter(chapter as any);
    } catch (error) {
      console.error('❌ 加载章节失败:', error);
    }
  };

  const handleCreateChapter = async () => {
    if (!newChapterTitle.trim()) return;

    setIsCreating(true);
    try {
      await createNewChapter(newChapterTitle);
      setNewChapterTitle('');
      setIsCreating(false);
    } catch (error) {
      console.error('❌ 创建章节失败:', error);
      setIsCreating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 新建章节按钮 */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          clearGhostText(); // 清除AI建议
          setIsCreating(true);
        }}
        className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">{t.sidebar.newChapter}</span>
      </motion.button>

      {/* 新建章节输入框 */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <input
              type="text"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateChapter();
                } else if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewChapterTitle('');
                }
              }}
              placeholder="输入章节标题..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={handleCreateChapter}
                disabled={!newChapterTitle.trim()}
                className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
              >
                创建
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewChapterTitle('');
                }}
                className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                取消
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 章节列表 */}
      <div className="space-y-1">
        {chapters.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            暂无章节
          </div>
        ) : (
          chapters.map((chapter) => (
            <motion.div
              key={chapter.filename}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                currentChapter?.filename === chapter.filename
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'hover:bg-gray-800 text-gray-300'
              }`}
              onClick={() => handleChapterClick(chapter)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className="text-xs font-mono text-gray-500">
                      {String(chapter.chapter_number).padStart(3, '0')}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {chapter.title}
                    </span>
                  </div>
                  {chapter.has_summary && (
                    <span className="text-xs text-green-500 ml-2">已总结</span>
                  )}
                </div>
              </div>

              {chapter.modified_time && (
                <div className="ml-2 text-xs text-gray-500">
                  {new Date(chapter.modified_time).toLocaleDateString()}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* 统计信息 */}
      {chapters.length > 0 && (
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>总章节数：{chapters.length}</span>
            <span>
              总字数：
              {chapters.reduce((sum, ch) => sum + ch.word_count, 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
