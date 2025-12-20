import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeedbackPanelProps {
  isVisible: boolean;
  position?: { top: number; left: number }; // Pixel coordinates for positioning
  isExpanded?: boolean; // Controls expanded state from parent
  onFeedback: (feedback: string) => void;
  onAccept?: () => void;
  onDismiss?: () => void;
  onCollapse?: () => void; // Callback for collapsing to capsule state
  onExpandRequest?: () => void; // Callback for Ctrl+K handling
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  isVisible,
  position,
  isExpanded = false,
  onFeedback,
  onAccept,
  onDismiss,
  onCollapse,
  onExpandRequest,
}) => {
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick feedback options - simplified for minimal design
  const quickFeedbackOptions = [
    { label: 'Formal', emoji: '👔', value: 'Please make this more casual' },
    { label: 'Simple', emoji: '📚', value: 'Please add more descriptive details' },
    { label: 'Style', emoji: '🎨', value: 'Please write in a different style' },
    { label: 'Short', emoji: '✂️', value: 'Please make this more concise' },
  ];

  // Focus input when expanded and auto-select text
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        // Auto-select all text if there's any content
        if (inputRef.current?.value) {
          inputRef.current?.select();
        }
      }, 100);
    }
  }, [isExpanded]);

  // Reset state when panel is hidden
  useEffect(() => {
    if (!isVisible) {
      setFeedback('');
    }
  }, [isVisible]);

  // Global keyboard event listener for Esc key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded && isVisible) {
        console.log('Global ESC handler triggered in FeedbackPanel, collapsing to capsule');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCollapse?.();
      }
    };

    if (isExpanded && isVisible) {
      document.addEventListener('keydown', handleGlobalKeyDown, true); // Use capture
      return () => {
        document.removeEventListener('keydown', handleGlobalKeyDown, true);
      };
    }
  }, [isExpanded, isVisible, onCollapse]);

  // Handle expand request from K key
  const handleExpandRequest = useCallback(() => {
    onExpandRequest?.();
  }, [onExpandRequest]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback.trim()) {
      onFeedback(feedback.trim());
      setFeedback('');
    }
  };

  const handleQuickFeedback = (value: string) => {
    onFeedback(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('ESC pressed in FeedbackPanel, collapsing to capsule');
      onCollapse?.();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit(e);
    }
  };

  // Handle collapse button click
  const handleCollapse = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    console.log('Close button clicked in FeedbackPanel, collapsing to capsule');
    onCollapse?.();
  };

  // Handle capsule click to expand
  const handleCapsuleClick = () => {
    onExpandRequest?.();
  };

  if (!isVisible || !position) return null;

  return (
    <AnimatePresence>
      {!isExpanded ? (
        /* Minimal Capsule State */
        <motion.div
          key="capsule"
          initial={{ opacity: 0, scale: 0.9, y: 5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 5 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
            mass: 0.5
          }}
          className="feedback-bubble feedback-capsule fixed z-[60] px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm rounded-full cursor-pointer"
          style={{
            top: `${position.top + 20}px`, // 20px below cursor line
            left: `${position.left}px`,
          }}
          onClick={handleCapsuleClick}
          title="Press Ctrl+K to customize"
        >
          <div className="flex items-center space-x-2 text-xs text-gray-300">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAccept?.();
              }}
              className="feedback-button hover:text-white transition-colors px-1 py-0.5"
              title="Accept suggestion (Tab)"
            >
              Tab 采纳
            </button>
            <span className="text-gray-500">·</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.();
              }}
              className="feedback-button hover:text-white transition-colors px-1 py-0.5"
              title="Dismiss (Escape)"
            >
              Esc 取消
            </button>
            <span className="text-gray-500">·</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExpandRequest();
              }}
              className="feedback-button feedback-k-button transition-colors px-1 py-0.5"
              title="Customize (Ctrl+K)"
            >
              Ctrl+K 调教
            </button>
          </div>
        </motion.div>
      ) : (
        /* Expanded State */
        <motion.div
          key="expanded"
          initial={{ opacity: 0, scale: 0.9, y: 5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 5 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
            mass: 0.5
          }}
          className="feedback-bubble feedback-expanded fixed z-[60] w-80 bg-gray-900/90 backdrop-blur-md rounded-xl"
          style={{
            top: `${position.top + 20}px`,
            left: `${Math.max(10, Math.min(position.left, window.innerWidth - 340))}px`, // Prevent overflow
          }}
        >
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">自定义 AI 建议</h3>
              <button
                onClick={(e) => handleCollapse(e)}
                className="feedback-button text-gray-400 hover:text-white transition-colors p-1"
                title="Collapse (Esc)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick Feedback Options */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-2">快速反馈：</label>
              <div className="grid grid-cols-2 gap-2">
                {quickFeedbackOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleQuickFeedback(option.value)}
                    className="quick-feedback-btn flex items-center space-x-2 text-xs bg-gray-800/50 rounded-lg px-3 py-2 text-gray-300 hover:text-white"
                    title={option.value}
                  >
                    <span className="text-base">{option.emoji}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Feedback Input */}
            <form onSubmit={handleSubmit} className="space-y-2">
              <label className="text-xs font-medium text-gray-300 block">
                或自定义反馈：
              </label>
              <input
                ref={inputRef}
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="例如：让这段更感性一些..."
                className="feedback-input w-full px-3 py-2 text-sm bg-gray-800/50 rounded-lg text-white placeholder-gray-500 outline-none"
              />
              <button
                type="submit"
                disabled={!feedback.trim()}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                生成新建议
              </button>
            </form>

            {/* Keyboard shortcuts reminder */}
            <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-700/30">
              <div>按 <kbd className="kbd-indicator">Esc</kbd> 收起</div>
              <div>按 <kbd className="kbd-indicator">Enter</kbd> 提交反馈</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

