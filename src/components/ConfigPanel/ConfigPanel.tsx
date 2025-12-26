import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfigStore } from '../../store/configStore';
import { useEditorStore } from '../../store/editorStore';

export const ConfigPanel: React.FC = () => {
  const {
    // AI 配置
    aiDelay,
    apiBaseUrl,
    apiKey,
    isAIEnabled,
    // 编辑器配置
    theme,
    language,
    fontSize,
    lineHeight,
    autoSaveInterval,
    // 状态和方法
    isLoading,
    error,
    isDirty,
    saveConfig,
    resetConfig,
    setAiDelay,
    setApiBaseUrl,
    setApiKey,
    setIsAIEnabled,
    setTheme,
    setLanguage,
    setFontSize,
    setLineHeight,
    setAutoSaveInterval,
    clearError,
  } = useConfigStore();

  const { clearGhostText } = useEditorStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'editor' | 'workspace'>('ai');

  const handleSave = async () => {
    await saveConfig();
    setIsOpen(false);
  };

  const handleReset = async () => {
    if (confirm('确定要重置所有配置到默认值吗？')) {
      await resetConfig();
    }
  };

  return (
    <>
      {/* 配置按钮 */}
      <button
        onClick={() => {
          clearGhostText(); // 清除AI建议
          setIsOpen(true);
        }}
        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        title="设置"
      >
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* 配置面板 - 使用 Portal 渲染到 body 以避免被父容器裁剪 */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (isDirty) {
                  if (confirm('有未保存的更改，确定要关闭吗？')) {
                    setIsOpen(false);
                  }
                } else {
                  setIsOpen(false);
                }
              }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
            >
              {/* 配置面板 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
              >
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-semibold text-white">设置</h2>
                  <button
                    onClick={() => {
                      if (isDirty) {
                        if (confirm('有未保存的更改，确定要关闭吗？')) {
                          setIsOpen(false);
                        }
                      } else {
                        setIsOpen(false);
                      }
                    }}
                    className="p-1 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 错误提示 */}
                {error && (
                  <div className="mx-6 mt-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-red-400">{error}</p>
                      <button
                        onClick={clearError}
                        className="p-1 hover:bg-red-900/30 rounded transition-colors"
                      >
                        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* 标签页 */}
                <div className="flex border-b border-gray-700">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'ai'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    AI 设置
                  </button>
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'editor'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    编辑器
                  </button>
                  <button
                    onClick={() => setActiveTab('workspace')}
                    className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'workspace'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    工作区
                  </button>
                </div>

                {/* 内容区域 */}
                <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)]">
                  {/* AI 设置 */}
                  {activeTab === 'ai' && (
                    <div className="space-y-6">
                      {/* AI 启用开关 */}
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium text-white">启用 AI</label>
                          <p className="text-xs text-gray-500 mt-1">启用或禁用 AI 续写功能</p>
                        </div>
                        <button
                          onClick={() => setIsAIEnabled(!isAIEnabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isAIEnabled ? 'bg-blue-600' : 'bg-gray-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              isAIEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {/* API 基础 URL */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">API 基础 URL</label>
                        <input
                          type="text"
                          value={apiBaseUrl}
                          onChange={(e) => setApiBaseUrl(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions"
                        />
                      </div>

                      {/* API 密钥 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">
                          API 密钥 <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="password"
                          value={apiKey || ''}
                          onChange={(e) => setApiKey(e.target.value || null)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          placeholder="请输入 API Key"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          必填项。支持兼容 OpenAI API 格式的服务（如智谱AI、DeepSeek 等）
                        </p>
                      </div>

                      {/* AI 触发延迟 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">
                          AI 触发延迟: {aiDelay}ms
                        </label>
                        <input
                          type="range"
                          min="500"
                          max="5000"
                          step="100"
                          value={aiDelay}
                          onChange={(e) => setAiDelay(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>500ms</span>
                          <span>5000ms</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 编辑器设置 */}
                  {activeTab === 'editor' && (
                    <div className="space-y-6">
                      {/* 字体大小 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">
                          字体大小: {fontSize}px
                        </label>
                        <input
                          type="range"
                          min="12"
                          max="24"
                          step="1"
                          value={fontSize}
                          onChange={(e) => setFontSize(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>12px</span>
                          <span>24px</span>
                        </div>
                      </div>

                      {/* 行高 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">
                          行高: {lineHeight.toFixed(1)}
                        </label>
                        <input
                          type="range"
                          min="1.0"
                          max="2.5"
                          step="0.1"
                          value={lineHeight}
                          onChange={(e) => setLineHeight(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>1.0</span>
                          <span>2.5</span>
                        </div>
                      </div>

                      {/* 自动保存间隔 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">
                          自动保存间隔: {autoSaveInterval / 1000}s
                        </label>
                        <input
                          type="range"
                          min="10000"
                          max="120000"
                          step="5000"
                          value={autoSaveInterval}
                          onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>10s</span>
                          <span>120s</span>
                        </div>
                      </div>

                      {/* 主题 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">主题</label>
                        <div className="flex space-x-2">
                          {['dark', 'light'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setTheme(t)}
                              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                theme === t
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                              }`}
                            >
                              {t === 'dark' ? '深色' : '浅色'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 语言 */}
                      <div>
                        <label className="text-sm font-medium text-white block mb-2">语言</label>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                          <option value="zh-CN">简体中文</option>
                          <option value="en-US">English</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* 工作区设置 */}
                  {activeTab === 'workspace' && (
                    <div className="space-y-6">
                      <div className="text-center py-8">
                        <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <p className="text-gray-500 text-sm">工作区设置</p>
                        <p className="text-gray-600 text-xs mt-2">从左侧边栏打开小说文件夹</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 bg-gray-900">
                  <div className="flex items-center space-x-2">
                    {isDirty && (
                      <span className="text-xs text-yellow-400 flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        有未保存的更改
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      重置
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isLoading || !isDirty}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>保存中...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>保存</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
