import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { type RefObject } from 'react';
import type * as monaco from 'monaco-editor';
import { useWorkspaceStore } from './workspaceStore';
import { useConfigStore } from './configStore';
import { showWarning } from './toastStore';

// Check if running in Tauri environment
const isTauriAvailable = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

// Unified mock suggestions for all environments
const MOCK_SUGGESTIONS = [
  "夜幕降临，城市的霓虹灯开始闪烁，街道上的行人渐渐稀少。",
  "微风吹过，带来了远方的花香，也吹起了心中的涟漪。",
  "雨滴敲打着窗户，发出清脆的声响，仿佛在诉说着什么。",
  "阳光透过云层的缝隙洒向大地，给这个清晨带来了温暖。",
  "月光如水般洒在湖面上，泛起层层银色的涟漪。",
  "远山如黛，近水含烟，构成了一幅绝美的山水画卷。",
];
import type {
  GhostTextState,
  CursorContext,
  AIRequest,
  AIResponse,
  GhostTextSnapshot
} from '../types';

export interface EditorState {
  // Core editor state
  content: string;
  isDirty: boolean;
  isAISuggesting: boolean;
  isLoading: boolean;

  // Ghost text state
  ghostText: GhostTextState | null;
  ghostTextSnapshot?: GhostTextSnapshot;

  // Feedback panel state
  feedbackPanelVisible: boolean;

  // Cursor and selection
  cursorPosition: CursorContext;
  selectionRange?: { start: number; end: number };

  // Chapter management
  currentChapterPath: string;
  lastSavedContent: string;
  currentChapterOrder: number; // 章节序号，用于获取前文摘要

  // Auto-summary state
  lastSummaryWordCount: number; // 上次生成摘要时的字数
  summaryThreshold: number; // 自动生成摘要的字数阈值

  // Debounce timing
  aiTriggerDelay: number;
  lastTypingTime: number;
}

export interface EditorActions {
  // Content management
  updateContent: (content: string) => void;
  resetDirty: () => void;

  // Ghost text management
  setGhostText: (suggestion: string, position: CursorContext) => void;
  clearGhostText: () => void;
  acceptSuggestion: (editorRef?: RefObject<monaco.editor.IStandaloneCodeEditor>) => Promise<void>;

  // Feedback panel management
  setFeedbackVisible: (visible: boolean) => void;

  // AI suggestion generation
  generateAISuggestion: (feedback?: string) => Promise<void>;

  // Cursor management
  updateCursorPosition: (position: CursorContext) => void;
  updateSelectionRange: (range: { start: number; end: number }) => void;

  // Chapter management
  setCurrentChapterPath: (path: string) => void;
  setCurrentChapterOrder: (order: number) => void;
  loadChapterContent: (path: string) => Promise<void>;
  saveChapterContent: () => Promise<void>;

  // Auto-summary functionality
  generateAndSaveChapterSummary: () => Promise<void>;
  checkAndTriggerAutoSummary: () => Promise<void>;

  // State persistence
  saveLastState: (editorRef?: RefObject<monaco.editor.IStandaloneCodeEditor>) => Promise<void>;

  // Loading states
  setLoading: (loading: boolean) => void;
  setAISuggesting: (suggesting: boolean) => void;

  // Utilities
  updateLastTypingTime: () => void;
  shouldTriggerAI: () => boolean;

  // Auto-save functionality
  autoSave: () => Promise<void>;
}

