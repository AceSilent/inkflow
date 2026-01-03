import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useEditorStore } from '../../store/editorStore';
import { useTranslation } from '../../i18n';

export const OutlinePanel: React.FC = () => {
  const { t } = useTranslation();
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
      // Parse edited text into NovelOutline format
      const outline = parseOutlineText(editedOutline);
      await updateGlobalOutline(outline);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save outline:', error);
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
      {!globalOutline ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm mb-4">{t.sidebar.noOutline}</p>
          <button
            onClick={() => {
              clearGhostText(); // Clear AI suggestions
              setEditedOutline(t.sidebar.outlineTemplateContent);
              setIsEditing(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            {t.sidebar.createOutline}
          </button>
        </div>
      ) : (
        <>
          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">{t.sidebar.globalOutline}</h3>
            {!isEditing ? (
              <button
                onClick={() => {
                  clearGhostText(); // Clear AI suggestions
                  setEditedOutline(outlineText);
                  setIsEditing(true);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t.sidebar.edit}
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-xs text-green-400 hover:text-green-300 disabled:text-gray-500 transition-colors"
                >
                  {isSaving ? t.sidebar.saving : t.sidebar.save}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedOutline('');
                  }}
                  className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {t.sidebar.cancel}
                </button>
              </div>
            )}
          </div>

          {/* Outline content */}
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
                  placeholder={t.sidebar.outlinePlaceholder}
                />
                <div className="mt-2 text-xs text-gray-500">
                  {t.sidebar.outlineHelp}
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
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
