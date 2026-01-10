import React from 'react';
import { AIBrainstorm } from './AIBrainstorm';
import { useTranslation } from '../../i18n';

export const RightPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="w-96 dark:bg-gray-900 bg-transparent dark:border-l border-l dark:border-gray-700 border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex dark:border-b border-b dark:border-gray-700 border-gray-200">
        <div className="flex-1 px-4 py-3 text-sm font-medium text-blue-400 border-b-2 border-blue-400">
          {t.rightPanel.aiBrainstorm}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <AIBrainstorm />
      </div>
    </div>
  );
};
