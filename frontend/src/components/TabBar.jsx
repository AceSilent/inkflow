import { Home, Lightbulb, PenTool, Search, Settings, X } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

const tabIcons = { welcome: Home, brainstorm: Lightbulb, iceberg: PenTool, review: Search, settings: Settings }

export function TabBar({ tabs, activeTab, onSelect, onClose }) {
  const { t } = useI18n()
  return (
    <div className="tabbar">
      {tabs.map(tab => {
        const Icon = tabIcons[tab.id] || Home
        return (
          <div key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => onSelect(tab.id)} role="tab">
            <Icon size={13} />
            <span>{t(tab.label) || tab.label}</span>
            {tab.id !== 'welcome' && (
              <button className="tab-close" onClick={e => { e.stopPropagation(); onClose(tab.id); }}>
                <X />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
