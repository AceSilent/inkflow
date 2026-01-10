import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { GhostTextManager } from './GhostTextManager';
import { useEditorStore, useEditorContent, useGhostText, useEditorLoading, useFeedbackPanelVisible } from '../../store/editorStore';
import { useConfigStore } from '../../store/configStore';
import { useTranslation } from '../../i18n';
import { FeedbackPanel } from './FeedbackPanel';

interface MainEditorProps {
  theme?: 'light' | 'vs-dark';
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

export const MainEditor: React.FC<MainEditorProps> = ({
  theme = 'vs-dark',
  onMount,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ghostTextManagerRef = useRef<GhostTextManager | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const saveStateTimerRef = useRef<number | null>(null);
  const hasRestoredRef = useRef(false); // 防止重复执行恢复

  // State for feedback panel positioning and expansion
  const [feedbackPanelPosition, setFeedbackPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [lastValidPosition, setLastValidPosition] = useState<{ top: number; left: number } | null>(null);
  const [shouldAutoExpand, setShouldAutoExpand] = useState(false);

  // Store hooks
  const content = useEditorContent();
  const ghostText = useGhostText();
  const feedbackPanelVisible = useFeedbackPanelVisible();
  const { isLoading, isAISuggesting, currentChapterPath } = useEditorLoading();
  const isEditorReady = useEditorStore((state) => state.isEditorReady);
  const aiDelay = useConfigStore((state) => state.aiDelay);
  const { t } = useTranslation();

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
    saveEditorState,
    viewState,
    hasPendingViewState,
    clearViewState,
    setEditorReady,
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
        automaticLayout: true, // CRITICAL for proper scroll restoration with ViewState
      });

      // Set up keyboard shortcuts
      editor.addAction({
        id: 'accept-ghost-text',
        label: 'Accept Ghost Text',
        keybindings: [monaco.KeyCode.Tab],
        run: async () => {
          const editor = editorRef.current;
          const { ghostText, acceptSuggestion } = useEditorStore.getState();

          if (!editor || !ghostText?.isShowing) {
            return;
          }

          console.log('🎯 Accepting suggestion with Monaco native operations');

          // Use Monaco's native text insertion with proper cursor management
          const text = ghostText.suggestion;
          const position = ghostText.position;

          // Ensure the suggestion doesn't have trailing newlines that would cause cursor jumping
          const cleanedText = text.trimEnd();

          // Execute edit operation using Monaco's native API
          editor.executeEdits('ai-suggestion', [{
            range: new monaco.Range(
              position.line,
              position.column,
              position.line,
              position.column
            ),
            text: cleanedText,
            forceMoveMarkers: true // Ensures cursor moves to the end of inserted text
          }]);

          // Sync state to Store (only state update, no text manipulation)
          await acceptSuggestion(editorRef);

          // Force focus back to editor after operation
          setTimeout(() => editor.focus(), 10);
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
        }, aiDelay);
      });

      // Add scroll change listener with debouncing
      editor.onDidScrollChange(() => {
        // Save viewState with 300ms debounce
        if (saveStateTimerRef.current) {
          clearTimeout(saveStateTimerRef.current);
        }
        saveStateTimerRef.current = setTimeout(() => {
          saveEditorState(editorRef);
        }, 300);
      });

      // Add cursor position change listener
      editor.onDidChangeCursorPosition((e) => {
        const position = GhostTextManager.calculateCursorPosition(editor, e.position);
        updateCursorPosition(position);

        // Debounce save viewState (300ms)
        if (saveStateTimerRef.current) {
          clearTimeout(saveStateTimerRef.current);
        }
        saveStateTimerRef.current = setTimeout(() => {
          saveEditorState(editorRef);
        }, 300); // 300ms 防抖保存

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
        // Also save viewState when losing focus
        saveEditorState(editorRef);
      });

      // Call external onMount callback if provided
      if (onMount) {
        onMount(editor);
      }

      // CRITICAL: Initialize content from store if needed
      // This handles the case where useAppInitialization sets content before Monaco mounts
      const store = useEditorStore.getState();
      const needsInit = currentChapterPath && editor.getValue() !== store.content;

