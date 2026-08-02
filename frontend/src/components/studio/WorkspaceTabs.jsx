import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'

const tabs = [
  { id: 'chapter', labelKey: 'workspace.chapter' },
  { id: 'outline', labelKey: 'workspace.outline' },
  { id: 'plot', labelKey: 'workspace.plot' },
  { id: 'lore', labelKey: 'workspace.lore' },
  { id: 'game', labelKey: 'workspace.game' },
]

const shortcuts = ['outline', 'plot', 'lore']

export function WorkspaceTabs({ activeTab, onTabChange, chapterTitle, chapter, outline, plot, lore, game }) {
  const { t } = useI18n()
  const tabSetId = useId()
  const panelId = `${tabSetId}-panel`
  const activeDefinition = tabs.find(tab => tab.id === activeTab) || tabs[0]
  const activeLabel = activeTab === 'chapter' && chapterTitle
    ? chapterTitle
    : t(activeDefinition.labelKey)

  return (
    <div className="workspace-tabs-shell">
      <div className="workspace-tabs" aria-label={t('workspace.label')}>
        <div className="workspace-tab-select-wrap">
          <span className="workspace-tab-current">{activeLabel}</span>
          <ChevronDown size={13} aria-hidden="true" />
          <select
            className="workspace-tab-select"
            value={activeTab}
            onChange={event => onTabChange(event.target.value)}
            aria-label={t('workspace.label')}
          >
            {tabs.map(tab => (
              <option key={tab.id} value={tab.id}>{t(tab.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="workspace-tab-shortcuts" aria-label={t('workspace.shortcuts')}>
          {shortcuts.map(id => {
            const definition = tabs.find(tab => tab.id === id)
            return (
              <button
                key={id}
                type="button"
                className={activeTab === id ? 'active' : ''}
                onClick={() => onTabChange(id)}
                aria-pressed={activeTab === id}
              >
                {t(definition.labelKey)}
              </button>
            )
          })}
        </div>
      </div>
      <div
        id={panelId}
        className="workspace-tab-panel"
        role="tabpanel"
        aria-label={activeLabel}
      >
        {activeTab === 'chapter'
          ? chapter
          : activeTab === 'outline'
            ? outline
            : activeTab === 'plot'
              ? plot
              : activeTab === 'lore'
                ? lore
                : game}
      </div>
    </div>
  )
}
