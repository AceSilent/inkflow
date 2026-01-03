import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { useConfigStore } from '../../store/configStore';
import { invoke } from '@tauri-apps/api/tauri';
import { useTranslation } from '../../i18n';

export const EnhancedOutlinePanel: React.FC = () => {
  const { t } = useTranslation();
  const { globalOutline, loadGlobalOutline, rootPath, updateGlobalOutline, currentChapter } = useWorkspaceStore();
  const { content } = useEditorStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedOutline, setEditedOutline] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    if (rootPath && !globalOutline) {
      loadGlobalOutline();
    }
  }, [rootPath, globalOutline, loadGlobalOutline]);

  const handleSave = async () => {
    if (!editedOutline.trim()) return;

    setIsSaving(true);
    try {
      const outline = parseOutlineText(editedOutline);
      await updateGlobalOutline(outline);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save outline:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!currentChapter || !content.trim()) {
      alert(t.rightPanel.selectChapterFirst);
      return;
    }

    // Check API configuration
    const config = useConfigStore.getState();
    if (!config.apiKey) {
      alert(t.rightPanel.configureApiKeyFirst);
      return;
    }

    setIsGeneratingSummary(true);
    try {
      // 调用AI生成章节总结
      const summaryRequest = {
        prompt: `请为以下小说章节生成总结，包括主要情节、关键事件和人物发展（不超过200字）：\n\n${content.slice(0, 3000)}`,
        max_tokens: 500,
        temperature: 0.7,
        model: 'glm-4-plus',
        stream: false,
      };

      const response = await invoke('generate_ai_suggestion', {
        request: summaryRequest,
        apiKey: config.apiKey,
        apiBaseUrl: config.apiBaseUrl,
      }) as { content: string };

      // 解析AI返回的总结
      const summaryText = response.content.trim();

      // 提取关键词
      const keywordsRequest = {
        prompt: `从以下总结中提取3-5个关键词，用逗号分隔：\n${summaryText}`,
        max_tokens: 100,
        temperature: 0.5,
        model: 'glm-4-plus',
        stream: false,
      };

      const keywordsResponse = await invoke('generate_ai_suggestion', {
        request: keywordsRequest,
        apiKey: config.apiKey,
        apiBaseUrl: config.apiBaseUrl,
      }) as { content: string };

      const keywords = keywordsResponse.content
        .trim()
        .split(/[,，、]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);

      // 保存总结到 .inkflow 文件夹
      const summaryData = {
        chapter_path: currentChapter.path,
        summary: summaryText,
        keywords,
        generated_at: new Date().toISOString(),
      };

      const summaryFilename = currentChapter.filename.replace(/\.(md|txt)$/i, '');
      const summaryPath = `${rootPath}/.inkflow/${summaryFilename}.json`;

      await invoke('write_file', {
        path: summaryPath,
        content: JSON.stringify(summaryData, null, 2),
      });

      alert(`${t.rightPanel.summaryGenerated}\n\n${summaryText}\n\n${t.rightPanel.keywords}${keywords.join(', ')}`);

      // 刷新章节列表以显示"已总结"标记
      const { refreshChapterList } = useWorkspaceStore.getState();
      await refreshChapterList();
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert(t.rightPanel.generateFailed);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const parseOutlineText = (text: string) => {
    const lines = text.split('\n');
    const outline: typeof globalOutline = {
      title: '',
      summary: '',
      characters: [],
      plot_points: [],
      world_setting: '',
    };

    // Get translated section names
    const sectionNames = {
      title: t.sidebar.title,
      summary: t.sidebar.summary,
      characters: t.sidebar.characters,
      plot: t.sidebar.plot,
      worldSetting: t.sidebar.worldSetting,
    };

    let currentSection = '';
    let currentContent: string[] = [];

    lines.forEach(line => {
      if (line.startsWith('# ')) {
        // Save previous section
        if (currentSection === sectionNames.title) outline.title = currentContent.join('\n');
        if (currentSection === sectionNames.summary) outline.summary = currentContent.join('\n');
        if (currentSection === sectionNames.characters) {
          outline.characters = currentContent.map(line => {
            const [name, ...descParts] = line.split('-');
            return {
              name: name.trim(),
              description: descParts.join('-').trim(),
              role: t.sidebar.undefinedRole,
            };
          });
        }
        if (currentSection === sectionNames.plot) outline.plot_points = currentContent;
        if (currentSection === sectionNames.worldSetting) outline.world_setting = currentContent.join('\n');

        currentSection = line.slice(2);
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    });

    // Process last section
    if (currentSection === sectionNames.title) outline.title = currentContent.join('\n');
    if (currentSection === sectionNames.summary) outline.summary = currentContent.join('\n');
    if (currentSection === sectionNames.characters) {
      outline.characters = currentContent.map(line => {
        const [name, ...descParts] = line.split('-');
        return {
          name: name.trim(),
          description: descParts.join('-').trim(),
          role: t.sidebar.undefinedRole,
        };
      });
    }
    if (currentSection === sectionNames.plot) outline.plot_points = currentContent;
    if (currentSection === sectionNames.worldSetting) outline.world_setting = currentContent.join('\n');

    return outline;
  };

  const outlineText = globalOutline
    ? `# ${t.sidebar.title}
${globalOutline.title}

# ${t.sidebar.summary}
${globalOutline.summary}

# ${t.sidebar.characters}
${globalOutline.characters.map(c => `${c.name} - ${c.description}`).join('\n')}

# ${t.sidebar.plot}
${globalOutline.plot_points.join('\n')}

${globalOutline.world_setting ? `# ${t.sidebar.worldSetting}\n${globalOutline.world_setting}` : ''}
`
    : t.sidebar.outlineTemplateTitle;

  return (
    <div className="p-4 space-y-4">
      {/* Top Action Area */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">{t.sidebar.globalOutline}</h3>
        {!isEditing && globalOutline && (
          <button
            onClick={() => {
              setEditedOutline(outlineText);
              setIsEditing(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {t.sidebar.edit}
          </button>
        )}
      </div>

      {/* Outline Content or Create Button */}
      {!globalOutline ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm mb-4">{t.sidebar.noOutline}</p>
          <button
            onClick={() => {
              setEditedOutline(`# ${t.sidebar.title}
${t.sidebar.outlineTitlePlaceholder}

# ${t.sidebar.summary}
${t.sidebar.outlineSummaryPlaceholder}

# ${t.sidebar.characters}
${t.sidebar.outlineCharacterPlaceholder}

# ${t.sidebar.plot}
${t.sidebar.outlinePlotPlaceholder}

# ${t.sidebar.worldSetting}
${t.sidebar.outlineWorldPlaceholder}
`);
              setIsEditing(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            {t.sidebar.createOutline}
          </button>
        </div>
      ) : isEditing ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <textarea
            value={editedOutline}
            onChange={(e) => setEditedOutline(e.target.value)}
            className="w-full h-80 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
            placeholder={t.sidebar.outlinePlaceholder}
          />
          <div className="mt-2 text-xs text-gray-500">
            {t.sidebar.outlineHelp}
          </div>
          <div className="flex space-x-2 mt-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
            >
              {isSaving ? t.sidebar.saving : t.sidebar.save}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedOutline('');
              }}
              className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              {t.sidebar.cancel}
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-4"
        >
          {/* Title */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">{t.sidebar.title}</h4>
            <p className="text-sm text-white">{globalOutline.title}</p>
          </div>

          {/* Summary */}
          {globalOutline.summary && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">{t.sidebar.summary}</h4>
              <p className="text-sm text-gray-300">{globalOutline.summary}</p>
            </div>
          )}

          {/* Characters */}
          {globalOutline.characters.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">{t.sidebar.characters}</h4>
              <div className="space-y-1">
                {globalOutline.characters.map((char, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="text-blue-400 font-medium">{char.name}</span>
                    <span className="text-gray-500"> - </span>
                    <span className="text-gray-300">{char.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plot */}
          {globalOutline.plot_points.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">{t.sidebar.plot}</h4>
              <ul className="space-y-1">
                {globalOutline.plot_points.map((point, idx) => (
                  <li key={idx} className="text-sm text-gray-300 list-disc list-inside">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* World Setting */}
          {globalOutline.world_setting && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">{t.sidebar.worldSetting}</h4>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{globalOutline.world_setting}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Separator */}
      <hr className="border-gray-700" />

      {/* AI Summary Generation Area */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">{t.rightPanel.chapterSummary}</h3>
        <div className="text-xs text-gray-500">
          {currentChapter ? `${t.rightPanel.currentChapter}：${currentChapter.title}` : t.rightPanel.noChapterSelected}
        </div>
        <button
          onClick={handleGenerateSummary}
          disabled={isGeneratingSummary || !currentChapter || !content.trim()}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:disabled:bg-gray-700 disabled:bg-gray-300 dark:disabled:text-gray-500 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          {isGeneratingSummary ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>{t.rightPanel.generating}</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>{t.rightPanel.autoGenerateSummary}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