export const useEditorStore = create<EditorState & EditorActions>((set, get) => ({
  // Initial state
  content: '',
  isDirty: false,
  isAISuggesting: false,
  isLoading: false,
  ghostText: null,
  feedbackPanelVisible: false,
  cursorPosition: { line: 1, column: 1, offset: 0 },
  currentChapterPath: '',
  lastSavedContent: '',
  currentChapterOrder: 0,
  lastSummaryWordCount: 0,
  summaryThreshold: 500, // 自动生成摘要的阈值：500字
  aiTriggerDelay: 2000, // 2 seconds
  lastTypingTime: 0,

  // Content management
  updateContent: (newContent: string) => {
    const state = get();
    set({
      content: newContent,
      isDirty: newContent !== state.lastSavedContent,
    });
    get().updateLastTypingTime();

    // 检查是否需要自动生成摘要（异步执行，不阻塞用户输入）
    setTimeout(() => {
      get().checkAndTriggerAutoSummary();
    }, 100);
  },

  resetDirty: () => set({ isDirty: false }),

  // Ghost text management
  setGhostText: (suggestion: string, position: CursorContext) => {
    set({
      ghostText: {
        suggestion,
        position,
        isShowing: true,
      },
      ghostTextSnapshot: {
        suggestion,
        position,
        timestamp: new Date().toISOString(),
        contextHash: btoa(position.toString()),
        aiProvider: 'gpt-4',
        promptId: crypto.randomUUID(),
      },
    });
  },

  clearGhostText: () => {
    set({
      ghostText: null,
      feedbackPanelVisible: false,
    });
  },

  acceptSuggestion: async (editorRef?: RefObject<monaco.editor.IStandaloneCodeEditor>) => {
    const state = get();
    if (!state.ghostText) return;

    console.log('📝 Syncing Store state after suggestion acceptance');

    // Get the latest content from Monaco editor if available
    const updatedContent = editorRef?.current ?
      editorRef.current.getValue() :
      state.content;

    // Store should only manage state synchronization, not text manipulation
    // The actual text insertion is handled by Monaco's native operations in MainEditor
    set({
      content: updatedContent, // Sync with Monaco's actual content
      ghostText: null,
      feedbackPanelVisible: false,
      isDirty: true,
    });

    // Note: Focus management is now handled by the caller (MainEditor) for better control
  },

  // Feedback panel management
  setFeedbackVisible: (visible: boolean) => {
    set({ feedbackPanelVisible: visible });
  },

  // AI suggestion generation
  generateAISuggestion: async (feedback?: string) => {
    const state = get();
    const config = useConfigStore.getState();

    // 检查 AI 是否启用
    if (!config.isAIEnabled) {
      console.log('⏭️ AI suggestion is disabled in config');
      return;
    }

    if (state.isAISuggesting || state.isLoading) return;

    console.log('🤖 Starting AI suggestion generation...', feedback ? `with feedback: ${feedback}` : '');
    set({ isAISuggesting: true });

    // Clear existing ghost text before regeneration
    set({ ghostText: null, feedbackPanelVisible: false });

    // Minimum display time to ensure users can see the loading animation
    const MIN_DISPLAY_TIME = 800; // 800ms
    const minDisplayPromise = new Promise(resolve => setTimeout(resolve, MIN_DISPLAY_TIME));

    try {
      // Get current context for AI generation
      const cursorPos = state.cursorPosition;
      const contextText = state.content.slice(0, cursorPos.offset);

      // Get last few paragraphs for context
      const paragraphs = contextText.split('\n\n');
      const recentContext = paragraphs.slice(-2).join('\n\n');

      console.log('📝 AI context:', {
        cursorOffset: cursorPos.offset,
        contextLength: contextText.length,
        recentContextLength: recentContext.length
      });

      // 构建"上帝视角" Prompt
      const workspaceState = useWorkspaceStore.getState();
      const globalOutline = workspaceState.globalOutline;
      const lastTwoSummaries = workspaceState.getLastTwoChapterSummaries();

      // 生成全局背景设定文本
      let globalContext = '';
      if (globalOutline) {
        globalContext = `【全局背景设定】
标题：${globalOutline.title}
简介：${globalOutline.summary}
人物：${globalOutline.characters.map(c => `${c.name}（${c.role}）- ${c.description}`).join('；')}
情节：${globalOutline.plot_points.join('、')}
${globalOutline.world_setting ? `世界观：${globalOutline.world_setting}` : ''}

`;
      }

      // 生成前情提要文本
      let previousContext = '';
      if (lastTwoSummaries.length > 0) {
        previousContext = `【前情提要】
${lastTwoSummaries.join('\n')}

`;
      }

      // 生成当前光标位置标记
      const cursorMarker = recentContext.length > 0
        ? recentContext.slice(0, cursorPos.offset) + '[光标位置]' + recentContext.slice(cursorPos.offset)
        : '[光标位置]';

      // Unified prompt construction with feedback support
      let prompt: string;
      if (feedback) {
        prompt = `你是小说续写助手。用户对刚才的续写有以下要求：${feedback}

${globalContext}${previousContext}【本章当前内容】
${cursorMarker}

请直接续写内容，不要任何解释、前缀或对话式语言（如"按照你的要求"、"好的"等），直接开始小说正文：`;
      } else {
        prompt = `你是小说续写助手。请基于以下信息续写小说：

${globalContext}${previousContext}【本章当前内容】
${cursorMarker}

请续写下一段（约100-200字），直接开始正文，不要任何解释或前缀：`;
      }

      // Remove length restriction - just ensure cursor is at a valid position
      if (cursorPos.offset === 0 && state.content.trim().length === 0) {
        console.log('⏭️ Skipping AI generation - empty document');
        await minDisplayPromise; // Still wait minimum time
        set({ isAISuggesting: false });
        return;
      }

      let responseContent: string;

      if (isTauriAvailable()) {
        // Call Rust backend
        console.log('🚀 Using Tauri backend for AI suggestion');

        // Get API configuration from config store
        const config = useConfigStore.getState();
        if (!config.apiKey) {
          console.error('❌ API Key not configured');
          showWarning('请先在设置中配置 API Key', 4000);
          await minDisplayPromise;
          set({ isAISuggesting: false });
          return;
        }

        const aiRequest: AIRequest = {
          prompt,
          max_tokens: 300,
          temperature: 0.8,
          model: 'glm-4-plus', // AI 模型
          stream: false,
        };

        const aiPromise = invoke('generate_ai_suggestion', {
          request: aiRequest,
          apiKey: config.apiKey,
          apiBaseUrl: config.apiBaseUrl,
        }) as Promise<AIResponse>;

        const [response] = await Promise.all([aiPromise, minDisplayPromise]);
        responseContent = response.content;
      } else {
        // Mock AI suggestion for web development
        console.log('🌐 Using mock AI suggestion for web development');

        // Use Promise.all to ensure minimum display time
        const mockPromise = new Promise<string>((resolve) => {
          setTimeout(() => {
            const mockSuggestion = MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
            resolve(mockSuggestion);
          }, 1000); // Simulate API delay
        });

        const [mockResponse] = await Promise.all([mockPromise, minDisplayPromise]);
        responseContent = mockResponse;
      }

      if (responseContent && responseContent.trim()) {
        console.log('✅ AI suggestion generated:', responseContent);
        // Clean up suggestion to prevent unwanted newlines that cause cursor jumping
        const cleanedSuggestion = responseContent.trimEnd();
        get().setGhostText(cleanedSuggestion, cursorPos);
      } else {
        console.log('❌ No valid AI response received');
        // Fallback to mock suggestions
        console.log('🔄 Falling back to mock suggestions due to empty response');
        const fallbackSuggestion = MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
        // Ensure mock suggestions are also clean
        const cleanedFallback = fallbackSuggestion.trimEnd();
        get().setGhostText(cleanedFallback, cursorPos);
      }
    } catch (error) {
      console.error('💥 Failed to generate AI suggestion:', error);
      // Fallback to mock suggestions on error
      console.log('🔄 Falling back to mock suggestions due to error');

      // Ensure minimum display time even during error handling
      await minDisplayPromise;

      const fallbackSuggestion = MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
      // Ensure fallback suggestions are also clean
      const cleanedFallback = fallbackSuggestion.trimEnd();
      get().setGhostText(cleanedFallback, state.cursorPosition);
    } finally {
      set({ isAISuggesting: false });
      console.log('🔚 AI suggestion generation completed');
    }
  },

  // Cursor management
  updateCursorPosition: (position: CursorContext) => {
    set({ cursorPosition: position });

    // Clear ghost text if cursor moves significantly
    const state = get();
    if (state.ghostText) {
      const ghostOffset = state.ghostText.position.offset;
      const currentOffset = position.offset;

      // Clear if cursor moved more than 50 characters away
      if (Math.abs(ghostOffset - currentOffset) > 50) {
        get().clearGhostText();
      }
    }
  },

  updateSelectionRange: (range: { start: number; end: number }) => {
    set({ selectionRange: range });

    // Clear ghost text when text is selected
    if (range.start !== range.end) {
      get().clearGhostText();
    }
  },

  // Chapter management
  setCurrentChapterPath: (path: string) => {
    set({
      currentChapterPath: path,
      content: '',
      lastSavedContent: '',
      isDirty: false,
      ghostText: null,
      lastSummaryWordCount: 0, // 重置摘要字数计数
    });
  },

  loadChapterContent: async (path: string) => {
    const state = get();
    if (!path) return;

    state.setLoading(true);
    try {
      const content: string = await invoke('read_file', { path });
      set({
        currentChapterPath: path,
        content,
        lastSavedContent: content,
        isDirty: false,
        ghostText: null,
        lastSummaryWordCount: content.length, // 初始化为当前字数
      });

      // 保存最后打开的章节状态（注意：此时 editorRef 可能还没有传入，所以无法获取光标位置）
      // 光标和滚动位置会在 MainEditor 中通过 onDidChangeCursorPosition 事件保存
    } catch (error) {
      console.error('Failed to load chapter content:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  saveChapterContent: async () => {
    const state = get();
    if (!state.currentChapterPath || !state.isDirty) return;

    state.setLoading(true);
    try {
      if (isTauriAvailable()) {
        await invoke('write_file', {
          path: state.currentChapterPath,
          content: state.content,
        });
      } else {
        // Fallback to localStorage for web development
        console.log('Saving to localStorage for web development');
        localStorage.setItem(`inkflow_chapter_${state.currentChapterPath}`, state.content);
      }

      set({
        lastSavedContent: state.content,
        isDirty: false,
      });

      // 保存后自动生成摘要
      await get().generateAndSaveChapterSummary();
    } catch (error) {
      console.error('Failed to save chapter content:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setCurrentChapterOrder: (order: number) => {
    set({ currentChapterOrder: order });
  },

  // Auto-summary functionality
  generateAndSaveChapterSummary: async () => {
    const state = get();
    if (!state.currentChapterPath || state.content.length < 100) {
      console.log('⏭️ Skipping summary - content too short or no chapter loaded');
      return;
    }

    console.log('📝 Generating chapter summary...');
    set({ isLoading: true });

    try {
      // 获取前N-1和N-2章的摘要
      let previousSummaries = '';
      if (state.currentChapterOrder > 1) {
        try {
          const workspaceState = useWorkspaceStore.getState();
          const novelPath = workspaceState.rootPath;
          if (novelPath && isTauriAvailable()) {
            previousSummaries = await invoke<string>('get_previous_summaries', {
              novelPath,
              currentChapterOrder: state.currentChapterOrder,
              count: 2,
            });
          }
        } catch (error) {
          console.warn('⚠️ Failed to get previous summaries:', error);
        }
      }

      // 构建AI摘要生成Prompt
      const summaryPrompt = `你是一个小说摘要助手。请为当前章节生成简短摘要。

${previousSummaries ? `【前文摘要】\n${previousSummaries}\n` : ''}【当前章节内容】
${state.content}

请生成：
1. 摘要（50-100字，概括本章主要情节、事件、人物发展）
2. 关键词（3-5个，用顿号分隔，如：冲突、揭秘、感情升温）

请直接以JSON格式返回，格式如下：
{
  "summary": "摘要内容",
  "keywords": ["关键词1", "关键词2", "关键词3"]
}

不要添加任何其他文字或说明。`;

      // 调用AI生成摘要
      const config = useConfigStore.getState();
      if (!config.apiKey) {
        console.warn('⚠️ API Key not configured, skipping summary generation');
        set({ isLoading: false });
        return;
      }

      const aiRequest: AIRequest = {
        prompt: summaryPrompt,
        max_tokens: 500,
        temperature: 0.7,
        model: 'glm-4-plus',
        stream: false,
      };

      let summaryText: string;
      if (isTauriAvailable()) {
        const response = await invoke<AIResponse>('generate_ai_suggestion', {
          request: aiRequest,
          apiKey: config.apiKey,
          apiBaseUrl: config.apiBaseUrl,
        });
        summaryText = response.content;
      } else {
        // Mock response for web development
        summaryText = JSON.stringify({
          summary: '本章主要讲述了主角在关键时刻做出的重要决定，影响了后续剧情发展。',
          keywords: ['决定', '转折', '成长']
        });
      }

      // 解析AI返回的JSON
      let summaryData: { summary: string; keywords: string[] };
      try {
        // 尝试提取JSON（AI可能会返回额外的文字）
        const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          summaryData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (error) {
        console.error('❌ Failed to parse summary JSON:', error);
        // 使用默认值
        summaryData = {
          summary: '本章内容摘要',
          keywords: ['情节', '发展']
        };
      }

      // 提取章节文件名
      const chapterFilename = state.currentChapterPath.split(/[\\/]/).pop() || '';
      const workspaceState = useWorkspaceStore.getState();
      const novelPath = workspaceState.rootPath;

      if (novelPath && isTauriAvailable()) {
        // 保存摘要到 .inkflow/summaries/
        const chapterSummary = {
          chapter_path: state.currentChapterPath,
          summary: summaryData.summary,
          keywords: summaryData.keywords,
          generated_at: new Date().toISOString(),
        };

        await invoke('save_chapter_summary', {
          novelPath,
          chapterFilename,
          summary: chapterSummary,
        });

        console.log('✅ Chapter summary saved:', chapterSummary);
        // 更新上次生成摘要的字数
        set({ lastSummaryWordCount: state.content.length });
      }
    } catch (error) {
      console.error('❌ Failed to generate chapter summary:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  checkAndTriggerAutoSummary: async () => {
    const state = get();
    const currentWordCount = state.content.length;
    const wordCountIncrease = currentWordCount - state.lastSummaryWordCount;

    // 如果字数增加超过阈值，触发自动摘要
    if (wordCountIncrease >= state.summaryThreshold && state.currentChapterOrder > 0) {
      console.log(`📊 Word count increased by ${wordCountIncrease}, triggering auto-summary...`);
      await get().generateAndSaveChapterSummary();
    }
  },

  // Loading states
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setAISuggesting: (suggesting: boolean) => set({ isAISuggesting: suggesting }),

  // Utilities
  updateLastTypingTime: () => set({ lastTypingTime: Date.now() }),

  shouldTriggerAI: () => {
    const state = get();
    const config = useConfigStore.getState();
    const now = Date.now();
    return (
      config.isAIEnabled && // 检查 AI 是否启用
      now - state.lastTypingTime >= state.aiTriggerDelay &&
      !state.isAISuggesting &&
      !state.isLoading &&
      !state.ghostText
    );
  },

  // Auto-save functionality
  autoSave: async () => {
    const state = get();
    if (state.isDirty && state.currentChapterPath) {
      await state.saveChapterContent();
    }
  },

  // State persistence
  saveLastState: async (editorRef?: RefObject<monaco.editor.IStandaloneCodeEditor>) => {
    if (!isTauriAvailable()) {
      return;
    }

    const state = get();

    // 只有在有打开章节时才保存
    if (!state.currentChapterPath) {
      return;
    }

    try {
      // 从章节路径提取小说路径和章节文件名
      // 例如: D:\文件\小说\我的小说\text\第1章.md
      // => novelPath: D:\文件\小说\我的小说
      // => chapterFile: text\第1章.md
      const pathParts = state.currentChapterPath.split(/[\/\\]/);
      const chapterFile = pathParts.slice(-2).join('/'); // text/第1章.md
      const novelPath = pathParts.slice(0, -2).join('\\'); // D:\文件\小说\我的小说

      // 获取光标位置和滚动位置
      let scrollPosition: number | null = null;
      let cursorPosition: [number, number] | null = null;

      if (editorRef?.current) {
        const editor = editorRef.current;
        const pos = editor.getPosition();
        if (pos) {
          cursorPosition = [pos.lineNumber, pos.column];
        }

        // 获取滚动位置（第一个可见行号）
        scrollPosition = editor.getVisibleRanges()[0]?.startLineNumber || null;
      }

      const lastState = {
        lastNovelPath: novelPath,
        lastChapterFile: chapterFile,
        scrollPosition,
        cursorPosition,
        lastSavedAt: new Date().toISOString(),
      };

      await invoke('save_last_state', { state: lastState });
      console.log('💾 状态已保存:', lastState);
    } catch (error) {
      console.warn('⚠️ 保存状态失败:', error);
    }
  },
}));

// Selectors for easier access to specific state
export const useEditorContent = () => useEditorStore((state) => state.content);
export const useGhostText = () => useEditorStore((state) => state.ghostText);
export const useFeedbackPanelVisible = () => useEditorStore((state) => state.feedbackPanelVisible);
export const useEditorLoading = () => useEditorStore((state) => ({
  isLoading: state.isLoading,
  isAISuggesting: state.isAISuggesting,
  currentChapterPath: state.currentChapterPath,
}));
export const useEditorDirty = () => useEditorStore((state) => state.isDirty);