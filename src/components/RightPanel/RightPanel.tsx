import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { EnhancedOutlinePanel } from './EnhancedOutlinePanel';
import { AIBrainstorm } from './AIBrainstorm';
import { useTranslation } from '../../i18n';

type RightTab = 'outline' | 'brainstorm';

export const RightPanel: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RightTab>('outline');

  return (
    <div className="w-96 dark:bg-gray-900 bg-transparent dark:border-l border-l dark:border-gray-700 border-gray-200 flex flex-col h-full">
      {/* Toggle Buttons */}
      <div className="flex dark:border-b border-b dark:border-gray-700 border-gray-200">
        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'outline'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'dark:text-gray-400 text-gray-600 dark:hover:text-gray-300 hover:text-gray-900'
          }`}
        >
          {t.rightPanel.enhancedOutline}
        </button>
        <button
          onClick={() => setActiveTab('brainstorm')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'brainstorm'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'dark:text-gray-400 text-gray-600 dark:hover:text-gray-300 hover:text-gray-900'
          }`}
        >
          {t.rightPanel.aiBrainstorm}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'outline' ? (
            <EnhancedOutlinePanel key="outline" />
          ) : (
            <AIBrainstorm key="brainstorm" />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
