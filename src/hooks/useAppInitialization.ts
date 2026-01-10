import { useEffect, useRef, useState } from 'react';
import { useConfigStore } from '../store/configStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { invoke } from '@tauri-apps/api/tauri';
import { normalizePath } from '../utils/path';

interface LastState {
  lastNovelPath?: string | null;
  lastChapterFile?: string | null;
  viewState?: string | null;
  lastSavedAt?: string;
}

/**
 * 应用初始化 Hook - Simplified Restoration Architecture
 *
 * 职责：
 * 1. 加载配置和 last_state
 * 2. 主动打开小说项目（如果需要）
 * 3. 设置 currentChapterPath 和 viewState 到 editorStore（不加载内容）
 *
 * 实际的内容加载和 ViewState 恢复由 MainEditor 在编辑器挂载后执行
 */
export const useAppInitialization = () => {
  const hasInitialized = useRef(false);
  const dialogTimeoutRef = useRef<number | null>(null);
  const [shouldOpenNovel, setShouldOpenNovel] = useState<string | null>(null);

  // ============================================================
  // STEP 1: Load config and last_state, setup restoration targets
  // ============================================================
  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    const initializeApp = async () => {
      const workspaceStore = useWorkspaceStore.getState();
      const editorStore = useEditorStore.getState();

      // 1. Load config
      await useConfigStore.getState().loadConfig();

      // 2. Get loaded config
      const configWorkspaceRoot = useConfigStore.getState().workspaceRoot;

      if (configWorkspaceRoot) {
        console.log('📂 恢复工作区:', configWorkspaceRoot);

        // Set workspaceRoot to store
        workspaceStore.setWorkspaceRoot(configWorkspaceRoot);

        // Scan workspace for novel projects
        await workspaceStore.scanWorkspace();

        // 3. Load last_state and setup restoration targets
        try {
          const lastState = await invoke<LastState>('load_last_state');

          if (lastState.lastNovelPath && lastState.lastChapterFile) {
            console.log('📖 找到上次编辑状态');

            const normalizedNovelPath = normalizePath(lastState.lastNovelPath);
            const normalizedChapterFile = normalizePath(lastState.lastChapterFile);

            // CRITICAL: Build full path by joining novel path and chapter file
            // lastChapterFile might be just "outline.md" or a full path
            const targetPath = normalizedChapterFile.startsWith(normalizedNovelPath)
              ? normalizedChapterFile
              : `${normalizedNovelPath}/${normalizedChapterFile.replace(/^\/+/, '')}`;

            // CRITICAL: Load content immediately, don't wait for editor mount
            // MainEditor will sync this content to Monaco when it mounts
            console.log('📥 加载目标文件内容:', targetPath);
            await editorStore.loadChapterContent(targetPath);

            // Set viewState for restoration after editor mounts
            if (lastState.viewState) {
              try {
                const viewStateObj = JSON.parse(lastState.viewState);
                editorStore.setViewState(viewStateObj);
                console.log('📍 ViewState 已存储，等待编辑器挂载');
              } catch (error) {
                console.warn('⚠️ 解析 ViewState 失败:', error);
              }
            }

            console.log('🎯 恢复目标已设定:', {
              novelPath: normalizedNovelPath,
              chapterFile: normalizedChapterFile,
              fullPath: targetPath,
            });

            // CRITICAL: ACTIVELY open novel if not already open
            const currentRootPath = workspaceStore.rootPath
              ? normalizePath(workspaceStore.rootPath)
              : null;

            if (currentRootPath !== normalizedNovelPath) {
              console.log('🚀 主动打开目标小说项目:', normalizedNovelPath);
              setShouldOpenNovel(normalizedNovelPath);
            } else {
              console.log('✅ 目标小说项目已打开');
            }
          }
        } catch (error) {
          console.warn('⚠️ 无法加载上次状态:', error);
        }
      } else {
        // First run - show directory selection dialog
        dialogTimeoutRef.current = setTimeout(() => {
          console.log('🔍 首次运行，引导用户选择工作区');
          workspaceStore.openWorkspaceRoot();
        }, 500);
      }
    };

    initializeApp();

    return () => {
      if (dialogTimeoutRef.current) {
        clearTimeout(dialogTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================
  // STEP 2: ACTIVELY open novel project
  // ============================================================
  useEffect(() => {
    if (!shouldOpenNovel) {
      return;
    }

    const workspaceStore = useWorkspaceStore.getState();

    console.log('🔧 执行主动打开小说项目...');
    workspaceStore.openNovelProject(shouldOpenNovel, true)
      .then(() => {
        console.log('✅ 小说项目已打开');
        setShouldOpenNovel(null);
      })
      .catch((error) => {
        console.error('❌ 打开小说项目失败:', error);
        setShouldOpenNovel(null);
      });
  }, [shouldOpenNovel]);
};
