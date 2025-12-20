import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { GhostTextManager } from './GhostTextManager';
import { useEditorStore, useEditorContent, useGhostText, useEditorLoading, useFeedbackPanelVisible } from '../../store/editorStore';
import { FeedbackPanel } from './FeedbackPanel';

interface MainEditorProps {
  theme?: 'light' | 'dark' | 'vs-dark';
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

export const MainEditor: React.FC<MainEditorProps> = ({
  theme = 'dark',
  onMount,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ghostTextManagerRef = useRef<GhostTextManager | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // State for feedback panel positioning and expansion
  const [feedbackPanelPosition, setFeedbackPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [lastValidPosition, setLastValidPosition] = useState<{ top: number; left: number } | null>(null);
  const [shouldAutoExpand, setShouldAutoExpand] = useState(false);

  // Store hooks
  const content = useEditorContent();
  const ghostText = useGhostText();
  const feedbackPanelVisible = useFeedbackPanelVisible();
  const { isLoading, isAISuggesting } = useEditorLoading();

  const {
    updateContent,
    updateCursorPosition,
    updateSelectionRange,
    acceptSuggestion,
    clearGhostText,
    generateAISuggestion,
    shouldTriggerAI,
    autoSave,
    setFeedbackVisible,
  } = useEditorStore();

  // Handle editor mount
  const handleEditorMount = useCallback(
    async (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      ghostTextManagerRef.current = new GhostTextManager(editor);

      // Configure editor for immersive experience
      editor.updateOptions({
        fontSize: 16,
        fontFamily: '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
        lineHeight: 1.8,
        wordWrap: 'on',
        wordWrapColumn: 80,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'off',
        rulers: [],
        renderLineHighlight: 'none',
        occurrencesHighlight: false,
        renderWhitespace: 'none',
        renderControlCharacters: false,
        folding: false,
        foldingHighlight: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        padding: { top: 20, bottom: 20 },
        scrollPredominantAxis: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorStyle: 'line',
        cursorWidth: 2,
        bracketPairColorization: { enabled: false },
        guides: {
          indentation: false,
          bracketPairs: false,
          highlightActiveIndentation: false,
        },
      });

      // Set up keyboard shortcuts
      editor.addAction({
        id: 'accept-ghost-text',
        label: 'Accept Ghost Text',
        keybindings: [monaco.KeyCode.Tab],
        run: async () => {
          if (ghostTextManagerRef.current?.isVisible()) {
            await acceptSuggestion();
          }
        },
      });

      editor.addAction({
        id: 'dismiss-ghost-text',
        label: 'Dismiss Ghost Text',
        keybindings: [monaco.KeyCode.Escape],
        run: () => {
          // Logic: If panel is expanded, ESC collapses to capsule; if already capsule, clear ghost text
          if (shouldAutoExpand) {
            console.log('ESC pressed while panel expanded, collapsing to capsule');
            setShouldAutoExpand(false);
            setFeedbackVisible(false);
          } else {
            console.log('ESC pressed while in capsule state, clearing ghost text');
            clearGhostText();
          }
        },
      });

      editor.addAction({
        id: 'toggle-feedback-panel',
        label: 'Toggle Feedback Panel',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
        run: () => {
          console.log('Ctrl+K pressed, checking panel and ghost text state');
          const { ghostText, setFeedbackVisible } = useEditorStore.getState();

          // If panel is already visible, user might want to focus on input, no need to process
          if (feedbackPanelVisible) {
            console.log('Panel already visible, focusing on input instead');
            setShouldAutoExpand(true); // Ensure it's expanded
            return;
          }

          // If panel not expanded and ghost text exists, expand it
          if (ghostText?.isShowing) {
            console.log('Ghost text exists, setting feedback panel visible and expanded');
            setFeedbackVisible(true);
            setShouldAutoExpand(true);
          } else {
            console.log('No ghost text showing, ignoring Ctrl+K');
          }
        },
      });

      // Add keyboard event listener for extra Ctrl+K interception
      const keyDownDisposable = editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.KeyK && (e.ctrlKey || e.metaKey)) {
          console.log('Ctrl+K intercepted in onKeyDown listener');
          e.preventDefault();
          e.stopPropagation();

          const { ghostText, setFeedbackVisible } = useEditorStore.getState();

          // If panel is already visible, user might want to focus on input, no need to process
          if (feedbackPanelVisible) {
            console.log('Panel already visible in onKeyDown, focusing on input instead');
            setShouldAutoExpand(true); // Ensure it's expanded
            return;
          }

          // If panel not expanded and ghost text exists, expand it
          if (ghostText?.isShowing) {
            console.log('Ghost text exists in onKeyDown, setting feedback panel visible and expanded');
            setFeedbackVisible(true);
            setShouldAutoExpand(true);
          }
        }
      });

      // Add content change listener with debouncing
      const disposable = editor.onDidChangeModelContent(() => {
        const newContent = editor.getValue();
        updateContent(newContent);

        // Debounce AI suggestion trigger
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
          if (shouldTriggerAI()) {
            generateAISuggestion();
          }
        }, 2000);
      });

