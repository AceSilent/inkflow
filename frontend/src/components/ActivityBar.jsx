import { FolderOpen, Lightbulb, PenTool, ListTree, BookOpen, Settings } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

const items = [
  { id: 'explorer', icon: FolderOpen, labelKey: 'nav.explorer' },
  { id: 'brainstorm', icon: Lightbulb, labelKey: 'nav.brainstorm' },
  { id: 'author-chat', icon: PenTool, labelKey: 'nav.authorChat' },
  { id: 'outline', icon: ListTree, labelKey: 'nav.outline' },
  { id: 'chapter', icon: BookOpen, labelKey: 'nav.chapter' },
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
