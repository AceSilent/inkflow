import { FolderOpen, Lightbulb, PenTool, Search, Users, BarChart3, Settings, Inbox, ListTree } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

const items = [
  { id: 'explorer', icon: FolderOpen, labelKey: 'nav.explorer' },
  { id: 'brainstorm', icon: Lightbulb, labelKey: 'nav.brainstorm' },
  { id: 'write', icon: PenTool, labelKey: 'nav.write' },
  { id: 'review', icon: Search, labelKey: 'nav.review' },
  { id: 'characters', icon: Users, labelKey: 'nav.characters' },
  { id: 'statistics', icon: BarChart3, labelKey: 'nav.statistics' },
  { id: 'outline', icon: ListTree, labelKey: 'nav.outline' },
  { id: 'inbox', icon: Inbox, labelKey: 'nav.inbox' },
]

export function ActivityBar({ active, onClick }) {
  const { t } = useI18n()
  return (
    <nav className="activity-bar">
      <div className="activity-bar-top">
        {items.map(it => (
          <button key={it.id} className={`ab-item ${active === it.id ? 'active' : ''}`} onClick={() => onClick(it.id)} title={t(it.labelKey)}>
            <it.icon />
          </button>
        ))}
      </div>
      <div className="activity-bar-bottom">
        <button className={`ab-item ${active === 'settings' ? 'active' : ''}`} onClick={() => onClick('settings')} title={t('nav.settings')}>
          <Settings />
        </button>
      </div>
    </nav>
  )
}
