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
    workspaceRoot: string;
    currentWorkspace: string;
    selectWorkspace: string;
    changeWorkspace: string;
    workspaceDesc: string;
    workspaceUsage: string;
    aiSuggestion: string;
    workspaceSettings: string;
    currentWorkspaceRoot: string;
    workspaceNotSet: string;
    selectWorkspaceRoot: string;
    workspaceRootInfo: string;
    workspaceSet: string;
    workspaceSetDesc: string;
    workspaceInstructions: string;
    workspaceInstruction1: string;
    workspaceInstruction2: string;
    workspaceInstruction3: string;
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
    saving: string;
    globalOutline: string;
    noOutline: string;
    createOutline: string;
    title: string;
    summary: string;
    characters: string;
    plot: string;
    worldSetting: string;
    noWorkspace: string;
    noWorkspaceDesc: string;
    selectNovel: string;
    novelProjects: string;
    createFirstNovel: string;
    noNovelsInWorkspace: string;
    backToProjects: string;
    openWorkspace: string;
    changeWorkspaceRoot: string;
    aiContinuation: string;
    enableAIContinuation: string;
    disableAIContinuation: string;
    loading: string;
    outlineTitlePlaceholder: string;
    outlineSummaryPlaceholder: string;
    outlineCharacterPlaceholder: string;
    outlinePlotPlaceholder: string;
    outlineWorldPlaceholder: string;
    outlineTemplateTitle: string;
    outlineTemplateContent: string;
    outlinePlaceholder: string;
    outlineHelp: string;
    undefinedRole: string;
  };
  // Editor
  editor: {
    tabToAccept: string;
    autoSaveEnabled: string;
    ready: string;
    noChapterLoaded: string;
    untitledChapter: string;
    aiPoweredEditor: string;
    emptyStateTitle: string;
    emptyStateDesc: string;
    hintOpenWorkspace: string;
    hintOpenWorkspaceDesc: string;
    hintCreateNovel: string;
    hintCreateNovelDesc: string;
    hintStartWriting: string;
    hintStartWritingDesc: string;
    loadingEditor: string;
  };
  // App
  app: {
    title: string;
    subtitle: string;
  };
  // Common
  common: {
    loading: string;
    error: string;
    success: string;
    warning: string;
    settings: string;
    confirm: string;
    delete: string;
    rename: string;
    close: string;
    save: string;
    cancel: string;
    create: string;
    edit: string;
    new: string;
  };
  // Create Novel
  createNovel: {
    title: string;
    novelName: string;
    novelNamePlaceholder: string;
    author: string;
    authorPlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    create: string;
    creating: string;
    cancel: string;
    success: string;
    error: string;
    novelNameRequired: string;
    workspaceDir: string;
    workspaceDesc: string;
  };
  // Feedback Panel
  feedback: {
    title: string;
    placeholder: string;
    regenerate: string;
    accept: string;
    dismiss: string;
    expand: string;
    collapse: string;
    feedbackHint: string;
    feedbackExamples: string;
    example1: string;
    example2: string;
    example3: string;
    example4: string;
    quickFeedback: string;
    orCustomFeedback: string;
    acceptSuggestion: string;
    dismissSuggestion: string;
    customize: string;
    pressToCustomize: string;
    collapseEsc: string;
    enterToSubmit: string;
  };
  // Toast
  toast: {
    saved: string;
    error: string;
    loading: string;
    success: string;
  };
  // Right Panel
  rightPanel: {
    aiBrainstorm: string;
    enhancedOutline: string;
    thinking: string;
    generating: string;
    placeholder: string;
    send: string;
    clear: string;
    regenerate: string;
    chapterSummary: string;
    currentChapter: string;
    noChapterSelected: string;
    autoGenerateSummary: string;
    selectChapterFirst: string;
    configureApiKeyFirst: string;
    generateFailed: string;
    summaryGenerated: string;
    keywords: string;
    // AI Brainstorm
    aiDiscussion: string;
    locked: string;
    unlocked: string;
    sync: string;
    syncToOutline: string;
    clearDiscussion: string;
    confirmClear: string;
    basedOn: string;
    startDiscussion: string;
    discussionPlaceholder: string;
    inputPlaceholder: string;
    discussionHint: string;
    contextLockedTitle: string;
    contextUnlockedTitle: string;
    syncButtonTitle: string;
    clearButtonTitle: string;
    createOutlineFirst: string;
    noContentToSync: string;
    syncedPoints: string;
    syncFailed: string;
    aiUnavailable: string;
    configureApiKeyFirstError: string;
    askingMe: string;
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
      resetConfirm: '确定要重置所有配置到默认值吗？（API Key 将被保留）',
      unsavedChanges: '有未保存的更改',
      unsavedChangesWarning: '有未保存的更改，确定要关闭吗？',
      closeWarning: '关闭',
      workspaceRoot: '当前工作区根目录',
      currentWorkspace: '未设置工作区',
      selectWorkspace: '选择',
      changeWorkspace: '更换',
      workspaceDesc: '设置工作区根目录，统一管理多个小说项目',
      workspaceUsage: '工作区用于管理多个小说项目',
      aiSuggestion: 'AI 续写',
      workspaceSettings: '工作区设置',
      currentWorkspaceRoot: '当前工作区根目录',
      workspaceNotSet: '未设置工作区',
      selectWorkspaceRoot: '选择工作区根目录',
      workspaceRootInfo: '工作区根目录是包含所有小说项目的父文件夹',
      workspaceSet: '工作区已设置',
      workspaceSetDesc: '点击"选择"按钮可更换其他工作区',
      workspaceInstructions: '工作区说明',
      workspaceInstruction1: '• 工作区是一个包含多个小说项目的根文件夹',
      workspaceInstruction2: '• 每个子文件夹代表一个独立的小说项目',
      workspaceInstruction3: '• 示例：D:\\MyNovels\\小说1、D:\\MyNovels\\小说2',
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
      saving: '保存中...',
      globalOutline: '全局大纲',
      noOutline: '尚未创建大纲',
      createOutline: '创建大纲',
      title: '标题',
      summary: '简介',
      characters: '人物',
      plot: '情节',
      worldSetting: '世界观',
      noWorkspace: '未打开工作空间',
      noWorkspaceDesc: '点击上方文件夹图标打开工作空间',
      selectNovel: '选择小说项目',
      novelProjects: '小说项目',
      createFirstNovel: '创建第一个小说',
      noNovelsInWorkspace: '工作空间中暂无小说项目',
      backToProjects: '返回项目列表',
      openWorkspace: '打开工作空间',
      changeWorkspaceRoot: '更换工作空间',
      aiContinuation: 'AI 续写',
      enableAIContinuation: '开启 AI 续写',
      disableAIContinuation: '关闭 AI 续写',
      loading: '加载中...',
      outlineTitlePlaceholder: '新小说标题',
      outlineSummaryPlaceholder: '小说简介...',
      outlineCharacterPlaceholder: '主角 - 人物描述...',
      outlinePlotPlaceholder: '- 情节1\n- 情节2',
      outlineWorldPlaceholder: '世界观描述...',
      outlineTemplateTitle: '# 尚未创建大纲\n\n点击下方按钮创建大纲...',
      outlineTemplateContent: '# 标题\n新小说标题\n\n# 简介\n小说简介...\n\n# 人物\n主角 - 人物描述...\n\n# 情节\n- 情节1\n- 情节2\n\n# 世界观\n世界观描述...',
      outlinePlaceholder: '输入大纲内容（Markdown格式）',
      outlineHelp: '使用 Markdown 格式，以 # 开头表示章节标题',
      undefinedRole: '未定义',
    },
    editor: {
      tabToAccept: '接受 AI 建议',
      autoSaveEnabled: '自动保存已启用',
      ready: '就绪',
      noChapterLoaded: '未打开章节',
      untitledChapter: '未命名章节',
      aiPoweredEditor: 'AI 驱动的小说编辑器',
      emptyStateTitle: '开始创作您的小说',
      emptyStateDesc: '打开左侧边栏，选择或创建一个小说项目开始写作',
      hintOpenWorkspace: '打开工作空间',
      hintOpenWorkspaceDesc: '点击左上角文件夹图标选择工作区',
      hintCreateNovel: '创建新小说',
      hintCreateNovelDesc: '在项目列表中点击"+ 新建"按钮',
      hintStartWriting: '开始写作',
      hintStartWritingDesc: '选择章节后在编辑器中开始创作',
      loadingEditor: '加载编辑器...',
    },
    app: {
      title: '墨流',
      subtitle: 'AI 驱动的小说创作软件',
    },
    common: {
      loading: '加载中...',
      error: '错误',
      success: '成功',
      warning: '警告',
      settings: '设置',
      confirm: '确定',
      delete: '删除',
      rename: '重命名',
      close: '关闭',
      save: '保存',
      cancel: '取消',
      create: '创建',
      edit: '编辑',
      new: '新建',
    },
    createNovel: {
      title: '创建新小说',
      novelName: '小说名称',
      novelNamePlaceholder: '请输入小说名称',
      author: '作者',
      authorPlaceholder: '请输入作者名称',
      description: '简介',
      descriptionPlaceholder: '请输入小说简介...',
      create: '创建',
      creating: '创建中...',
      cancel: '取消',
      success: '小说创建成功',
      error: '创建失败',
      novelNameRequired: '请输入小说名称',
      workspaceDir: '工作目录',
      workspaceDesc: '将在工作目录下创建同名文件夹，并初始化大纲和第一章。',
    },
    feedback: {
      title: '提供反馈以优化建议',
      placeholder: '描述您希望如何改进建议（可选）...',
      regenerate: '重新生成',
      accept: '接受',
      dismiss: '关闭',
      expand: '展开',
      collapse: '收起',
      feedbackHint: '提供反馈可以帮助AI更好地理解您的需求',
      feedbackExamples: '示例反馈：',
      example1: '更简洁一些',
      example2: '增加更多细节描写',
      example3: '调整语气，更轻松一些',
      example4: '改变对话风格',
      quickFeedback: '快速反馈：',
      orCustomFeedback: '或自定义反馈：',
      acceptSuggestion: '采纳',
      dismissSuggestion: '取消',
      customize: '调教',
      pressToCustomize: '按 Ctrl+K 自定义',
      collapseEsc: '按 Esc 收起',
      enterToSubmit: '按 Enter 提交反馈',
    },
    toast: {
      saved: '已保存',
      error: '保存失败',
      loading: '加载中...',
      success: '操作成功',
    },
    rightPanel: {
      aiBrainstorm: 'AI 讨论',
      enhancedOutline: '大纲管理',
      thinking: 'AI 思考中...',
      generating: '生成中...',
      placeholder: '输入您的想法，让 AI 帮助您头脑风暴...',
      send: '发送',
      clear: '清空',
      regenerate: '重新生成',
      chapterSummary: '章节总结',
      currentChapter: '当前章节',
      noChapterSelected: '未选择章节',
      autoGenerateSummary: '自动生成总结',
      selectChapterFirst: '请先选择章节并确保有内容',
      configureApiKeyFirst: '请先在设置中配置 API Key',
      generateFailed: '生成总结失败，请检查API配置',
      summaryGenerated: '总结已生成并保存！',
      keywords: '关键词：',
      // AI Brainstorm
      aiDiscussion: 'AI 创作讨论',
      locked: '已锁定',
      unlocked: '未锁定',
      sync: '同步',
      syncToOutline: '将讨论要点同步到大纲',
      clearDiscussion: '清空讨论',
      confirmClear: '确定清空讨论记录吗？',
      basedOn: '基于《',
      startDiscussion: '开始与AI讨论情节和人物',
      discussionPlaceholder: 'Ask me anything about your story...',
      inputPlaceholder: '输入你的想法... (Enter发送，Shift+Enter换行)',
      discussionHint: '提示：讨论情节发展、人物设定、冲突设计等，AI会基于当前大纲给出建议',
      contextLockedTitle: '上下文已锁定：讨论将基于当前大纲',
      contextUnlockedTitle: '上下文未锁定：自由讨论模式',
      syncButtonTitle: '将讨论要点同步到大纲',
      clearButtonTitle: '清空讨论',
      createOutlineFirst: '请先创建大纲',
      noContentToSync: '暂无讨论内容可同步',
      syncedPoints: '已将',
      syncFailed: '同步失败，请重试',
      aiUnavailable: '抱歉，AI服务暂时不可用。请检查API配置。',
      configureApiKeyFirstError: '请先在设置中配置 API Key',
      askingMe: 'Ask me anything about your story...',
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
      resetConfirm: 'Reset all settings to defaults? (API Key will be preserved)',
      unsavedChanges: 'Unsaved Changes',
      unsavedChangesWarning: 'You have unsaved changes. Are you sure you want to close?',
      closeWarning: 'Close',
      workspaceRoot: 'Current Workspace Root',
      currentWorkspace: 'No workspace set',
      selectWorkspace: 'Select',
      changeWorkspace: 'Change',
      workspaceDesc: 'Set workspace root directory to manage multiple novel projects',
      workspaceUsage: 'Workspace manages multiple novel projects',
      aiSuggestion: 'AI Suggestion',
      workspaceSettings: 'Workspace Settings',
      currentWorkspaceRoot: 'Current workspace root directory',
      workspaceNotSet: 'No workspace set',
      selectWorkspaceRoot: 'Select workspace root directory',
      workspaceRootInfo: 'Workspace root is the parent folder containing all novel projects',
      workspaceSet: 'Workspace configured',
      workspaceSetDesc: 'Click "Select" button to change to another workspace',
      workspaceInstructions: 'Workspace Instructions',
      workspaceInstruction1: '• Workspace is a root folder containing multiple novel projects',
      workspaceInstruction2: '• Each subfolder represents an independent novel project',
      workspaceInstruction3: '• Example: D:\\MyNovels\\Novel1, D:\\MyNovels\\Novel2',
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
      saving: 'Saving...',
      globalOutline: 'Global Outline',
      noOutline: 'No outline created yet',
      createOutline: 'Create Outline',
      title: 'Title',
      summary: 'Summary',
      characters: 'Characters',
      plot: 'Plot',
      worldSetting: 'World Setting',
      noWorkspace: 'No workspace opened',
      noWorkspaceDesc: 'Click the folder icon above to open a workspace',
      selectNovel: 'Select Novel Project',
      novelProjects: 'Novel Projects',
      createFirstNovel: 'Create First Novel',
      noNovelsInWorkspace: 'No novel projects in workspace',
      backToProjects: 'Back to Projects',
      openWorkspace: 'Open Workspace',
      changeWorkspaceRoot: 'Change Workspace',
      aiContinuation: 'AI Continuation',
      enableAIContinuation: 'Enable AI Continuation',
      disableAIContinuation: 'Disable AI Continuation',
      loading: 'Loading...',
      outlineTitlePlaceholder: 'New Novel Title',
      outlineSummaryPlaceholder: 'Novel summary...',
      outlineCharacterPlaceholder: 'Protagonist - Character description...',
      outlinePlotPlaceholder: '- Plot point 1\n- Plot point 2',
      outlineWorldPlaceholder: 'World setting description...',
      outlineTemplateTitle: '# No outline created yet\n\nClick button below to create outline...',
      outlineTemplateContent: '# Title\nNew novel title\n\n# Summary\nNovel summary...\n\n# Characters\nProtagonist - Character description...\n\n# Plot\n- Plot point 1\n- Plot point 2\n\n# World Setting\nWorld setting description...',
      outlinePlaceholder: 'Enter outline content (Markdown format)',
      outlineHelp: 'Use Markdown format, # indicates section title',
      undefinedRole: 'Undefined',
    },
    editor: {
      tabToAccept: 'to accept AI suggestions',
      autoSaveEnabled: 'Auto-save enabled',
      ready: 'Ready',
      noChapterLoaded: 'No chapter loaded',
      untitledChapter: 'Untitled Chapter',
      aiPoweredEditor: 'AI-Powered Novel Editor',
      emptyStateTitle: 'Start Writing Your Novel',
      emptyStateDesc: 'Open the left sidebar to select or create a novel project',
      hintOpenWorkspace: 'Open Workspace',
      hintOpenWorkspaceDesc: 'Click the folder icon in the top left to select workspace',
      hintCreateNovel: 'Create New Novel',
      hintCreateNovelDesc: 'Click "+ New" button in the project list',
      hintStartWriting: 'Start Writing',
      hintStartWritingDesc: 'Select a chapter and start creating in the editor',
      loadingEditor: 'Loading editor...',
    },
    app: {
      title: 'InkFlow',
      subtitle: 'AI-Powered Novel Editor',
    },
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      settings: 'Settings',
      confirm: 'Confirm',
      delete: 'Delete',
      rename: 'Rename',
      close: 'Close',
      save: 'Save',
      cancel: 'Cancel',
      create: 'Create',
      edit: 'Edit',
      new: 'New',
    },
    createNovel: {
      title: 'Create New Novel',
      novelName: 'Novel Name',
      novelNamePlaceholder: 'Enter novel name',
      author: 'Author',
      authorPlaceholder: 'Enter author name',
      description: 'Description',
      descriptionPlaceholder: 'Enter novel description...',
      create: 'Create',
      creating: 'Creating...',
      cancel: 'Cancel',
      success: 'Novel created successfully',
      error: 'Creation failed',
      novelNameRequired: 'Please enter novel name',
      workspaceDir: 'Workspace Directory',
      workspaceDesc: 'Will create a folder with the same name and initialize outline and first chapter.',
    },
    feedback: {
      title: 'Provide feedback to improve suggestions',
      placeholder: 'Describe how you want the suggestion improved (optional)...',
      regenerate: 'Regenerate',
      accept: 'Accept',
      dismiss: 'Dismiss',
      expand: 'Expand',
      collapse: 'Collapse',
      feedbackHint: 'Feedback helps AI better understand your needs',
      feedbackExamples: 'Example feedback:',
      example1: 'Make it more concise',
      example2: 'Add more descriptive details',
      example3: 'Adjust tone, be more casual',
      example4: 'Change dialogue style',
      quickFeedback: 'Quick feedback:',
      orCustomFeedback: 'Or custom feedback:',
      acceptSuggestion: 'Accept',
      dismissSuggestion: 'Dismiss',
      customize: 'Customize',
      pressToCustomize: 'Press Ctrl+K to customize',
      collapseEsc: 'Press Esc to collapse',
      enterToSubmit: 'Press Enter to submit',
    },
    toast: {
      saved: 'Saved',
      error: 'Save failed',
      loading: 'Loading...',
      success: 'Success',
    },
    rightPanel: {
      aiBrainstorm: 'AI Discussion',
      enhancedOutline: 'Outline Management',
      thinking: 'AI is thinking...',
      generating: 'Generating...',
      placeholder: 'Enter your ideas and let AI help you brainstorm...',
      send: 'Send',
      clear: 'Clear',
      regenerate: 'Regenerate',
      chapterSummary: 'Chapter Summary',
      currentChapter: 'Current chapter',
      noChapterSelected: 'No chapter selected',
      autoGenerateSummary: 'Auto-generate Summary',
      selectChapterFirst: 'Please select a chapter and ensure it has content',
      configureApiKeyFirst: 'Please configure API Key in settings first',
      generateFailed: 'Failed to generate summary, please check API configuration',
      summaryGenerated: 'Summary generated and saved!',
      keywords: 'Keywords:',
      // AI Brainstorm
      aiDiscussion: 'AI Writing Discussion',
      locked: 'Locked',
      unlocked: 'Unlocked',
      sync: 'Sync',
      syncToOutline: 'Sync discussion points to outline',
      clearDiscussion: 'Clear discussion',
      confirmClear: 'Are you sure you want to clear the discussion history?',
      basedOn: 'Based on "',
      startDiscussion: 'Start discussing plot and characters with AI',
      discussionPlaceholder: 'Ask me anything about your story...',
      inputPlaceholder: 'Enter your thoughts... (Enter to send, Shift+Enter for new line)',
      discussionHint: 'Tip: Discuss plot development, character settings, conflict design, etc. AI will provide suggestions based on current outline',
      contextLockedTitle: 'Context locked: discussion will be based on current outline',
      contextUnlockedTitle: 'Context unlocked: free discussion mode',
      syncButtonTitle: 'Sync discussion points to outline',
      clearButtonTitle: 'Clear discussion',
      createOutlineFirst: 'Please create outline first',
      noContentToSync: 'No discussion content to sync',
      syncedPoints: 'Synced',
      syncFailed: 'Sync failed, please try again',
      aiUnavailable: 'Sorry, AI service is temporarily unavailable. Please check API configuration.',
      configureApiKeyFirstError: 'Please configure API Key in settings first',
      askingMe: 'Ask me anything about your story...',
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