      // Add cursor position change listener
      editor.onDidChangeCursorPosition((e) => {
        const position = GhostTextManager.calculateCursorPosition(editor, e.position);
        updateCursorPosition(position);

        // Calculate feedback panel position when ghost text is visible
        if (ghostText?.isShowing && ghostText.position) {
          try {
            // Convert cursor position to pixel coordinates
            const cursorPosition = new monaco.Position(ghostText.position.line, ghostText.position.column);
            const visiblePosition = editor.getScrolledVisiblePosition(cursorPosition);

            if (visiblePosition) {
              // Get the editor's DOM element for accurate positioning
              const editorDomNode = editor.getDomNode();
              if (editorDomNode) {
                const editorRect = editorDomNode.getBoundingClientRect();
                const pixelPosition = {
                  top: visiblePosition.top + editorRect.top,
                  left: visiblePosition.left + editorRect.left,
                };
                setFeedbackPanelPosition(pixelPosition);
                setLastValidPosition(pixelPosition); // Save for fallback
              }
            }
          } catch (error) {
            console.warn('Failed to calculate feedback panel position:', error);
          }
        }

        // Handle ghost text visibility based on cursor movement
        if (ghostTextManagerRef.current) {
          const shouldClear = ghostTextManagerRef.current.handleCursorPositionChange(position);
          if (shouldClear) {
            clearGhostText();
            setFeedbackPanelPosition(null);
          }
        }
      });

      // Add selection change listener
      editor.onDidChangeCursorSelection((e) => {
        const selection = e.selection;
        const startOffset = editor.getModel()?.getOffsetAt(selection.getStartPosition()) || 0;
        const endOffset = editor.getModel()?.getOffsetAt(selection.getEndPosition()) || 0;

        updateSelectionRange({
          start: startOffset,
          end: endOffset,
        });

        // Handle ghost text visibility based on selection
        if (ghostTextManagerRef.current) {
          const shouldClear = ghostTextManagerRef.current.handleSelectionChange(selection);
          if (shouldClear) {
            clearGhostText();
          }
        }
      });

      // Auto-save on focus out
      editor.onDidBlurEditorText(() => {
        autoSave();
      });

      // Call external onMount callback if provided
      if (onMount) {
        onMount(editor);
      }

      // Setup auto-save interval
      const autoSaveInterval = setInterval(() => {
        autoSave();
      }, 30000); // Auto-save every 30 seconds

