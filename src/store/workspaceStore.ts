import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import { useConfigStore } from './configStore';
import { useEditorStore } from './editorStore';

// Check if running in Tauri environment
const isTauriAvailable = () => {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
};

// ============== Type Definitions ==============

export interface ChapterInfo {
  filename: string;
  title: string;
  chapter_number: number;
  word_count: number;
  path: string;
  has_summary: boolean;
  modified_time?: string;
}

export interface NovelProjectInfo {
  name: string;
  path: string;
  chapters: ChapterInfo[];
  has_outline: boolean;
  has_inkflow_folder: boolean;
  total_word_count: number;
}

export interface Character {
  name: string;
  description: string;
  role: string;
}

export interface NovelOutline {
  title: string;
  summary: string;
  characters: Character[];
  plot_points: string[];
  world_setting?: string;
}

export interface ChapterSummary {
  chapter_path: string;
  summary: string;
  keywords: string[];
  generated_at: string;
}

export interface NovelInfo {
  name: string;
  path: string;
  chapter_count: number;
  total_word_count: number;
  has_outline: boolean;
}

export interface WorkspaceState {
  // 当前工作区状态
  rootPath: string | null;
  projectName: string;
  chapters: ChapterInfo[];
  globalOutline: NovelOutline | null;
  chapterSummaries: Map<string, ChapterSummary>; // key: chapter filename
  currentChapter: ChapterInfo | null;
  isLoading: boolean;
  error: string | null;

  // 工作空间管理
  workspaceRoot: string | null; // 工作空间根目录（包含多个小说的父目录）
  novels: NovelInfo[]; // 工作空间中的所有小说项目

  // UI 状态
  activeTab: 'chapters' | 'outline'; // 侧边栏切换卡
  outlinePanelExpanded: boolean;
}

export interface WorkspaceActions {
  // 工作区操作
  openWorkspace: () => Promise<void>;
  closeWorkspace: () => void;
  refreshChapterList: () => Promise<void>;

  // 工作空间管理
  openWorkspaceRoot: () => Promise<void>; // 打开工作空间根目录
  scanWorkspace: () => Promise<void>; // 扫描工作空间中的所有小说
  openNovelProject: (novelPath: string) => Promise<void>; // 打开指定的小说项目

  // 章节操作
  selectChapter: (chapter: ChapterInfo) => Promise<void>;
  createNewChapter: (title: string) => Promise<void>;

  // 大纲操作
  loadGlobalOutline: () => Promise<void>;
  updateGlobalOutline: (outline: NovelOutline) => Promise<void>;
  loadChapterSummaries: () => Promise<void>;
  openOutlineInEditor: () => Promise<void>; // 打开大纲文件到主编辑器

  // UI 操作
  setActiveTab: (tab: 'chapters' | 'outline') => void;
  setOutlinePanelExpanded: (expanded: boolean) => void;
  clearError: () => void;
  setWorkspaceRoot: (root: string | null) => void;

