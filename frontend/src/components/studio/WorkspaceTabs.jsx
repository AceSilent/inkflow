import { useId } from 'react'
import { ListTree, NotebookTabs, Waypoints } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'

const tabs = [
  { id: 'chapter', labelKey: 'workspace.chapter', icon: NotebookTabs },
  { id: 'outline', labelKey: 'workspace.outline', icon: ListTree },
  { id: 'plot', labelKey: 'workspace.plot', icon: Waypoints },
]

export function WorkspaceTabs({ activeTab, onTabChange, chapter, outline, plot }) {
  const { t } = useI18n()
  const tabSetId = useId()
  const panelId = `${tabSetId}-panel`

  return (
    <div className="workspace-tabs-shell">
      <div className="workspace-tabs" role="tablist" aria-label={t('workspace.label')}>
        {tabs.map(tab => {
          const tabId = `${tabSetId}-${tab.id}`
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={panelId}
              className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon className="workspace-tab-icon" size={14} aria-hidden="true" />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>
      <div
        id={panelId}
        className="workspace-tab-panel"
        role="tabpanel"
        aria-labelledby={`${tabSetId}-${activeTab}`}
      >
        {activeTab === 'chapter' ? chapter : activeTab === 'outline' ? outline : plot}
      </div>
    </div>
  )
}
