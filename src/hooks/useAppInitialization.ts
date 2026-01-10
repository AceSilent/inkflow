import { useEffect, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * 应用初始化 Hook
 * - 加载配置
 * - 如果是首次运行（没有工作区），自动弹出目录选择对话框
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
      // 获取当前状态（使用 snapshot 避免 hook 依赖）
      const configStore = useConfigStore.getState();
      const workspaceStore = useWorkspaceStore.getState();

      // 加载配置
      await configStore.loadConfig();

      // 再次检查配置是否已加载工作区
      const configWorkspaceRoot = configStore.workspaceRoot;
      const storeWorkspaceRoot = workspaceStore.workspaceRoot;

      const hasWorkspaceRoot = storeWorkspaceRoot || configWorkspaceRoot;

      if (!hasWorkspaceRoot) {
        // 首次运行，延迟一小段时间后自动弹出目录选择
        // 给用户一些时间看到应用界面
        dialogTimeoutRef.current = setTimeout(() => {
          workspaceStore.openWorkspaceRoot();
        }, 500);
      } else if (storeWorkspaceRoot && !configWorkspaceRoot) {
        // 如果 store 有但 config 没有（状态不同步），同步配置并扫描
        await workspaceStore.scanWorkspace();
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
