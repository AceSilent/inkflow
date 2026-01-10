import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useConfigStore } from '../../store/configStore';
import { useEditorStore } from '../../store/editorStore';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from '../../i18n';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export const AIBrainstorm: React.FC = () => {
  const { t } = useTranslation();
  const { globalOutline, currentChapter } = useWorkspaceStore();
  const { currentChapterPath } = useEditorStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextLocked, setContextLocked] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 检查是否正在编辑大纲文件
  const isEditingOutline = currentChapterPath?.endsWith('outline.md');

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Check API configuration
      const config = useConfigStore.getState();
      if (!config.apiKey) {
        throw new Error(t.rightPanel.configureApiKeyFirstError);
      }

      // Build prompt with context
      let contextPrompt = '';

      if (isEditingOutline) {
        // 编辑大纲时，直接读取大纲文件的原始内容
        contextPrompt = '你是一位专业的小说创作顾问，正在协助作者完善小说大纲。';

        // 获取大纲文件的原始内容
        if (currentChapterPath) {
          try {
            const outlineContent = await invoke<string>('read_file', { path: currentChapterPath });
            contextPrompt += `\n\n【当前大纲内容】\n${outlineContent}`;
          } catch (error) {
            console.error('Failed to read outline file:', error);
          }
        }

        contextPrompt += '\n\n【任务】请协助作者完善大纲结构，包括：\n1. 丰富人物设定和角色关系\n2. 优化情节发展和矛盾冲突\n3. 完善世界观设定\n4. 保持整体风格的统一性';
      } else {
        // 编辑章节时的常规 prompt
        contextPrompt = '你是一位专业的小说创作顾问，正在与作者讨论情节和人物设定。';
        if (contextLocked && globalOutline) {
          contextPrompt += `\n\n【当前小说背景】\n标题：${globalOutline.title}\n简介：${globalOutline.summary}\n\n人物：${globalOutline.characters.map(c => `${c.name} - ${c.description}`).join('；')}\n\n情节要点：${globalOutline.plot_points.join('、')}`;
        }
        if (currentChapter) {
          contextPrompt += `\n\n【当前章节】${currentChapter.title}`;
        }
      }

      // Add conversation history as context
      const conversationHistory = messages
        .slice(-6) // Keep only last 3 rounds of conversation
        .map(m => `${m.role === 'user' ? '作者' : '顾问'}：${m.content}`)
        .join('\n');

      const fullPrompt = conversationHistory
        ? `${contextPrompt}\n\n【对话历史】\n${conversationHistory}\n\n作者：${input}\n\n顾问：`
        : `${contextPrompt}\n\n作者：${input}\n\n顾问：`;

      const response = await invoke('generate_ai_suggestion', {
        request: {
          prompt: fullPrompt,
          max_tokens: 800,
          temperature: 0.8,
          model: 'glm-4-plus',
          stream: false,
        },
        apiKey: config.apiKey,
        apiBaseUrl: config.apiBaseUrl,
      }) as { content: string };

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content.trim(),
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI discussion failed:', error);
      const errorMessage: Message = {
        role: 'system',
        content: t.rightPanel.aiUnavailable,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncToOutline = async () => {
    if (!globalOutline) {
      alert(t.rightPanel.createOutlineFirst);
      return;
    }

    // Extract valuable points from discussion
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);

    if (userMessages.length === 0) {
      alert(t.rightPanel.noContentToSync);
      return;
    }

    // Simple strategy: add user questions as new plot points
    const newPlotPoints = userMessages
      .slice(-3) // Only take last 3 questions
      .map(msg => {
        // Simplified: use user input directly
        return msg.slice(0, 50) + (msg.length > 50 ? '...' : '');
      });

    const updatedOutline = {
      ...globalOutline,
      plot_points: [...globalOutline.plot_points, ...newPlotPoints],
    };

    try {
      const { updateGlobalOutline } = useWorkspaceStore.getState();
      await updateGlobalOutline(updatedOutline);
      alert(`${t.rightPanel.syncedPoints} ${newPlotPoints.length} 个讨论要点同步到大纲！`);
    } catch (error) {
      console.error('Sync failed:', error);
      alert(t.rightPanel.syncFailed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (messages.length === 0) return;
    if (confirm(t.rightPanel.confirmClear)) {
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top Toolbar */}
      <div className="p-4 dark:border-b border-b dark:border-gray-700 border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium dark:text-gray-400 text-gray-600">{t.rightPanel.aiDiscussion}</h3>
          <div className="flex items-center space-x-2">
            {/* Context Lock Toggle */}
            <button
              onClick={() => setContextLocked(!contextLocked)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                contextLocked
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'dark:bg-gray-700 bg-gray-200 dark:text-gray-400 text-gray-600 dark:border border-gray-600 border-gray-300'
              }`}
              title={contextLocked ? t.rightPanel.contextLockedTitle : t.rightPanel.contextUnlockedTitle}
            >
              <svg className={`w-3 h-3 ${contextLocked ? 'text-green-400' : 'dark:text-gray-500 text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={contextLocked ? "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" : "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"} />
              </svg>
              <span>{contextLocked ? t.rightPanel.locked : t.rightPanel.unlocked}</span>
            </button>

            {/* Sync Button */}
            <button
              onClick={handleSyncToOutline}
              disabled={messages.length === 0}
              className="flex items-center space-x-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t.rightPanel.syncButtonTitle}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>{t.rightPanel.sync}</span>
            </button>

            {/* Clear Button */}
            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="p-1 dark:hover:bg-gray-700 hover:bg-gray-200 rounded dark:text-gray-400 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t.rightPanel.clearButtonTitle}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Context Hint */}
        <AnimatePresence>
          {contextLocked && (globalOutline || isEditingOutline) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs dark:text-gray-500 text-gray-600 dark:bg-gray-800/50 bg-gray-200/50 rounded px-2 py-1"
            >
              {isEditingOutline ? (
                <span>正在编辑大纲 - AI 将协助完善大纲结构</span>
              ) : (
                <span>{t.rightPanel.basedOn}{globalOutline?.title}》进行讨论</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">{t.rightPanel.startDiscussion}</p>
              <p className="text-xs text-gray-600">{t.rightPanel.askingMe}</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : msg.role === 'system'
                      ? 'bg-red-900/20 text-red-400 border border-red-700/30'
                      : 'dark:bg-gray-700 bg-gray-200 dark:text-gray-200 text-gray-800 border dark:border-gray-600 border-gray-300'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-xs opacity-50 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="dark:bg-gray-700 bg-gray-200 dark:text-gray-200 text-gray-800 border dark:border-gray-600 border-gray-300 rounded-lg px-3 py-2 flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">{t.rightPanel.thinking}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 dark:border-t border-t dark:border-gray-700 border-gray-200">
        <div className="flex items-end space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.rightPanel.inputPlaceholder}
            className="flex-1 px-3 py-2 dark:bg-gray-800 bg-white dark:border border-gray-700 border-gray-300 rounded-lg dark:text-white text-gray-900 text-sm dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:disabled:bg-gray-700 disabled:bg-gray-300 dark:disabled:text-gray-500 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="mt-2 dark:text-xs text-xs dark:text-gray-500 text-gray-600">
          {t.rightPanel.discussionHint}
        </div>
      </div>
    </div>
  );
};
