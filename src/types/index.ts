// 基础类型定义

export interface Novel {
  id: string;
  title: string;
  author: string;
  genre: string[];
  target_word_count: number;
  current_word_count: number;
  created_at: string;
  updated_at: string;
  last_chapter_id: string;
  settings: NovelSettings;
}

export interface NovelSettings {
  auto_save: boolean;
  ai_trigger_delay: number;
  preferred_model: string;
}

export interface Chapter {
  id: string;
  novel_id: string;
  title: string;
  word_count: number;
  status: 'draft' | 'in_progress' | 'completed';
  order: number;
  created_at: string;
  updated_at: string;
  outline: ChapterOutline;
  content: string;
}

export interface ChapterOutline {
  main_events: string[];
  key_characters: string[];
  locations: string[];
  timeline: string;
}

export interface PlotOutline {
  novel_id: string;
  structure: {
    total_chapters: number;
    act_structure: {
      act_1: {
        chapters: number[];
        description: string;
      };
      act_2: {
        chapters: number[];
        description: string;
      };
      act_3: {
        chapters: number[];
        description: string;
      };
    };
  };
  plot_points: Array<{
    chapter: number;
    event: string;
    description: string;
  }>;
  character_arcs: Array<{
    name: string;
    arc: string;
    key_moments: string[];
  }>;
}

export interface AIRequest {
  prompt: string;
  max_tokens: number;
  temperature: number;
  model: string;
  stream: boolean;
}

export interface AIResponse {
  content: string;
  model: string;
  usage: TokenUsage;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
}

export interface WritingContext {
  globalOutline: PlotOutline;
  previousChapters: Chapter[];
  currentChapter: Chapter;
  cursorPosition: CursorContext;
  recentSuggestions: AISuggestion[];
  prefixContent: string;
  suffixContent: string;
  semanticBoundary: SemanticBoundary;
}

export interface CursorContext {
  line: number;
  column: number;
  offset: number;
}

export interface SemanticBoundary {
  sentenceEnd: boolean;
  paragraphEnd: boolean;
  sceneEnd: boolean;
  lastCompleteThought: string;
}

export interface AISuggestion {
  id: string;
  content: string;
  position: CursorContext;
  timestamp: string;
  accepted: boolean;
  feedback?: string;
}

// 错误类型
export class InkFlowError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'InkFlowError';
  }
}

// 应用状态
export interface AppState {
  workspace: {
    currentNovel: Novel | null;
    currentChapter: Chapter | null;
    recentNovels: Novel[];
  };
  editor: {
    content: string;
    cursorPosition: monaco.Position;
    isDirty: boolean;
    isAISuggesting: boolean;
    ghostText: GhostTextState | null;
    scrollPosition: { scrollTop: number; scrollLeft: number };
    currentChapterUUID: string;
    cursorOffset: number;
    selectionRange?: { start: number; end: number };
    ghostTextSnapshot?: GhostTextSnapshot;
  };
  ai: {
    isGenerating: boolean;
    currentProvider: string;
    availableProviders: string[];
    lastSuggestion: string;
    conversationHistory: ConversationTurn[];
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    discussionPanelOpen: boolean;
    outlinePanelOpen: boolean;
  };
  session: {
    sessionId: string;
    lastActiveTime: string;
    totalWritingTime: number;
    wordCountProgress: {
      startCount: number;
      currentCount: number;
    };
    aiUsageStats: {
      suggestionsGenerated: number;
      suggestionsAccepted: number;
      suggestionsRejected: number;
      feedbackProvided: number;
    };
  };
  window: {
    width: number;
    height: number;
    isMaximized: boolean;
    isFullscreen: boolean;
    sidebarWidth: number;
    discussionPanelWidth: number;
    outlinePanelHeight: number;
  };
  config: AppConfig;
}

export interface GhostTextState {
  suggestion: string;
  position: CursorContext;
  isShowing: boolean;
}

export interface GhostTextSnapshot {
  suggestion: string;
  position: CursorContext;
  timestamp: string;
  contextHash: string;
  aiProvider: string;
  promptId: string;
}

export interface ConversationTurn {
  id: string;
  timestamp: string;
  type: 'user' | 'assistant';
  content: string;
}

export interface AppConfig {
  ai: {
    providers: {
      [key: string]: {
        api_key: string;
        model: string;
        endpoint: string;
      };
    };
    defaultProvider: string;
    maxTokens: number;
    temperature: number;
  };
  editor: {
    autoSaveInterval: number;
    tabSize: number;
    wordWrap: boolean;
    lineNumbers: boolean;
  };
}

// Monaco types (simplified)
declare global {
  namespace monaco {
    interface Position {
      lineNumber: number;
      column: number;
    }

    interface KeyCode {
      Tab: number;
      Enter: number;
      Escape: number;
      UpArrow: number;
      DownArrow: number;
      LeftArrow: number;
      RightArrow: number;
    }
  }
}