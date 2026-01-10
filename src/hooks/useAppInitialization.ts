import { useEffect } from 'react';
import { useConfigStore } from '../store/configStore';
import { useWorkspaceStore } from '../store/workspaceStore';

/**
 * 应用初始化 Hook
 * - 加载配置
 * - 如果是首次运行（没有工作区），自动弹出目录选择对话框
 */
export const useAppInitialization = () => {
  const { loadConfig, workspaceRoot: configWorkspaceRoot } = useConfigStore();
  const {
    workspaceRoot: storeWorkspaceRoot,
    openWorkspaceRoot,
    scanWorkspace,
  } = useWorkspaceStore();

  useEffect(() => {
    const initializeApp = async () => {
      // 加载配置
      await loadConfig();

      // 检查是否需要自动打开工作区选择对话框
      const hasWorkspaceRoot = storeWorkspaceRoot || configWorkspaceRoot;

      if (!hasWorkspaceRoot) {
        // 首次运行，延迟一小段时间后自动弹出目录选择
        // 给用户一些时间看到应用界面
        setTimeout(() => {
          openWorkspaceRoot();
        }, 500);
      } else if (storeWorkspaceRoot && !configWorkspaceRoot) {
        // 如果 store 有但 config 没有（状态不同步），同步配置并扫描
        await scanWorkspace();
      }
    };

    initializeApp();
  }, []);
};
