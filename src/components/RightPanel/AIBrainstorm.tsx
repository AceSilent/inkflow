import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useConfigStore } from '../../store/configStore';
import { useEditorStore } from '../../store/editorStore';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from '../../i18n';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

interface ChatHistory {
  messages: Message[];
  historySummary?: string; // 存储前期对话要点总结
}

// 常量配置
const MAX_RAW_HISTORY = 20; // 最大原始消息数量
const COMPRESS_THRESHOLD = 15; // 触发压缩时保留的消息数量
const SUMMARY_TOKEN_LIMIT = 300; // 总结字数限制

export const AIBrainstorm: React.FC = () => {
  const { t } = useTranslation();
  const { globalOutline, currentChapter, rootPath } = useWorkspaceStore();
  const { currentChapterPath } = useEditorStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [historySummary, setHistorySummary] = useState<string>('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [contextLocked, setContextLocked] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 检查是否正在编辑大纲文件
  const isEditingOutline = currentChapterPath?.endsWith('outline.md');

  // 生成唯一 ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 加载聊天历史
  useEffect(() => {
    loadChatHistory();
  }, [rootPath]);

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChatHistory = async () => {
    if (!rootPath) return;

    try {
      const chatHistoryPath = `${rootPath}/.inkflow/chat_history.json`;
      const historyData = await invoke<string>('read_file', { path: chatHistoryPath });
      const history = JSON.parse(historyData) as ChatHistory;
      setMessages(history.messages || []);
      setHistorySummary(history.historySummary || '');
      console.log('Chat history loaded:', history.messages?.length || 0, 'messages');
    } catch (error) {
      // 文件不存在或读取失败，忽略
      console.log('No existing chat history');
    }
  };

  const saveChatHistory = async (messagesToSave: Message[], summaryToSave?: string) => {
    if (!rootPath) return;

    try {
      const chatHistoryPath = `${rootPath}/.inkflow/chat_history.json`;
      const historyData: ChatHistory = {
        messages: messagesToSave,
        historySummary: summaryToSave !== undefined ? summaryToSave : historySummary,
      };
      await invoke('write_file', {
        path: chatHistoryPath,
        content: JSON.stringify(historyData, null, 2),
      });
      console.log('Chat history saved:', messagesToSave.length, 'messages');
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  };

  // 自动压缩历史对话
  const compressHistory = async (currentMessages: Message[]): Promise<Message[]> => {
    if (currentMessages.length <= MAX_RAW_HISTORY) {
      return currentMessages;
    }

    setIsCompressing(true);
    console.log('🔄 Compressing chat history...');

    try {
      const config = useConfigStore.getState();
      if (!config.apiKey) {
        console.warn('⚠️ No API key, skipping compression');
        return currentMessages;
      }

      // 提取前 (total - COMPRESS_THRESHOLD) 条消息进行总结
      const messagesToCompress = currentMessages.slice(0, currentMessages.length - COMPRESS_THRESHOLD);
      const messagesToKeep = currentMessages.slice(currentMessages.length - COMPRESS_THRESHOLD);

      // 构建总结 prompt
      const conversationText = messagesToCompress
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? '作者' : '顾问'}：${m.content}`)
        .join('\n');

      const summaryPrompt = `请总结以下对话中确定的关键设定、人物改动或情节决策。
要求：
1. 字数控制在 ${SUMMARY_TOKEN_LIMIT} 字以内
2. 只记录确定的信息，忽略建议和讨论
3. 使用简洁的条目式总结
4. 省略客套话和开场白

【对话内容】
${conversationText}

【总结】：`;

      const response = await invoke('generate_ai_suggestion', {
        request: {
          prompt: summaryPrompt,
          max_tokens: 500,
          temperature: 0.3, // 降低温度以获得更确定的总结
          model: 'glm-4-plus',
          stream: false,
        },
        apiKey: config.apiKey,
        apiBaseUrl: config.apiBaseUrl,
      }) as { content: string };

      const newSummary = response.content.trim();

      // 合并新旧总结
      const finalSummary = historySummary
        ? `${historySummary}\n\n【后续对话要点】\n${newSummary}`
        : newSummary;

      setHistorySummary(finalSummary);
      console.log('✅ History compressed, new summary:', finalSummary);

      // 保存压缩后的历史
      await saveChatHistory(messagesToKeep, finalSummary);

      return messagesToKeep;
    } catch (error) {
      console.error('❌ Compression failed:', error);
      return currentMessages;
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || isCompressing) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    let currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInput('');
    setIsLoading(true);

    try {
      // Check API configuration
      const config = useConfigStore.getState();
      if (!config.apiKey) {
        throw new Error(t.rightPanel.configureApiKeyFirstError);
      }

      // 检查是否需要压缩历史
      if (currentMessages.length > MAX_RAW_HISTORY) {
        console.log('📊 Message count:', currentMessages.length, '> threshold:', MAX_RAW_HISTORY);
        currentMessages = await compressHistory(currentMessages);
        setMessages(currentMessages);
      }

      // ========== 优化的 Prompt 构造 ==========
      // 1. 系统指令（仅一次，不重复）
      let systemInstruction = '';

      if (isEditingOutline) {
        systemInstruction = '你是一位专业的小说创作顾问，正在协助作者完善小说大纲。\n\n【任务】\n- 丰富人物设定和角色关系\n- 优化情节发展和矛盾冲突\n- 完善世界观设定\n- 保持整体风格的统一性\n\n【注意】直接回答作者问题，不要重复诊断大纲内容。';
      } else {
        systemInstruction = '你是一位专业的小说创作顾问，正在与作者讨论情节和人物设定。\n\n【注意】直接回答作者问题，聚焦于当前章节的具体内容。';
      }

      // 2. 全局大纲内容（如果存在）
      let globalContext = '';
      if (isEditingOutline && currentChapterPath) {
        try {
          const outlineContent = await invoke<string>('read_file', { path: currentChapterPath });
          globalContext = `[参考背景 - 小说大纲]\n${outlineContent}\n\n`;
        } catch (error) {
          console.error('Failed to read outline file:', error);
        }
      } else if (contextLocked && globalOutline) {
        globalContext = `[小说背景]\n标题：${globalOutline.title}\n简介：${globalOutline.summary}\n人物：${globalOutline.characters.map(c => `${c.name} - ${c.description}`).join('；')}\n情节：${globalOutline.plot_points.join('、')}\n\n`;
        if (currentChapter) {
          globalContext += `[当前章节] ${currentChapter.title}\n\n`;
        }
      }

      // 3. 前期对话要点总结（如果存在）
      const summarySection = historySummary ? `[前期对话要点总结]\n${historySummary}\n\n` : '';

      // 4. 最近 5 条原始对话（保持语气连贯）
      const recentMessages = currentMessages.slice(-5);
      const recentConversation = recentMessages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? '作者' : '顾问'}：${m.content}`)
        .join('\n');

      // 5. 作者当前提问
      const currentQuestion = `[当前提问]${input.trim()}`;

      // 组合最终 Prompt
      const fullPrompt = `${systemInstruction}\n\n${globalContext}${summarySection}${recentConversation ? '[最近对话]\n' + recentConversation + '\n\n' : ''}${currentQuestion}\n\n顾问：`;

      const response = await invoke('generate_ai_suggestion', {
        request: {
          prompt: fullPrompt,
          max_tokens: 2500,
          temperature: 0.8,
          model: 'glm-4-plus',
          stream: false,
        },
        apiKey: config.apiKey,
        apiBaseUrl: config.apiBaseUrl,
      }) as { content: string };

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response.content.trim(),
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...currentMessages, assistantMessage];
      setMessages(finalMessages);

      // 保存到本地
      await saveChatHistory(finalMessages);
    } catch (error) {
      console.error('AI discussion failed:', error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'system',
        content: t.rightPanel.aiUnavailable,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (messages.length === 0 && !historySummary) return;
    if (confirm(t.rightPanel.confirmClear)) {
      setMessages([]);
      setHistorySummary('');
      // 清空历史文件
      if (rootPath) {
        try {
          const chatHistoryPath = `${rootPath}/.inkflow/chat_history.json`;
          const emptyHistory: ChatHistory = { messages: [], historySummary: '' };
          await invoke('write_file', {
            path: chatHistoryPath,
            content: JSON.stringify(emptyHistory, null, 2),
          });
          console.log('Chat history cleared');
        } catch (error) {
          console.error('Failed to clear chat history:', error);
        }
      }
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const updatedMessages = messages.filter(m => m.id !== messageId);
    setMessages(updatedMessages);
    await saveChatHistory(updatedMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

            {/* Clear Button */}
            <button
              onClick={handleClear}
              disabled={messages.length === 0 && !historySummary}
              className="p-1 dark:hover:bg-gray-700 hover:bg-gray-200 rounded dark:text-gray-400 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={historySummary ? "清空对话和记忆总结" : t.rightPanel.clearButtonTitle}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Memory Summary Hint */}
        <AnimatePresence>
          {historySummary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs dark:text-purple-400 text-purple-600 dark:bg-purple-900/20 bg-purple-100/50 rounded px-2 py-1 flex items-center space-x-1"
            >
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="flex-1 truncate">已保存对话要点总结 ({messages.length} 条最近消息)</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context Hint */}
        <AnimatePresence>
          {contextLocked && (globalOutline || isEditingOutline) && !historySummary && (
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
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`relative max-w-[85%] rounded-lg px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : msg.role === 'system'
                      ? 'bg-red-900/20 text-red-400 border border-red-700/30'
                      : 'dark:bg-gray-700 bg-gray-200 dark:text-gray-200 text-gray-800 border dark:border-gray-600 border-gray-300'
                  }`}
                >
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="absolute -top-2 -right-2 p-1 bg-red-600 hover:bg-red-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除消息"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
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
                  <span className="text-sm text-gray-400">{isCompressing ? '正在整理记忆...' : t.rightPanel.thinking}</span>
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