  // 辅助方法
  getLastTwoChapterSummaries: () => string[];
  getChapterContext: (chapterNumber: number) => Promise<string>;
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>((set, get) => ({
  // Initial state
  rootPath: null,
  projectName: '',
  chapters: [],
  globalOutline: null,
  chapterSummaries: new Map(),
  currentChapter: null,
  isLoading: false,
  error: null,
  workspaceRoot: null,
  novels: [],
  activeTab: 'chapters',
  outlinePanelExpanded: false,

  // 打开工作区（选择文件夹）
  openWorkspace: async () => {
    if (!isTauriAvailable()) {
      set({ error: '文件对话框仅支持桌面应用' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      // 使用 Tauri 的 dialog API 打开文件夹选择对话框
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择小说文件夹',
      });

      if (!selected) {
        set({ isLoading: false });
        return; // 用户取消选择
      }

      // selected 是 string | string[]，这里处理单个文件夹
      const folderPath = typeof selected === 'string' ? selected : selected[0];

      if (!folderPath) {
        set({ isLoading: false });
        return;
      }

      // 调用 Rust 后端扫描章节
      const projectInfo = await invoke<NovelProjectInfo>('list_chapters', {
        path: folderPath,
      });

      set({
        rootPath: folderPath,
        projectName: projectInfo.name,
        chapters: projectInfo.chapters,
        isLoading: false,
        error: null,
      });

      console.log('✅ 工作区已打开:', projectInfo.name);

      // 自动加载大纲
      if (projectInfo.has_outline) {
        get().loadGlobalOutline();
      }

      // 加载章节总结
      get().loadChapterSummaries();
    } catch (error) {
      console.error('❌ 打开工作区失败:', error);
      set({
        error: `打开工作区失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 关闭工作区
  closeWorkspace: () => {
    set({
      rootPath: null,
      projectName: '',
      chapters: [],
      globalOutline: null,
      chapterSummaries: new Map(),
      currentChapter: null,
      error: null,
    });
  },

  // 刷新章节列表
  refreshChapterList: async () => {
    const { rootPath } = get();
    if (!rootPath) return;

    set({ isLoading: true });

    try {
      const projectInfo = await invoke<NovelProjectInfo>('list_chapters', {
        path: rootPath,
      });

      set({
        chapters: projectInfo.chapters,
        isLoading: false,
      });
    } catch (error) {
      console.error('❌ 刷新章节列表失败:', error);
      set({
        error: `刷新失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 选择章节
  selectChapter: async (chapter: ChapterInfo) => {
    set({ currentChapter: chapter, isLoading: true });

    try {
      // 调用 editorStore 加载章节内容
      const { loadChapterContent } = useEditorStore.getState();
      await loadChapterContent(chapter.path);

      // 从 editorStore 获取内容并计算字数
      const content = useEditorStore.getState().content;
      const wordCount = content.replace(/\s/g, '').length;

      set({
        currentChapter: { ...chapter, word_count: wordCount },
        isLoading: false,
      });

      console.log('✅ 章节已加载:', chapter.title);
    } catch (error) {
      console.error('❌ 加载章节失败:', error);
      set({
        error: `加载章节失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 创建新章节
  createNewChapter: async (title: string) => {
    const { rootPath } = get();
    if (!rootPath) {
      set({ error: '请先打开一个小说工程' });
      return;
    }

    set({ isLoading: true });

    try {
      const newChapter = await invoke<ChapterInfo>('create_new_chapter', {
        novelPath: rootPath,
        title,
      });

      // 刷新章节列表
      await get().refreshChapterList();

      console.log('✅ 新章节已创建:', newChapter.title);
    } catch (error) {
      console.error('❌ 创建章节失败:', error);
      set({
        error: `创建章节失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 加载全局大纲
  loadGlobalOutline: async () => {
    const { rootPath } = get();
    if (!rootPath) return;

    try {
      const outline = await invoke<NovelOutline>('get_novel_outline', {
        path: rootPath,
      });

      set({ globalOutline: outline });
      console.log('✅ 全局大纲已加载');
    } catch (error) {
      console.error('❌ 加载大纲失败:', error);
    }
  },

  // 更新全局大纲
  updateGlobalOutline: async (outline: NovelOutline) => {
    const { rootPath } = get();
    if (!rootPath) return;

    try {
      // 生成大纲 Markdown 内容
      const outlineMd = generateOutlineMarkdown(outline);

      // 写入 outline.md
      await invoke('write_file', {
        path: `${rootPath}/outline.md`,
        content: outlineMd,
      });

      set({ globalOutline: outline });
      console.log('✅ 全局大纲已更新');
    } catch (error) {
      console.error('❌ 更新大纲失败:', error);
      set({ error: `更新大纲失败: ${error}` });
    }
  },

  // 加载所有章节总结
  loadChapterSummaries: async () => {
    const { rootPath, chapters } = get();
    if (!rootPath) return;

    try {
      const summaries: Map<string, ChapterSummary> = new Map();

      for (const chapter of chapters) {
        if (chapter.has_summary) {
          try {
            const summaryPath = `${rootPath}/.inkflow/summaries/${chapter.filename.replace(/\.(md|txt)$/i, '')}.json`;
            const summaryJson = await invoke<string>('read_file', {
              path: summaryPath,
            });

            const parsedSummary = JSON.parse(summaryJson) as ChapterSummary;
            summaries.set(chapter.filename, parsedSummary);
          } catch (error) {
            console.warn(`⚠️ 无法加载章节总结: ${chapter.filename}`, error);
          }
        }
      }

      set({ chapterSummaries: summaries });
      console.log(`✅ 已加载 ${summaries.size} 个章节总结`);
    } catch (error) {
      console.error('❌ 加载章节总结失败:', error);
    }
  },

  // 获取最后两章的总结
  getLastTwoChapterSummaries: () => {
    const { chapterSummaries, currentChapter, chapters } = get();

    if (!currentChapter) return [];

    // 找到当前章节的索引
    const currentIndex = chapters.findIndex(ch => ch.chapter_number === currentChapter.chapter_number);
    if (currentIndex === -1) return [];

    // 获取前两章
    const summaries: string[] = [];
    let count = 0;

    for (let i = currentIndex - 1; i >= 0 && count < 2; i--) {
      const chapter = chapters[i];
      const summary = chapterSummaries.get(chapter.filename);

      if (summary) {
        summaries.unshift(`【${chapter.title}】${summary.summary}`);
        count++;
      }
    }

    return summaries;
  },

  // 获取章节上下文（用于 AI 生成）
  getChapterContext: async (chapterNumber: number) => {
    const { chapters } = get();
    const chapter = chapters.find(ch => ch.chapter_number === chapterNumber);

    if (!chapter) return '';

    try {
      return await invoke<string>('read_file', {
        path: chapter.path,
      });
    } catch (error) {
      console.error('❌ 读取章节内容失败:', error);
      return '';
    }
  },

  // UI 操作
  setActiveTab: (tab: 'chapters' | 'outline') => {
    set({ activeTab: tab });
  },

  setOutlinePanelExpanded: (expanded: boolean) => {
    set({ outlinePanelExpanded: expanded });
  },

  clearError: () => {
    set({ error: null });
  },

  setWorkspaceRoot: (root: string | null) => {
    set({ workspaceRoot: root });
  },

  // 打开大纲文件到主编辑器
  openOutlineInEditor: async () => {
    const { rootPath } = get();
    if (!rootPath) {
      set({ error: '请先打开一个小说项目' });
      return;
    }

    try {
      // 调用 editorStore 加载大纲文件
      const { loadChapterContent } = useEditorStore.getState();
      const outlinePath = `${rootPath}/outline.md`;

      await loadChapterContent(outlinePath);

      // 设置当前打开的文件为大纲（用于特殊处理）
      set({
        currentChapter: {
          filename: 'outline.md',
          title: '全局大纲',
          chapter_number: 0,
          word_count: 0,
          path: outlinePath,
          has_summary: false,
        },
        isLoading: false,
      });

      console.log('✅ 大纲已在编辑器中打开');
    } catch (error) {
      console.error('❌ 打开大纲失败:', error);
      set({ error: `打开大纲失败: ${error}` });
    }
  },

  // 打开工作空间根目录
  openWorkspaceRoot: async () => {
    if (!isTauriAvailable()) {
      set({ error: '文件对话框仅支持桌面应用' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择工作空间根目录',
      });

      if (!selected) {
        set({ isLoading: false });
        return;
      }

      const rootPath = typeof selected === 'string' ? selected : selected[0];
      if (!rootPath) {
        set({ isLoading: false });
        return;
      }

      // 同时更新workspaceStore和configStore
      set({ workspaceRoot: rootPath, isLoading: false });

      // 更新configStore并保存
      const configStore = useConfigStore.getState();
      configStore.setWorkspaceRoot(rootPath);
      await configStore.saveConfig();

      // 自动扫描工作空间
      await get().scanWorkspace();

      console.log('✅ 工作空间根目录已打开:', rootPath);
    } catch (error) {
      console.error('❌ 打开工作空间失败:', error);
      set({
        error: `打开工作空间失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 扫描工作空间中的所有小说
  scanWorkspace: async () => {
    const { workspaceRoot } = get();
    if (!workspaceRoot) {
      set({ error: '请先打开工作空间根目录' });
      return;
    }

    set({ isLoading: true });

    try {
      const novels = await invoke<NovelInfo[]>('list_novels', {
        rootPath: workspaceRoot,
      });

      set({ novels, isLoading: false });
      console.log(`✅ 扫描完成：找到 ${novels.length} 个小说项目`);
    } catch (error) {
      console.error('❌ 扫描工作空间失败:', error);
      set({
        error: `扫描工作空间失败: ${error}`,
        isLoading: false,
      });
    }
  },

  // 打开指定的小说项目
  openNovelProject: async (novelPath: string) => {
    set({ isLoading: true, error: null });

    try {
      // 调用 Rust 后端扫描章节
      const projectInfo = await invoke<NovelProjectInfo>('list_chapters', {
        path: novelPath,
      });

      set({
        rootPath: novelPath,
        projectName: projectInfo.name,
        chapters: projectInfo.chapters,
        isLoading: false,
        error: null,
      });

      console.log('✅ 小说项目已打开:', projectInfo.name);

      // 自动加载大纲
      if (projectInfo.has_outline) {
        get().loadGlobalOutline();
      }

      // 加载章节总结
      get().loadChapterSummaries();
    } catch (error) {
      console.error('❌ 打开小说项目失败:', error);
      set({
        error: `打开小说项目失败: ${error}`,
        isLoading: false,
      });
    }
  },
}));

// ============== Helper Functions ==============

// 生成大纲 Markdown 内容
function generateOutlineMarkdown(outline: NovelOutline): string {
  const lines: string[] = [];

  lines.push('# 标题');
  lines.push(outline.title);
  lines.push('');

  lines.push('# 简介');
  lines.push(outline.summary);
  lines.push('');

  if (outline.characters.length > 0) {
    lines.push('# 人物');
    outline.characters.forEach(char => {
      lines.push(`${char.name} - ${char.description}`);
    });
    lines.push('');
  }

  if (outline.plot_points.length > 0) {
    lines.push('# 情节');
    outline.plot_points.forEach(point => {
      lines.push(`- ${point}`);
    });
    lines.push('');
  }

  if (outline.world_setting) {
    lines.push('# 世界观');
    lines.push(outline.world_setting);
    lines.push('');
  }

  return lines.join('\n');
}

// Selectors for easier access
export const useRootPath = () => useWorkspaceStore((state) => state.rootPath);
export const useChapters = () => useWorkspaceStore((state) => state.chapters);
export const useGlobalOutline = () => useWorkspaceStore((state) => state.globalOutline);
export const useCurrentChapter = () => useWorkspaceStore((state) => state.currentChapter);
