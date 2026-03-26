import { BookOpen, FolderPlus, Lightbulb } from 'lucide-react'
import { useI18n } from '../i18n/index.jsx'

export function WelcomePanel({ onNewBook, onOpenBrainstorm }) {
  const { t } = useI18n()
  return (
    <div className="welcome">
      <div className="welcome-icon"><BookOpen size={48} /></div>
      <div className="welcome-title">{t('welcome.title')}</div>
      <div className="welcome-desc">{t('welcome.desc')}<br />{t('welcome.sub')}</div>
      <div className="welcome-actions">
        <button className="btn btn-primary btn-lg" onClick={onNewBook}><FolderPlus size={15} /> {t('welcome.newBook')}</button>
        <button className="btn btn-secondary btn-lg" onClick={onOpenBrainstorm}><Lightbulb size={15} /> {t('welcome.brainstorm')}</button>
      </div>
      <div className="welcome-shortcuts">
        <h4>{t('welcome.shortcuts')}</h4>
        <div className="shortcut-grid">
          <span className="shortcut"><kbd className="kbd">Ctrl+N</kbd> {t('welcome.shortcut.newBook')}</span>
          <span className="shortcut"><kbd className="kbd">Ctrl+B</kbd> {t('welcome.shortcut.sidebar')}</span>
          <span className="shortcut"><kbd className="kbd">Ctrl+1</kbd> {t('welcome.shortcut.brainstorm')}</span>
          <span className="shortcut"><kbd className="kbd">Ctrl+2</kbd> {t('welcome.shortcut.iceberg')}</span>
        </div>
      </div>
    </div>
  )
}
