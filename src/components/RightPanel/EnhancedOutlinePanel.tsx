import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { useConfigStore } from '../../store/configStore';
import { invoke } from '@tauri-apps/api/tauri';

export const EnhancedOutlinePanel: React.FC = () => {
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
      console.error('❌ 保存大纲失败:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!currentChapter || !content.trim()) {
      alert('请先选择章节并确保有内容');
      return;
    }

    // Check API configuration
    const config = useConfigStore.getState();
    if (!config.apiKey) {
      alert('请先在设置中配置 API Key');
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

      alert(`✅ 总结已生成并保存！\n\n${summaryText}\n\n关键词：${keywords.join('、')}`);

      // 刷新章节列表以显示"已总结"标记
      const { refreshChapterList } = useWorkspaceStore.getState();
      await refreshChapterList();
    } catch (error) {
      console.error('❌ 生成总结失败:', error);
      alert('生成总结失败，请检查API配置');
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

    let currentSection = '';
    let currentContent: string[] = [];

    lines.forEach(line => {
      if (line.startsWith('# ')) {
        if (currentSection === '标题') outline.title = currentContent.join('\n');
        if (currentSection === '简介') outline.summary = currentContent.join('\n');
        if (currentSection === '人物') {
          outline.characters = currentContent.map(line => {
            const [name, ...descParts] = line.split('-');
            return {
              name: name.trim(),
              description: descParts.join('-').trim(),
              role: '未定义',
            };
          });
        }
        if (currentSection === '情节') outline.plot_points = currentContent;
        if (currentSection === '世界观') outline.world_setting = currentContent.join('\n');

        currentSection = line.slice(2);
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    });

    // 处理最后一个section
    if (currentSection === '标题') outline.title = currentContent.join('\n');
    if (currentSection === '简介') outline.summary = currentContent.join('\n');
    if (currentSection === '人物') {
      outline.characters = currentContent.map(line => {
        const [name, ...descParts] = line.split('-');
        return {
          name: name.trim(),
          description: descParts.join('-').trim(),
          role: '未定义',
        };
      });
    }
    if (currentSection === '情节') outline.plot_points = currentContent;
    if (currentSection === '世界观') outline.world_setting = currentContent.join('\n');

    return outline;
  };

  const outlineText = globalOutline
    ? `# 标题
${globalOutline.title}

# 简介
${globalOutline.summary}

# 人物
${globalOutline.characters.map(c => `${c.name} - ${c.description}`).join('\n')}

# 情节
${globalOutline.plot_points.join('\n')}

${globalOutline.world_setting ? `# 世界观\n${globalOutline.world_setting}` : ''}
`
    : '# 尚未创建大纲\n\n点击下方按钮创建大纲...';

  return (
    <div className="p-4 space-y-4">
      {/* 顶部操作区 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">全局大纲</h3>
        {!isEditing && globalOutline && (
          <button
            onClick={() => {
              setEditedOutline(outlineText);
              setIsEditing(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            编辑
          </button>
        )}
      </div>

      {/* 大纲内容或创建按钮 */}
      {!globalOutline ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm mb-4">尚未创建大纲</p>
          <button
            onClick={() => {
              setEditedOutline(`# 标题
新小说标题

# 简介
小说简介...

# 人物
主角 - 人物描述...

# 情节
- 情节1
- 情节2

# 世界观
世界观描述...
`);
              setIsEditing(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            创建大纲
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
            placeholder="输入大纲内容（Markdown格式）"
          />
          <div className="mt-2 text-xs text-gray-500">
            使用 Markdown 格式，以 # 开头表示章节标题
          </div>
          <div className="flex space-x-2 mt-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedOutline('');
              }}
              className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
            >
              取消
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
          {/* 标题 */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-1">标题</h4>
            <p className="text-sm text-white">{globalOutline.title}</p>
          </div>

          {/* 简介 */}
          {globalOutline.summary && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">简介</h4>
              <p className="text-sm text-gray-300">{globalOutline.summary}</p>
            </div>
          )}

          {/* 人物 */}
          {globalOutline.characters.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">人物</h4>
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

          {/* 情节 */}
          {globalOutline.plot_points.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">情节</h4>
              <ul className="space-y-1">
                {globalOutline.plot_points.map((point, idx) => (
                  <li key={idx} className="text-sm text-gray-300 list-disc list-inside">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 世界观 */}
          {globalOutline.world_setting && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">世界观</h4>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{globalOutline.world_setting}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* 分隔线 */}
      <hr className="border-gray-700" />

      {/* AI总结生成区 */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">章节总结</h3>
        <div className="text-xs text-gray-500">
          {currentChapter ? `当前章节：${currentChapter.title}` : '未选择章节'}
        </div>
        <button
          onClick={handleGenerateSummary}
          disabled={isGeneratingSummary || !currentChapter || !content.trim()}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 dark:disabled:bg-gray-700 disabled:bg-gray-300 dark:disabled:text-gray-500 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          {isGeneratingSummary ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>AI生成中...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>自动生成总结</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
