import React, { useState } from 'react';
import { useConfigStore } from '../../store/configStore';

interface ResizableSidebarProps {
  children: React.ReactNode;
  side: 'left' | 'right';
  className?: string;
}

export const ResizableSidebar: React.FC<ResizableSidebarProps> = ({
  children,
  side,
  className = '',
}) => {
  const {
    sidebarCollapsed,
    rightPanelCollapsed,
    setSidebarCollapsed,
    setRightPanelCollapsed,
  } = useConfigStore();

  const [isHovering, setIsHovering] = useState(false);

  const isLeft = side === 'left';
  const collapsed = isLeft ? sidebarCollapsed : rightPanelCollapsed;
  const setCollapsed = isLeft ? setSidebarCollapsed : setRightPanelCollapsed;

  // 切换收起/展开
  const handleToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    // 自动保存配置
    setTimeout(() => {
      useConfigStore.getState().saveConfig();
    }, 100);
  };

  // 收起时：只显示展开按钮，鼠标悬停在边界时显示
  if (collapsed) {
    return (
      <div
        className={`relative transition-all duration-200 ${className}`}
        style={{ width: '0px' }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* 展开按钮 - 鼠标悬停在边界时显示 */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 transition-all duration-200 ${
            isLeft
              ? 'right-0 translate-x-full'
              : 'left-0 -translate-x-full'
          } w-8 h-8 dark:bg-gray-700 bg-gray-300 dark:hover:bg-gray-600 hover:bg-gray-400 rounded flex items-center justify-center cursor-pointer z-[9999] shadow-lg ${
            isHovering ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={handleToggle}
          title="展开"
        >
          <svg
            className="w-4 h-4 dark:text-gray-400 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isLeft ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-shrink-0 relative transition-all duration-200 ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {children}

      {/* 收起按钮 - 鼠标悬停时显示 */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 transition-all duration-200 z-[9999] ${
          isHovering
            ? isLeft
              ? 'right-0 translate-x-full'
              : 'left-0 -translate-x-full'
            : isLeft
              ? 'right-0 opacity-0'
              : 'left-0 opacity-0'
        } w-8 h-8 dark:bg-gray-700 bg-gray-300 dark:hover:bg-gray-600 hover:bg-gray-400 rounded flex items-center justify-center cursor-pointer shadow-lg`}
        onClick={handleToggle}
        title="收起"
      >
        <svg
          className="w-4 h-4 dark:text-gray-400 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isLeft ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          )}
        </svg>
      </div>
    </div>
  );
};
