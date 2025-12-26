import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useConfigStore } from '../../store/configStore';
import { invoke } from '@tauri-apps/api/tauri';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export const AIBrainstorm: React.FC = () => {
  const { globalOutline } = useWorkspaceStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextLocked, setContextLocked] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
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
        throw new Error('请先在设置中配置 API Key');
      }

      // 构建带上下文的prompt
      let contextPrompt = '你是一位专业的小说创作顾问，正在与作者讨论情节和人物设定。';

      if (contextLocked && globalOutline) {
        contextPrompt += `\n\n【当前小说背景】\n标题：${globalOutline.title}\n简介：${globalOutline.summary}\n\n人物：${globalOutline.characters.map(c => `${c.name} - ${c.description}`).join('；')}\n\n情节要点：${globalOutline.plot_points.join('、')}`;
      }

      // 添加历史对话作为上下文
      const conversationHistory = messages
        .slice(-6) // 只保留最近3轮对话
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
      console.error('❌ AI讨论失败:', error);
      const errorMessage: Message = {
        role: 'system',
        content: '抱歉，AI服务暂时不可用。请检查API配置。',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncToOutline = async () => {
    if (!globalOutline) {
      alert('请先创建大纲');
      return;
    }

    // 提取讨论中有价值的要点
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);

    if (userMessages.length === 0) {
      alert('暂无讨论内容可同步');
      return;
    }

    // 简单策略：将用户的问题作为新的情节点添加到大纲
    const newPlotPoints = userMessages
      .slice(-3) // 只取最近3个问题
      .map(msg => {
        // 简化处理：直接使用用户输入
        return msg.slice(0, 50) + (msg.length > 50 ? '...' : '');
      });

    const updatedOutline = {
      ...globalOutline,
      plot_points: [...globalOutline.plot_points, ...newPlotPoints],
    };

    try {
      const { updateGlobalOutline } = useWorkspaceStore.getState();
      await updateGlobalOutline(updatedOutline);
      alert(`✅ 已将 ${newPlotPoints.length} 个讨论要点同步到大纲！`);
    } catch (error) {
      console.error('❌ 同步失败:', error);
      alert('同步失败，请重试');
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
    if (confirm('确定清空讨论记录吗？')) {
      setMessages([]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="p-4 dark:border-b border-b dark:border-gray-700 border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium dark:text-gray-400 text-gray-600">AI 创作讨论</h3>
          <div className="flex items-center space-x-2">
            {/* 上下文锁定开关 */}
            <button
              onClick={() => setContextLocked(!contextLocked)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                contextLocked
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'dark:bg-gray-700 bg-gray-200 dark:text-gray-400 text-gray-600 dark:border border-gray-600 border-gray-300'
              }`}
              title={contextLocked ? '上下文已锁定：讨论将基于当前大纲' : '上下文未锁定：自由讨论模式'}
            >
              <svg className={`w-3 h-3 ${contextLocked ? 'text-green-400' : 'dark:text-gray-500 text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={contextLocked ? "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" : "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"} />
              </svg>
              <span>{contextLocked ? '已锁定' : '未锁定'}</span>
            </button>

            {/* 一键同步按钮 */}
            <button
              onClick={handleSyncToOutline}
              disabled={messages.length === 0}
              className="flex items-center space-x-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 rounded text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="将讨论要点同步到大纲"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>同步</span>
            </button>

            {/* 清空按钮 */}
            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="p-1 dark:hover:bg-gray-700 hover:bg-gray-200 rounded dark:text-gray-400 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="清空讨论"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* 上下文提示 */}
        <AnimatePresence>
          {contextLocked && globalOutline && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs dark:text-gray-500 text-gray-600 dark:bg-gray-800/50 bg-gray-200/50 rounded px-2 py-1"
            >
              基于《{globalOutline.title}》进行讨论
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">开始与AI讨论情节和人物</p>
              <p className="text-xs text-gray-600">Ask me anything about your story...</p>
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
                  <span className="text-sm text-gray-400">AI思考中...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-4 dark:border-t border-t dark:border-gray-700 border-gray-200">
        <div className="flex items-end space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的想法... (Enter发送，Shift+Enter换行)"
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
          提示：讨论情节发展、人物设定、冲突设计等，AI会基于当前大纲给出建议
        </div>
      </div>
    </div>
  );
};
