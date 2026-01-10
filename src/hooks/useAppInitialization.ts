import { useEffect, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * 应用初始化 Hook
 * - 加载配置
 * - 如果是首次运行（没有工作区），自动弹出目录选择对话框
 * - 如果有保存的工作区，自动恢复
 */
export const useAppInitialization = () => {
  const hasInitialized = useRef(false);
  const dialogTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 防止重复执行（包括 React Strict Mode 的双重挂载）
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    const initializeApp = async () => {
      const configStore = useConfigStore.getState();
      const workspaceStore = useWorkspaceStore.getState();

      // 1. 先加载配置（可能包含保存的 workspaceRoot）
      await configStore.loadConfig();

      // 2. 重新获取加载后的配置
      const configWorkspaceRoot = configStore.workspaceRoot;

      // 3. 检查是否有保存的工作区
      if (configWorkspaceRoot) {
        // 有保存的工作区，自动恢复
        console.log('📂 恢复工作区:', configWorkspaceRoot);

        // 设置 workspaceRoot 到 store
        workspaceStore.setWorkspaceRoot(configWorkspaceRoot);

        // 扫描工作区中的小说项目
        await workspaceStore.scanWorkspace();
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
    };
  }, []); // 空依赖数组，确保只在挂载时执行一次
};
