import { useId } from 'react'

const tabs = [
  { id: 'chapter', label: '章节' },
  { id: 'outline', label: '大纲' },
  { id: 'plot', label: '剧情图' },
]

export function WorkspaceTabs({ activeTab, onTabChange, chapter, outline, plot }) {
  const tabSetId = useId()
  const panelId = `${tabSetId}-panel`

  return (
    <div className="workspace-tabs-shell">
      <div className="workspace-tabs" role="tablist" aria-label="作品空间">
        {tabs.map(tab => {
          const tabId = `${tabSetId}-${tab.id}`

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
              {tab.label}
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
