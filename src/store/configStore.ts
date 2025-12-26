import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';

// Check if running in Tauri environment
const isTauriAvailable = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

// ============== Type Definitions ==============

export interface AppConfig {
  // AI 配置
  aiDelay: number;          // AI 触发延迟 (ms)
  apiBaseUrl: string;       // API 基础 URL
  apiKey: string | null;    // API 密钥
  isAIEnabled: boolean;     // 是否启用 AI

  // 编辑器配置
  theme: string;            // 主题 (dark/light)
  language: string;         // 语言 (zh-CN/en-US)
  fontSize: number;         // 字体大小
  lineHeight: number;       // 行高
  autoSaveInterval: number; // 自动保存间隔 (ms)

  // 工作区配置
  workspaceRoot: string | null; // 工作区根目录

  // UI 配置
  sidebarCollapsed: boolean;     // 左侧边栏是否收起
  rightPanelCollapsed: boolean;   // 右侧面板是否收起
}

export interface ConfigState extends AppConfig {
  // 状态
  isLoading: boolean;
  error: string | null;
  isDirty: boolean;
}

export interface ConfigActions {
  // 配置操作
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  resetConfig: () => Promise<void>;

  // 更新单个配置项
  setAiDelay: (delay: number) => void;
  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string | null) => void;
  setIsAIEnabled: (enabled: boolean) => void;
  setTheme: (theme: string) => void;
  setLanguage: (language: string) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setAutoSaveInterval: (interval: number) => void;
  setWorkspaceRoot: (root: string | null) => void;

  // UI 配置
  setSidebarCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;

  // 批量更新配置
  updateConfig: (updates: Partial<AppConfig>) => void;

  // 错误处理
  clearError: () => void;
}

// 默认配置
const defaultConfig: AppConfig = {
  aiDelay: 2000,
  apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  apiKey: null,
  isAIEnabled: true,
  theme: 'dark',
  language: 'zh-CN',
  fontSize: 16,
  lineHeight: 1.8,
  autoSaveInterval: 30000,
  workspaceRoot: null,
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
};

export const useConfigStore = create<ConfigState & ConfigActions>((set, get) => ({
  // Initial state
  ...defaultConfig,
  isLoading: false,
  error: null,
  isDirty: false,

  // 加载配置
  loadConfig: async () => {
    if (!isTauriAvailable()) {
      console.warn('配置加载仅在桌面应用中支持');
      // Web 环境使用默认配置
      set({ ...defaultConfig, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const config = await invoke<AppConfig>('load_config');
      console.log('✅ 配置已加载:', config);
      set({
        ...config,
        isLoading: false,
        isDirty: false,
      });
    } catch (error) {
      console.error('❌ 加载配置失败:', error);
      set({
        error: `加载配置失败: ${error}`,
        isLoading: false,
      });
      // 失败时使用默认配置
      set({ ...defaultConfig });
    }
  },

  // 保存配置
  saveConfig: async () => {
    if (!isTauriAvailable()) {
      console.warn('配置保存仅在桌面应用中支持');
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const state = get();
      const configToSave: AppConfig = {
        aiDelay: state.aiDelay,
        apiBaseUrl: state.apiBaseUrl,
        apiKey: state.apiKey,
        isAIEnabled: state.isAIEnabled,
        theme: state.theme,
        language: state.language,
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        autoSaveInterval: state.autoSaveInterval,
        workspaceRoot: state.workspaceRoot,
        sidebarCollapsed: state.sidebarCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
      };

      await invoke('save_config', { config: configToSave });
      console.log('✅ 配置已保存');
      set({
        isLoading: false,
        isDirty: false,
      });
    } catch (error) {
      console.error('❌ 保存配置失败:', error);
      set({
        error: `保存配置失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 重置配置
  resetConfig: async () => {
    set({ isLoading: true, error: null });

    try {
      await invoke('save_config', { config: defaultConfig });
      console.log('✅ 配置已重置');
      set({
        ...defaultConfig,
        isLoading: false,
        isDirty: false,
      });
    } catch (error) {
      console.error('❌ 重置配置失败:', error);
      set({
        error: `重置配置失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 更新单个配置项
  setAiDelay: (delay: number) => {
    set({ aiDelay: delay, isDirty: true });
  },

  setApiBaseUrl: (url: string) => {
    set({ apiBaseUrl: url, isDirty: true });
  },

  setApiKey: (key: string | null) => {
    set({ apiKey: key, isDirty: true });
  },

  setIsAIEnabled: (enabled: boolean) => {
    set({ isAIEnabled: enabled, isDirty: true });
  },

  setTheme: (theme: string) => {
    set({ theme, isDirty: true });
  },

  setLanguage: (language: string) => {
    set({ language, isDirty: true });
  },

  setFontSize: (size: number) => {
    set({ fontSize: size, isDirty: true });
  },

  setLineHeight: (height: number) => {
    set({ lineHeight: height, isDirty: true });
  },

  setAutoSaveInterval: (interval: number) => {
    set({ autoSaveInterval: interval, isDirty: true });
  },

  setWorkspaceRoot: (root: string | null) => {
    set({ workspaceRoot: root, isDirty: true });
  },

  // UI 配置设置器
  setSidebarCollapsed: (collapsed: boolean) => {
    set({ sidebarCollapsed: collapsed, isDirty: true });
  },

  setRightPanelCollapsed: (collapsed: boolean) => {
    set({ rightPanelCollapsed: collapsed, isDirty: true });
  },

  // 批量更新配置
  updateConfig: (updates: Partial<AppConfig>) => {
    set({ ...updates, isDirty: true });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));

// Selectors for easier access
export const useAiDelay = () => useConfigStore((state) => state.aiDelay);
export const useApiConfig = () => useConfigStore((state) => ({
  apiBaseUrl: state.apiBaseUrl,
  apiKey: state.apiKey,
  isAIEnabled: state.isAIEnabled,
}));
export const useEditorConfig = () => useConfigStore((state) => ({
  theme: state.theme,
  language: state.language,
  fontSize: state.fontSize,
  lineHeight: state.lineHeight,
  autoSaveInterval: state.autoSaveInterval,
}));
