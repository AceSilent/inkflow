import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';

export const OutlinePanel: React.FC = () => {
  const { globalOutline, loadGlobalOutline, rootPath, updateGlobalOutline } = useWorkspaceStore();
  const { clearGhostText } = useEditorStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedOutline, setEditedOutline] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (rootPath && !globalOutline) {
      loadGlobalOutline();
    }
  }, [rootPath, globalOutline, loadGlobalOutline]);

  const handleSave = async () => {
    if (!editedOutline.trim()) return;

    setIsSaving(true);
    try {
      // 解析编辑后的文本为 NovelOutline 格式
      const outline = parseOutlineText(editedOutline);
      await updateGlobalOutline(outline);
      setIsEditing(false);
    } catch (error) {
      console.error('❌ 保存大纲失败:', error);
    } finally {
      setIsSaving(false);
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
        // 保存上一个section
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
      {!globalOutline ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm mb-4">尚未创建大纲</p>
          <button
            onClick={() => {
              clearGhostText(); // Clear AI suggestions
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
      ) : (
        <>
          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">全局大纲</h3>
            {!isEditing ? (
              <button
                onClick={() => {
                  clearGhostText(); // Clear AI suggestions
                  setEditedOutline(outlineText);
                  setIsEditing(true);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                编辑
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-xs text-green-400 hover:text-green-300 disabled:text-gray-500 transition-colors"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedOutline('');
                  }}
                  className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* 大纲内容 */}
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.div
                key="edit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <textarea
                  value={editedOutline}
                  onChange={(e) => setEditedOutline(e.target.value)}
                  className="w-full h-96 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono"
                  placeholder="输入大纲内容（Markdown格式）"
                />
                <div className="mt-2 text-xs text-gray-500">
                  使用 Markdown 格式，以 # 开头表示章节标题
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
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
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
