const tabs = [
  { id: 'chapter', label: '章节' },
  { id: 'outline', label: '大纲' },
  { id: 'plot', label: '剧情图' },
]

export function WorkspaceTabs({ activeTab, onTabChange, chapter, outline, plot }) {
  return (
    <div className="workspace-tabs-shell">
      <div className="workspace-tabs" role="tablist" aria-label="作品空间">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="workspace-tab-panel" role="tabpanel">
        {activeTab === 'chapter' ? chapter : activeTab === 'outline' ? outline : plot}
      </div>
    </div>
  )
}
