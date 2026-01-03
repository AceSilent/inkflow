import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from '../../i18n';

interface CreateNewNovelProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceRoot: string;
  onSuccess: () => void;
}

export const CreateNewNovel: React.FC<CreateNewNovelProps> = ({
  isOpen,
  onClose,
  workspaceRoot,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [novelName, setNovelName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!novelName.trim()) {
      setError(t.createNovel.novelNameRequired);
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const result = await invoke<string>('create_new_novel', {
        basePath: workspaceRoot,
        name: novelName.trim(),
      });

      console.log('✅ 小说创建成功:', result);
      setNovelName('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('❌ 创建小说失败:', err);
      setError(err as string);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setNovelName('');
    setError('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
            onClick={handleClose}
          />

          {/* 对话框 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[10000]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dark:bg-gray-800 bg-white dark:border-gray-700 border-gray-200 rounded-lg shadow-xl p-6">
              <h2 className="text-xl font-semibold dark:text-white text-gray-900 mb-4">
                {t.createNovel.title}
              </h2>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-2">
                    {t.createNovel.novelName}
                  </label>
                  <input
                    type="text"
                    value={novelName}
                    onChange={(e) => setNovelName(e.target.value)}
                    placeholder={t.createNovel.novelNamePlaceholder}
                    className="w-full px-3 py-2 dark:bg-gray-700 bg-white dark:border border-gray-600 border-gray-300 rounded-lg dark:text-white text-gray-900 text-sm dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    autoFocus
                    disabled={isCreating}
                  />
                </div>

                <div className="mb-4 text-xs dark:text-gray-500 text-gray-600">
                  <p>{t.createNovel.workspaceDir}: {workspaceRoot}</p>
                  <p className="mt-1">{t.createNovel.workspaceDesc}</p>
                </div>

                {error && (
                  <div className="mb-4 p-2 bg-red-900/20 text-red-400 border border-red-700/30 rounded text-sm">
                    {error}
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isCreating}
                    className="px-4 py-2 dark:bg-gray-700 bg-gray-200 dark:text-gray-300 text-gray-700 rounded-lg dark:hover:bg-gray-600 hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {t.createNovel.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !novelName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed text-sm"
                  >
                    {isCreating ? t.createNovel.creating : t.createNovel.create}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
