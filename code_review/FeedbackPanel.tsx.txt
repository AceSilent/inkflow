import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CursorContext } from '../../types';

interface FeedbackPanelProps {
  isVisible: boolean;
  position?: CursorContext;
  onFeedback: (feedback: string) => void;
  onAccept?: () => void;
  onDismiss?: () => void;
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  isVisible,
  position,
  onFeedback,
  onAccept,
  onDismiss,
}) => {
  const [feedback, setFeedback] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick feedback options
  const quickFeedbackOptions = [
    { label: 'Too formal', emoji: '👔', value: 'Please make this more casual' },
    { label: 'Too simple', emoji: '📚', value: 'Please add more descriptive details' },
    { label: 'Different style', emoji: '🎨', value: 'Please write in a different style' },
    { label: 'Shorter', emoji: '✂️', value: 'Please make this more concise' },
    { label: 'Longer', emoji: '📝', value: 'Please expand on this idea' },
  ];

  // Focus input when panel becomes visible
  useEffect(() => {
    if (isVisible && inputRef.current) {
      // Small delay to ensure the panel is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  // Clear feedback when panel is hidden
  useEffect(() => {
    if (!isVisible) {
      setFeedback('');
      setIsExpanded(false);
    }
  }, [isVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback.trim()) {
      onFeedback(feedback.trim());
      setFeedback('');
      setIsExpanded(false);
    }
  };

  const handleQuickFeedback = (value: string) => {
    onFeedback(value);
    setIsExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onDismiss?.();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Calculate position for the panel
  const calculatePanelPosition = () => {
    if (!position) return { top: 0, left: 0 };

    // In a real implementation, you'd calculate the actual pixel position
    // of the cursor in the editor viewport
    // For now, we'll use a fixed position relative to cursor
    const lineHeight = 24; // Approximate line height
    const top = (position.line - 1) * lineHeight + 10; // Position above cursor
    const left = Math.min(position.column * 8, window.innerWidth - 350); // Prevent overflow

    return { top, left };
  };

  const panelPosition = calculatePanelPosition();

  if (!isVisible || !position) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 10 }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 25,
          mass: 0.5
        }}
        className="fixed z-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm"
        style={{
          top: `${panelPosition.top}px`,
          left: `${panelPosition.left}px`,
        }}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              AI Suggestion
            </h3>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onAccept}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
              title="Accept suggestion (Tab)"
            >
              Accept (Tab)
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
              title="Dismiss (Escape)"
            >
              Dismiss (Esc)
            </button>
          </div>

          {/* Expandable Feedback Section */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  {/* Quick Feedback Options */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Quick feedback:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {quickFeedbackOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => handleQuickFeedback(option.value)}
                          className="flex items-center space-x-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-2 py-1.5 rounded transition-colors"
                          title={option.value}
                        >
                          <span>{option.emoji}</span>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Feedback Input */}
                  <form onSubmit={handleSubmit} className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block">
                      Or write your own feedback:
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g., Make this more emotional..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="submit"
                      disabled={!feedback.trim()}
                      className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                    >
                      Regenerate with feedback
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Keyboard Shortcuts Info */}
          {!isExpanded && (
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <div>Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Tab</kbd> to accept</div>
              <div>Press <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Esc</kbd> to dismiss</div>
              <div>Click above to provide feedback</div>
            </div>
          )}
        </div>

        {/* Arrow pointing to cursor */}
        <div
          className="absolute w-3 h-3 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700 transform rotate-45"
          style={{
            bottom: -6,
            left: '20px', // Adjust based on your needs
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
};

// Optional: Create a simplified tooltip version for when ghost text is visible but panel is not expanded
export const GhostTextTooltip: React.FC<{
  isVisible: boolean;
  position?: CursorContext;
}> = ({ isVisible, position }) => {
  if (!isVisible || !position) return null;

  const tooltipPosition = {
    top: (position.line - 1) * 24 + 35,
    left: Math.min(position.column * 8, window.innerWidth - 200),
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="fixed z-40 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none"
        style={tooltipPosition}
      >
        Press Tab to accept • Click to customize
        <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -bottom-1 left-4" />
      </motion.div>
    </AnimatePresence>
  );
};