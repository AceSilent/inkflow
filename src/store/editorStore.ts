import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { type RefObject } from 'react';

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
  generateAISuggestion: () => Promise<void>;

  // Cursor management
  updateCursorPosition: (position: CursorContext) => void;
  updateSelectionRange: (range: { start: number; end: number }) => void;

  // Chapter management
  setCurrentChapterPath: (path: string) => void;
  loadChapterContent: (path: string) => Promise<void>;
  saveChapterContent: () => Promise<void>;

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

    const { suggestion, position } = state.ghostText;
    const cursorOffset = position.offset;

    // Insert ghost text at cursor position
    const newContent =
      state.content.slice(0, cursorOffset) +
      suggestion +
      state.content.slice(cursorOffset);

    set({
      content: newContent,
      ghostText: null,
      feedbackPanelVisible: false,
      isDirty: true,
    });

    // Force focus back to editor after accepting suggestion
    if (editorRef?.current) {
      setTimeout(() => editorRef.current?.focus(), 10);
    }
  },

  // Feedback panel management
  setFeedbackVisible: (visible: boolean) => {
    set({ feedbackPanelVisible: visible });
  },

  // AI suggestion generation
  generateAISuggestion: async () => {
    const state = get();
    if (state.isAISuggesting || state.isLoading) return;

    console.log('🤖 Starting AI suggestion generation...');
    set({ isAISuggesting: true });

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

      // Unified prompt construction
      const prompt = `请基于以下小说内容，续写下一段文字（约100-200字）：\n\n${recentContext}`;

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
        const aiRequest: AIRequest = {
          prompt,
          max_tokens: 300,
          temperature: 0.8,
          model: 'gpt-4',
          stream: false,
        };

        const aiPromise = invoke('generate_ai_suggestion', {
          request: aiRequest,
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
        get().setGhostText(responseContent, cursorPos);
      } else {
        console.log('❌ No valid AI response received');
        // Fallback to mock suggestions
        console.log('🔄 Falling back to mock suggestions due to empty response');
        const fallbackSuggestion = MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
        get().setGhostText(fallbackSuggestion, cursorPos);
      }
    } catch (error) {
      console.error('💥 Failed to generate AI suggestion:', error);
      // Fallback to mock suggestions on error
      console.log('🔄 Falling back to mock suggestions due to error');

      // Ensure minimum display time even during error handling
      await minDisplayPromise;

      const fallbackSuggestion = MOCK_SUGGESTIONS[Math.floor(Math.random() * MOCK_SUGGESTIONS.length)];
      get().setGhostText(fallbackSuggestion, state.cursorPosition);
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
      });
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
    } catch (error) {
      console.error('Failed to save chapter content:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  // Loading states
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setAISuggesting: (suggesting: boolean) => set({ isAISuggesting: suggesting }),

  // Utilities
  updateLastTypingTime: () => set({ lastTypingTime: Date.now() }),

  shouldTriggerAI: () => {
    const state = get();
    const now = Date.now();
    return (
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
}));

// Selectors for easier access to specific state
export const useEditorContent = () => useEditorStore((state) => state.content);
export const useGhostText = () => useEditorStore((state) => state.ghostText);
export const useFeedbackPanelVisible = () => useEditorStore((state) => state.feedbackPanelVisible);
export const useEditorLoading = () => useEditorStore((state) => ({
  isLoading: state.isLoading,
  isAISuggesting: state.isAISuggesting,
}));
export const useEditorDirty = () => useEditorStore((state) => state.isDirty);