      // Cleanup function
      return () => {
        disposable.dispose();
        keyDownDisposable.dispose();
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        clearInterval(autoSaveInterval);
      };
    },
    [updateContent, updateCursorPosition, updateSelectionRange, acceptSuggestion, clearGhostText, generateAISuggestion, shouldTriggerAI, autoSave, onMount, ghostText]
  );

  // Sync ghost text with store
  useEffect(() => {
    if (!ghostTextManagerRef.current) return;

    console.log('🔍 Ghost text sync effect triggered:', {
      ghostText,
      isShowing: ghostText?.isShowing,
      suggestion: ghostText?.suggestion,
      position: ghostText?.position
    });

    if (ghostText?.isShowing) {
      console.log('👻 Showing ghost text:', ghostText.suggestion);
      ghostTextManagerRef.current.show(ghostText.suggestion, ghostText.position);

      // Calculate feedback panel position when ghost text appears
      if (editorRef.current && ghostText.position) {
        try {
          const cursorPosition = new monaco.Position(ghostText.position.line, ghostText.position.column);
          const visiblePosition = editorRef.current.getScrolledVisiblePosition(cursorPosition);

          if (visiblePosition) {
            const editorDomNode = editorRef.current.getDomNode();
            if (editorDomNode) {
              const editorRect = editorDomNode.getBoundingClientRect();
              const pixelPosition = {
                top: visiblePosition.top + editorRect.top,
                left: visiblePosition.left + editorRect.left,
              };
              setFeedbackPanelPosition(pixelPosition);
              setLastValidPosition(pixelPosition); // Save for fallback
            }
          }
        } catch (error) {
          console.warn('Failed to calculate feedback panel position:', error);
        }
      }
    } else {
      console.log('🧹 Clearing ghost text');
      ghostTextManagerRef.current.clear();
      setFeedbackPanelPosition(null);
    }
  }, [ghostText]);

  // Reset feedback panel state when ghost text is hidden
  useEffect(() => {
    if (!ghostText?.isShowing) {
      setFeedbackVisible(false);
      setShouldAutoExpand(false);
    }
  }, [ghostText?.isShowing, setFeedbackVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Loading overlay
  const renderLoadingOverlay = () => {
    if (!isLoading && !isAISuggesting) return null;

    return (
      <div className="absolute top-4 right-4 bg-blue-600/20 backdrop-blur-sm text-blue-100 border border-blue-400/30 px-3 py-2 rounded-lg text-sm flex items-center space-x-2 z-[9999] shadow-lg">
        {isLoading && (
          <>
            <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
            <span className="animate-pulse">Saving...</span>
          </>
        )}
        {isAISuggesting && (
          <>
            <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
            <span className="animate-pulse">AI thinking...</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full">
      {renderLoadingOverlay()}

      <div className="w-full h-full">
        <Editor
          height="100%"
          defaultLanguage="markdown" // Use markdown for better text editing experience
          value={content}
          theme={theme}
          onChange={(value) => {
            if (value !== undefined) {
              updateContent(value);
            }
          }}
          onMount={handleEditorMount}
          loading={
            <div className="flex items-center justify-center h-full w-full bg-editor-bg">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-gray-400 text-sm">
                  Loading editor...
                </div>
              </div>
            </div>
          }
          options={{
            // Immersive editor options are set in onMount
            readOnly: false,
            automaticLayout: true,
          }}
        />
      </div>

      {/* Feedback Panel */}
      <FeedbackPanel
        isVisible={(ghostText?.isShowing ?? false) || feedbackPanelVisible}
        position={feedbackPanelPosition || lastValidPosition || undefined}
        isExpanded={shouldAutoExpand}
        onFeedback={async (feedback: string) => {
          // Handle feedback submission
          console.log('User feedback:', feedback);
          // Could trigger AI regeneration with feedback
          clearGhostText();
          setFeedbackVisible(false);
          setShouldAutoExpand(false);
          // Key: Return focus to editor after feedback submission
          setTimeout(() => editorRef.current?.focus(), 10);
          // You could call generateAISuggestion() again here with feedback
        }}
        onAccept={async () => {
          await acceptSuggestion(editorRef);
          setFeedbackVisible(false);
          setShouldAutoExpand(false);
          // Focus is already handled in acceptSuggestion
        }}
        onDismiss={() => {
          clearGhostText();
          setFeedbackVisible(false);
          setShouldAutoExpand(false);
          // Key: Return focus to editor after dismissing
          setTimeout(() => editorRef.current?.focus(), 10);
        }}
        onCollapse={() => {
          console.log('onCollapse callback triggered, collapsing to capsule');
          setShouldAutoExpand(false);
          // Key: Return focus to editor after collapsing
          setTimeout(() => editorRef.current?.focus(), 10);
        }}
        onExpandRequest={() => {
          setFeedbackVisible(true);
          setShouldAutoExpand(true);
        }}
      />
    </div>
  );
};

// CSS for immersive editor styling
export const editorCSS = `
/* Immersive editor styles */
.monaco-editor {
  background: transparent !important;
}

.monaco-editor .margin {
  background: transparent !important;
}

.monaco-editor .lines-content {
  background: transparent !important;
}

.monaco-editor .current-line {
  border: none !important;
  background: rgba(255, 255, 255, 0.02) !important;
}

.monaco-editor.vs-dark .current-line {
  background: rgba(255, 255, 255, 0.02) !important;
}

/* Custom scrollbar */
.monaco-editor .monaco-scrollable-element {
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.3) transparent;
}

.monaco-editor .monaco-scrollable-element::-webkit-scrollbar {
  width: 8px;
}

.monaco-editor .monaco-scrollable-element::-webkit-scrollbar-track {
  background: transparent;
}

.monaco-editor .monaco-scrollable-element::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.3);
  border-radius: 4px;
}

.monaco-editor .monaco-scrollable-element::-webkit-scrollbar-thumb:hover {
  background-color: rgba(128, 128, 128, 0.5);
}

/* Loading overlay animation */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
`;