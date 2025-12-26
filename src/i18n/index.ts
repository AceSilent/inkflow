export type Language = 'zh-CN' | 'en-US';

export interface Translations {
  // Config Panel
  config: {
    title: string;
    aiSettings: string;
    editor: string;
    workspace: string;
    enableAI: string;
    enableAIDesc: string;
    apiBaseUrl: string;
    apiKey: string;
    apiKeyRequired: string;
    apiKeyDesc: string;
    aiDelay: string;
    fontSize: string;
    lineHeight: string;
    autoSaveInterval: string;
    theme: string;
    language: string;
    dark: string;
    light: string;
    save: string;
    saving: string;
    reset: string;
    resetConfirm: string;
    unsavedChanges: string;
    unsavedChangesWarning: string;
    closeWarning: string;
  };
  // Sidebar
  sidebar: {
    openFolder: string;
    chapterList: string;
    outline: string;
    newChapter: string;
    newChapterPlaceholder: string;
    create: string;
    cancel: string;
    noChapters: string;
    totalChapters: string;
    totalWords: string;
    edit: string;
    save: string;
    globalOutline: string;
    noOutline: string;
    createOutline: string;
    title: string;
    summary: string;
    characters: string;
    plot: string;
    worldSetting: string;
  };
  // Editor
  editor: {
    tabToAccept: string;
    autoSaveEnabled: string;
    ready: string;
  };
  // Common
  common: {
    loading: string;
    error: string;
    success: string;
    warning: string;
    settings: string;
  };
}

const translations: Record<Language, Translations> = {
  'zh-CN': {
    config: {
      title: '设置',
      aiSettings: 'AI 设置',
      editor: '编辑器',
      workspace: '工作区',
      enableAI: '启用 AI',
      enableAIDesc: '启用或禁用 AI 续写功能',
      apiBaseUrl: 'API 基础 URL',
      apiKey: 'API 密钥',
      apiKeyRequired: '必填项',
      apiKeyDesc: '支持兼容 OpenAI API 格式的服务（如智谱AI、DeepSeek 等）',
      aiDelay: 'AI 触发延迟',
      fontSize: '字体大小',
      lineHeight: '行高',
      autoSaveInterval: '自动保存间隔',
      theme: '主题',
      language: '语言',
      dark: '深色',
      light: '浅色',
      save: '保存',
      saving: '保存中...',
      reset: '重置',
      resetConfirm: '确定要重置所有配置到默认值吗？',
      unsavedChanges: '有未保存的更改',
      unsavedChangesWarning: '有未保存的更改，确定要关闭吗？',
      closeWarning: '关闭',
    },
    sidebar: {
      openFolder: '打开小说文件夹',
      chapterList: '章节列表',
      outline: '大纲讨论',
      newChapter: '新建章节',
      newChapterPlaceholder: '输入章节标题...',
      create: '创建',
      cancel: '取消',
      noChapters: '暂无章节',
      totalChapters: '总章节数',
      totalWords: '总字数',
      edit: '编辑',
      save: '保存',
      globalOutline: '全局大纲',
      noOutline: '尚未创建大纲',
      createOutline: '创建大纲',
      title: '标题',
      summary: '简介',
      characters: '人物',
      plot: '情节',
      worldSetting: '世界观',
    },
    editor: {
      tabToAccept: '按 Tab 接受 AI 建议',
      autoSaveEnabled: '自动保存已启用',
      ready: '就绪',
    },
    common: {
      loading: '加载中...',
      error: '错误',
      success: '成功',
      warning: '警告',
      settings: '设置',
    },
  },
  'en-US': {
    config: {
      title: 'Settings',
      aiSettings: 'AI Settings',
      editor: 'Editor',
      workspace: 'Workspace',
      enableAI: 'Enable AI',
      enableAIDesc: 'Enable or disable AI writing assistance',
      apiBaseUrl: 'API Base URL',
      apiKey: 'API Key',
      apiKeyRequired: 'Required',
      apiKeyDesc: 'Supports OpenAI-compatible API services (e.g. Zhipu AI, DeepSeek, etc.)',
      aiDelay: 'AI Trigger Delay',
      fontSize: 'Font Size',
      lineHeight: 'Line Height',
      autoSaveInterval: 'Auto-save Interval',
      theme: 'Theme',
      language: 'Language',
      dark: 'Dark',
      light: 'Light',
      save: 'Save',
      saving: 'Saving...',
      reset: 'Reset',
      resetConfirm: 'Are you sure you want to reset all settings to defaults?',
      unsavedChanges: 'Unsaved Changes',
      unsavedChangesWarning: 'You have unsaved changes. Are you sure you want to close?',
      closeWarning: 'Close',
    },
    sidebar: {
      openFolder: 'Open Novel Folder',
      chapterList: 'Chapter List',
      outline: 'Outline',
      newChapter: 'New Chapter',
      newChapterPlaceholder: 'Enter chapter title...',
      create: 'Create',
      cancel: 'Cancel',
      noChapters: 'No chapters yet',
      totalChapters: 'Total Chapters',
      totalWords: 'Total Words',
      edit: 'Edit',
      save: 'Save',
      globalOutline: 'Global Outline',
      noOutline: 'No outline created yet',
      createOutline: 'Create Outline',
      title: 'Title',
      summary: 'Summary',
      characters: 'Characters',
      plot: 'Plot',
      worldSetting: 'World Setting',
    },
    editor: {
      tabToAccept: 'Press Tab to accept AI suggestions',
      autoSaveEnabled: 'Auto-save enabled',
      ready: 'Ready',
    },
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      settings: 'Settings',
    },
  },
};

export const t = (lang: Language): Translations => {
  return translations[lang as Language] || translations['zh-CN'];
};

export const useTranslation = (lang?: Language) => {
  const configStore = useConfigStore.getState();
  const currentLang = lang || configStore.language as Language;
  return {
    t: translations[currentLang] || translations['zh-CN'],
    lang: currentLang,
  };
};

// Helper to get translations in components
import { useConfigStore } from '../store/configStore';