      if (needsInit) {
        console.log('🔄 Monaco 挂载后恢复内容:');
        console.log('  - currentChapterPath:', currentChapterPath);
        console.log('  - store.content length:', store.content.length);
        console.log('  - editor content length:', editor.getValue().length);

        // Use setValue to directly set content from store
        editor.setValue(store.content);
        console.log('✅ 内容已从 store 恢复到 Monaco');
      }

      // Setup auto-save interval
      const autoSaveInterval = setInterval(() => {
        autoSave();
      }, 30000); // Auto-save every 30 seconds

      // CRITICAL: Mark editor as ready for restoration
      // This triggers the restoration effect in MainEditor
      setEditorReady(true);
      console.log('✅ Monaco Editor 已就绪');

      // Cleanup function
      return () => {
        disposable.dispose();
        keyDownDisposable.dispose();
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        if (saveStateTimerRef.current) {
          clearTimeout(saveStateTimerRef.current);
        }
        clearInterval(autoSaveInterval);
      };
    },
    [updateContent, updateCursorPosition, updateSelectionRange, acceptSuggestion, clearGhostText, generateAISuggestion, shouldTriggerAI, autoSave, saveEditorState, onMount, ghostText, currentChapterPath, setEditorReady]
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

  // ============================================================
  // ViewState Restoration - Pixel-Perfect Recovery
  // ============================================================
  // Core restoration logic: only fires when ALL conditions are met
  useEffect(() => {
    const editor = editorRef.current;

    // Must have all four conditions:
    // 1. Editor is fully mounted and ready
    // 2. Content is loaded
    // 3. Pending ViewState exists
    // 4. Editor instance exists
    // 5. Haven't restored yet (prevent duplicate restoration)
    if (!isEditorReady || !content || !hasPendingViewState || !editor || !viewState || hasRestoredRef.current) {
      return;
    }

    console.log('🚀 编辑器已就绪，内容已加载，开始执行像素级恢复...');
    console.log('  - isEditorReady:', isEditorReady);
    console.log('  - content length:', content.length);
    console.log('  - hasPendingViewState:', hasPendingViewState);

    // Mark as restored to prevent duplicate execution
    hasRestoredRef.current = true;

    // CRITICAL: Give Monaco a little time to parse Markdown structure
    const timer = setTimeout(() => {
      try {
        // Ensure content is set
        const model = editor.getModel();
        if (!model) {
          console.warn('⚠️ 没有可用的 Model');
          clearViewState();
          hasRestoredRef.current = false; // Allow retry
          return;
        }

        const currentValue = model.getValue();
        if (currentValue !== content) {
          console.log('📝 内容不匹配，先设置内容');
          editor.setValue(content);
        }

        // Parse and restore ViewState
        const viewStateObj = typeof viewState === 'string' ? JSON.parse(viewState) : viewState;
        editor.restoreViewState(viewStateObj);
        clearViewState();

        console.log('✅ InkFlow 状态完美恢复');
        console.log('  - scroll position restored');
        console.log('  - cursor position restored');

        // Trigger water ink fade-in animation
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.focus();
            console.log('✨ 水墨淡入完成 - Editor revealed');
          }
        });
      } catch (e) {
        console.error('❌ 恢复失败:', e);
        clearViewState();
        hasRestoredRef.current = false; // Allow retry on error
      }
    }, 100); // 100ms is enough for initial layout calculation

    return () => clearTimeout(timer);
  }, [isEditorReady, content, hasPendingViewState, viewState, clearViewState]);

  // Reset restoration flag when chapter changes
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [currentChapterPath]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (saveStateTimerRef.current) {
        clearTimeout(saveStateTimerRef.current);
      }
    };
  }, []);

  // Save position when window loses focus or closes
  useEffect(() => {
    const handleBlur = () => {
      console.log('🪟 Window lost focus, saving editor state');
      saveEditorState(editorRef);
    };

    const handleBeforeUnload = () => {
      console.log('🚪 Window closing, saving editor state');
      saveEditorState(editorRef);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
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

      {/* Empty state - no chapter loaded */}
      {!currentChapterPath && (
        <div className="w-full h-full flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="text-center space-y-6 max-w-lg">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 dark:bg-gray-800 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 dark:text-gray-600 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
            </div>

            {/* Title and Description */}
            <div>
              <h2 className="text-2xl font-semibold dark:text-white text-gray-900 mb-2">
                {t.editor.emptyStateTitle}
              </h2>
              <p className="text-sm dark:text-gray-400 text-gray-600">
                {t.editor.emptyStateDesc}
              </p>
            </div>

            {/* Action Hints */}
            <div className="space-y-3 text-left max-w-sm mx-auto">
              <div className="flex items-start space-x-3 dark:text-gray-400 text-gray-600">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 dark:text-blue-400 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <div className="text-sm">
                  <p className="font-medium dark:text-gray-300 text-gray-700">{t.editor.hintOpenWorkspace}</p>
                  <p className="text-xs dark:text-gray-500 text-gray-500">{t.editor.hintOpenWorkspaceDesc}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 dark:text-gray-400 text-gray-600">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 dark:text-blue-400 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <div className="text-sm">
                  <p className="font-medium dark:text-gray-300 text-gray-700">{t.editor.hintCreateNovel}</p>
                  <p className="text-xs dark:text-gray-500 text-gray-500">{t.editor.hintCreateNovelDesc}</p>
                </div>
              </div>

              <div className="flex items-start space-x-3 dark:text-gray-400 text-gray-600">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 dark:text-blue-400 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <div className="text-sm">
                  <p className="font-medium dark:text-gray-300 text-gray-700">{t.editor.hintStartWriting}</p>
                  <p className="text-xs dark:text-gray-500 text-gray-500">{t.editor.hintStartWritingDesc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor - only shown when chapter is loaded */}
      {currentChapterPath && (
        <div
          className={`w-full h-full transition-all duration-700 ${
            isEditorReady
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-[0.99]'
          }`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
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
                    {t.editor.loadingEditor}
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
      )}

      {/* Feedback Panel */}
      <FeedbackPanel
        isVisible={(ghostText?.isShowing ?? false) || feedbackPanelVisible}
        position={feedbackPanelPosition || lastValidPosition || undefined}
        isExpanded={shouldAutoExpand}
        onFeedback={async (feedback: string) => {
          // Handle feedback submission and trigger AI regeneration with feedback
          console.log('User feedback submitted, regenerating AI suggestion:', feedback);

          // Close expanded panel (collapse to capsule state or hide)
          setFeedbackVisible(false);
          setShouldAutoExpand(false);

          // Trigger AI regeneration with user feedback
          await generateAISuggestion(feedback);

          // Return focus to editor after feedback submission
          setTimeout(() => editorRef.current?.focus(), 10);
        }}
        onAccept={async () => {
          const editor = editorRef.current;
          const { ghostText, acceptSuggestion } = useEditorStore.getState();

          if (!editor || !ghostText?.isShowing) {
            return;
          }

          console.log('🎯 Accepting suggestion via button with Monaco native operations');

          // Use Monaco's native text insertion with proper cursor management
          const text = ghostText.suggestion;
          const position = ghostText.position;

          // Ensure the suggestion doesn't have trailing newlines that would cause cursor jumping
          const cleanedText = text.trimEnd();

          // Execute edit operation using Monaco's native API
          editor.executeEdits('ai-suggestion-button', [{
            range: new monaco.Range(
              position.line,
              position.column,
              position.line,
              position.column
            ),
            text: cleanedText,
            forceMoveMarkers: true // Ensures cursor moves to the end of inserted text
          }]);

          // Sync state to Store (only state update, no text manipulation)
          await acceptSuggestion(editorRef);

          // Update UI state
          setFeedbackVisible(false);
          setShouldAutoExpand(false);

          // Force focus back to editor after operation
          setTimeout(() => editor.focus(), 10);
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