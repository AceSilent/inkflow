import { useEffect, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEditorStore } from '../store/editorStore';
import { invoke } from '@tauri-apps/api/tauri';

interface LastState {
  lastNovelPath?: string | null;
  lastChapterFile?: string | null;
  scrollPosition?: number | null;
  cursorPosition?: [number, number] | null; // [line, column]
  lastSavedAt?: string;
}

/**
 * 应用初始化 Hook
 * - 加载配置
 * - 如果是首次运行（没有工作区），自动弹出目录选择对话框
 * - 如果有保存的工作区，自动恢复
 * - 恢复上次打开的章节和编辑器状态
 */
export const useAppInitialization = () => {
  const hasInitialized = useRef(false);
  const dialogTimeoutRef = useRef<number | null>(null);
  const restoreTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // 防止重复执行（包括 React Strict Mode 的双重挂载）
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    const initializeApp = async () => {
      const workspaceStore = useWorkspaceStore.getState();

      // 1. 先加载配置（可能包含保存的 workspaceRoot）
      await useConfigStore.getState().loadConfig();

      // 2. 重新获取加载后的配置（必须重新调用 getState）
      const configWorkspaceRoot = useConfigStore.getState().workspaceRoot;

      // 3. 检查是否有保存的工作区
      if (configWorkspaceRoot) {
        // 有保存的工作区，自动恢复
        console.log('📂 恢复工作区:', configWorkspaceRoot);

        // 设置 workspaceRoot 到 store
        workspaceStore.setWorkspaceRoot(configWorkspaceRoot);

        // 扫描工作区中的小说项目
        await workspaceStore.scanWorkspace();

        // 4. 尝试恢复上次的编辑状态
        try {
          const lastState = await invoke<LastState>('load_last_state');

          if (lastState.lastNovelPath && lastState.lastChapterFile) {
            console.log('📖 恢复上次编辑状态:', lastState);

            const editorStore = useEditorStore.getState();
            const chapterPath = `${lastState.lastNovelPath}/${lastState.lastChapterFile}`;

            // 延迟恢复，确保 Monaco editor 已经挂载
            restoreTimeoutRef.current = setTimeout(async () => {
              // 加载章节内容
              await editorStore.loadChapterContent(chapterPath);

              // TODO: 恢复滚动位置和光标位置（需要在 MainEditor 中实现）
              if (lastState.cursorPosition) {
                console.log('📍 恢复光标位置:', lastState.cursorPosition);
                // 需要在 MainEditor 中添加设置光标位置的方法
              }

              if (lastState.scrollPosition) {
                console.log('📜 恢复滚动位置:', lastState.scrollPosition);
                // 需要在 MainEditor 中添加设置滚动位置的方法
              }
            }, 1000); // 延迟 1 秒确保编辑器已挂载
          }
        } catch (error) {
          console.warn('⚠️ 无法加载上次状态:', error);
        }
      } else {
        // 首次运行，延迟一小段时间后自动弹出目录选择
        dialogTimeoutRef.current = setTimeout(() => {
          console.log('🔍 首次运行，引导用户选择工作区');
          workspaceStore.openWorkspaceRoot();
        }, 500);
      }
    };

    initializeApp();

    // 清理函数：清除定时器
    return () => {
      if (dialogTimeoutRef.current) {
        clearTimeout(dialogTimeoutRef.current);
      }
      if (restoreTimeoutRef.current) {
        clearTimeout(restoreTimeoutRef.current);
      }
    };
  }, []); // 空依赖数组，确保只在挂载时执行一次
};
