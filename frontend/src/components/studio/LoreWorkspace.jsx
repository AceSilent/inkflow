import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useI18n } from '../../hooks/useI18n'
import { MarkdownContent } from '../author-chat/MarkdownContent'

function emptyDocument(category) {
  return {
    schema_version: 1,
    category,
    revision: 0,
    entries: [],
  }
}

const emptyLore = {
  story_bible: emptyDocument('story_bible'),
  world_setting: emptyDocument('world_setting'),
  characters: emptyDocument('characters'),
}

const ENTRY_TYPE_KEYS = {
  story_bible: [
    'lore.type.workPositioning',
    'lore.type.corePremise',
    'lore.type.coreTheme',
    'lore.type.narrativePromise',
    'lore.type.longRoute',
    'lore.type.volumePlan',
    'lore.type.openDecision',
  ],
  world_setting: [
    'lore.type.worldRule',
    'lore.type.powerSystem',
    'lore.type.faction',
    'lore.type.location',
    'lore.type.history',
    'lore.type.culture',
    'lore.type.term',
  ],
  characters: [
    'lore.type.protagonist',
    'lore.type.mainCharacter',
    'lore.type.antagonist',
    'lore.type.relationship',
    'lore.type.ensemble',
  ],
}

function entryTypeOptions(category, t) {
  return (ENTRY_TYPE_KEYS[category] || []).map(key => t(key))
}

function SectionSwitch({ active, onChange, t }) {
  return (
    <div className="lore-workspace-switch" role="tablist" aria-label={t('lore.categories')}>
      {[
        ['story_bible', t('lore.storyBible')],
        ['world_setting', t('lore.world')],
        ['characters', t('lore.characters')],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`lore-workspace-chip ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function splitList(value) {
  return String(value || '')
    .split(/[,，、\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function entryMatches(entry, query) {
  if (!query.trim()) return true
  const needle = query.trim().toLowerCase()
  return [
    entry.title,
    entry.entry_type,
    entry.content,
    ...(entry.tags || []),
    ...(entry.aliases || []),
  ].join('\n').toLowerCase().includes(needle)
}

function statusLabel(status, t) {
  if (status === 'draft') return t('lore.statusDraft')
  if (status === 'deprecated') return t('lore.statusDeprecated')
  return t('lore.statusConfirmed')
}

function newEntry(category, t) {
  const suggestedTypes = entryTypeOptions(category, t)
  return {
    id: `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    entry_type: suggestedTypes[0] || t('lore.defaultWorldType'),
    status: 'draft',
    tags: [],
    aliases: [],
    content: '',
    updated_at: '',
  }
}

function groupEntries(entries, category, t) {
  const groups = new Map()
  const controlledTypes = new Set(entryTypeOptions(category, t))
  for (const entry of entries) {
    const rawType = entry.entry_type?.trim() || ''
    const key = category === 'characters' && !controlledTypes.has(rawType)
      ? t('lore.defaultCharacterType')
      : rawType
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return [...groups.entries()]
}

function EntryEditor({ draft, category, onChange, onCancel, onSave, saving, t }) {
  const typeListId = `lore-entry-types-${category}`
  const typeOptions = entryTypeOptions(category, t)
  return (
    <div className="lore-entry-editor">
      <div className="lore-entry-editor-grid">
        <label className="lore-editor-field lore-editor-title">
          <span>{t('lore.entryTitle')}</span>
          <input
            value={draft.title}
            onChange={event => onChange({ ...draft, title: event.target.value })}
            placeholder={t('lore.entryTitlePlaceholder')}
            autoFocus
          />
        </label>
        <label className="lore-editor-field">
          <span>{t('lore.entryType')}</span>
          <input
            list={typeListId}
            value={draft.entry_type}
            onChange={event => onChange({ ...draft, entry_type: event.target.value })}
            placeholder={t('lore.entryTypePlaceholder')}
          />
          <datalist id={typeListId}>
            {typeOptions.map(option => <option key={option} value={option} />)}
          </datalist>
        </label>
        <label className="lore-editor-field">
          <span>{t('lore.status')}</span>
          <select
            value={draft.status}
            onChange={event => onChange({ ...draft, status: event.target.value })}
          >
            <option value="draft">{t('lore.statusDraft')}</option>
            <option value="confirmed">{t('lore.statusConfirmed')}</option>
            <option value="deprecated">{t('lore.statusDeprecated')}</option>
          </select>
        </label>
        <label className="lore-editor-field">
          <span>{t('lore.tags')}</span>
          <input
            value={(draft.tags || []).join('、')}
            onChange={event => onChange({ ...draft, tags: splitList(event.target.value) })}
            placeholder={t('lore.tagsPlaceholder')}
          />
        </label>
        <label className="lore-editor-field">
          <span>{t('lore.aliases')}</span>
          <input
            value={(draft.aliases || []).join('、')}
            onChange={event => onChange({ ...draft, aliases: splitList(event.target.value) })}
            placeholder={t('lore.aliasesPlaceholder')}
          />
        </label>
      </div>
      <label className="lore-editor-field lore-editor-content">
        <span>{t('lore.content')}</span>
        <textarea
          value={draft.content}
          onChange={event => onChange({ ...draft, content: event.target.value })}
          placeholder={t('lore.contentPlaceholder')}
        />
      </label>
      <div className="lore-editor-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          <X size={14} /> {t('lore.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving || !draft.title.trim()}
        >
          <Save size={14} /> {saving ? t('lore.saving') : t('lore.save')}
        </button>
      </div>
    </div>
  )
}

function EntryReader({ entry, onEdit, onDelete, t }) {
  if (!entry) {
    return <div className="lore-workspace-empty">{t('lore.selectEntry')}</div>
  }

  return (
    <article className={`lore-entry-reader ${entry.status === 'deprecated' ? 'deprecated' : ''}`}>
      <header className="lore-entry-reader-head">
        <div>
          <div className="lore-entry-type">{entry.entry_type}</div>
          <h3>{entry.title}</h3>
        </div>
        <div className="lore-entry-actions">
          <button type="button" className="btn-icon" onClick={onEdit} title={t('lore.edit')} aria-label={t('lore.edit')}>
            <Pencil size={14} />
          </button>
          <button type="button" className="btn-icon danger" onClick={onDelete} title={t('lore.delete')} aria-label={t('lore.delete')}>
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      <div className="lore-entry-meta">
        <span className={`lore-status lore-status-${entry.status}`}>
          {entry.status === 'confirmed' && <Check size={10} />}
          {statusLabel(entry.status, t)}
        </span>
        {(entry.aliases || []).length > 0 && (
          <span>{t('lore.aliasesPrefix')}{entry.aliases.join('、')}</span>
        )}
      </div>
      {(entry.tags || []).length > 0 && (
        <div className="lore-entry-tags">
          {entry.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
      )}
      {(entry.source_refs || []).length > 0 && (
        <div className="lore-entry-sources">
          <span>{t('lore.sources')}</span>
          {entry.source_refs.map((source, index) => (
            <span key={`${source.source_name}-${source.source_section || ''}-${index}`}>
              {source.source_name}
              {source.source_section ? ` · ${source.source_section}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="lore-entry-content markdown-chat">
        {entry.content
          ? <MarkdownContent>{entry.content}</MarkdownContent>
          : <span className="lore-workspace-muted">{t('lore.noContent')}</span>}
      </div>
    </article>
  )
}

export function LoreWorkspace({ currentBook, dataVersion, addToast, onDataChanged }) {
  const { t } = useI18n()
  const bookId = currentBook?.book_id || currentBook?.id
  const [activeSection, setActiveSection] = useState('world_setting')
  const [lore, setLore] = useState(emptyLore)
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const loadLore = useCallback(async () => {
    if (!bookId) {
      setLore(emptyLore)
      setError(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(false)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/lore`)
      if (!response.ok) throw new Error('lore load failed')
      const data = await response.json()
      setLore({
        story_bible: data?.story_bible || emptyDocument('story_bible'),
        world_setting: data?.world_setting || emptyDocument('world_setting'),
        characters: data?.characters || emptyDocument('characters'),
      })
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    window.setTimeout(() => {
      if (!cancelled) loadLore()
    }, 0)
    return () => { cancelled = true }
  }, [dataVersion, loadLore])

  const currentDocument = lore[activeSection] || emptyDocument(activeSection)
  const filteredEntries = useMemo(
    () => currentDocument.entries.filter(entry => entryMatches(entry, query)),
    [currentDocument.entries, query],
  )
  const groupedEntries = useMemo(
    () => groupEntries(filteredEntries, activeSection, t),
    [activeSection, filteredEntries, t],
  )
  const selectedEntry = currentDocument.entries.find(entry => entry.id === selectedId)
    || filteredEntries[0]
    || null

  useEffect(() => {
    if (!selectedEntry && selectedId) setSelectedId('')
    if (selectedEntry && selectedEntry.id !== selectedId) setSelectedId(selectedEntry.id)
  }, [selectedEntry, selectedId])

  const switchSection = (section) => {
    setActiveSection(section)
    setSelectedId('')
    setEditing(null)
    setQuery('')
  }

  const persistDocument = async (document, successMessage) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/v1/books/${bookId}/lore/${activeSection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      })
      if (response.status === 409) {
        await loadLore()
        setEditing(null)
        addToast?.(t('lore.conflict'), 'error')
        return null
      }
      if (!response.ok) throw new Error('lore save failed')
      const saved = await response.json()
      setLore(current => ({ ...current, [activeSection]: saved }))
      onDataChanged?.()
      addToast?.(successMessage, 'success')
      return saved
    } catch {
      addToast?.(t('lore.saveFailed'), 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const saveEntry = async () => {
    if (!editing?.title?.trim()) return
    const entry = {
      ...editing,
      title: editing.title.trim(),
      entry_type: editing.entry_type.trim() || (
        entryTypeOptions(activeSection, t)[0] || t('lore.defaultWorldType')
      ),
      tags: [...new Set(editing.tags || [])],
      aliases: [...new Set(editing.aliases || [])],
      updated_at: new Date().toISOString(),
    }
    const exists = currentDocument.entries.some(item => item.id === entry.id)
    const next = {
      ...currentDocument,
      entries: exists
        ? currentDocument.entries.map(item => item.id === entry.id ? entry : item)
        : [...currentDocument.entries, entry],
    }
    const saved = await persistDocument(next, t('lore.saved'))
    if (saved) {
      setSelectedId(entry.id)
      setEditing(null)
    }
  }

  const deleteEntry = async () => {
    if (!selectedEntry || !window.confirm(t('lore.deleteConfirm').replace('{title}', selectedEntry.title))) return
    const next = {
      ...currentDocument,
      entries: currentDocument.entries.filter(entry => entry.id !== selectedEntry.id),
    }
    const saved = await persistDocument(next, t('lore.deleted'))
    if (saved) {
      setSelectedId(saved.entries[0]?.id || '')
      setEditing(null)
    }
  }

  if (!bookId) {
    return <div className="lore-workspace-empty">{t('lore.selectBook')}</div>
  }

  return (
    <div className="lore-workspace">
      <header className="lore-workspace-head">
        <div>
          <div className="lore-workspace-kicker">{currentBook?.title || currentBook?.book_id}</div>
          <h2>{t('lore.title')}</h2>
        </div>
        <SectionSwitch active={activeSection} onChange={switchSection} t={t} />
      </header>

      <div className="lore-workspace-toolbar">
        <label className="lore-search">
          <Search size={13} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('lore.search')}
          />
        </label>
        <span className="lore-entry-count">
          {t('lore.entryCount').replace('{count}', String(currentDocument.entries.length))}
        </span>
        <button
          type="button"
          className="btn-icon lore-add-entry"
          onClick={() => setEditing(newEntry(activeSection, t))}
          title={t('lore.add')}
          aria-label={t('lore.add')}
        >
          <Plus size={15} />
        </button>
      </div>

      {loading ? (
        <div className="lore-workspace-empty">{t('lore.loading')}</div>
      ) : error ? (
        <div className="lore-workspace-empty">{t('lore.loadFailed')}</div>
      ) : (
        <div className="lore-workspace-body">
          <nav className="lore-entry-index" aria-label={t('lore.entryIndex')}>
            {groupedEntries.map(([group, entries]) => (
              <div className="lore-entry-group" key={group || 'ungrouped'}>
                <div className="lore-entry-group-label">
                  {group || t('lore.uncategorized')}
                  <span>{entries.length}</span>
                </div>
                {entries.map(entry => (
                  <button
                    type="button"
                    key={entry.id}
                    className={`lore-entry-index-item ${selectedEntry?.id === entry.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedId(entry.id)
                      setEditing(null)
                    }}
                  >
                    <span className="lore-entry-index-title">{entry.title}</span>
                    <span className="lore-entry-index-meta">
                      {entry.entry_type} · {statusLabel(entry.status, t)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filteredEntries.length === 0 && (
              <div className="lore-entry-index-empty">
                {query ? t('lore.noSearchResults') : t('lore.noEntries')}
              </div>
            )}
          </nav>

          <section className="lore-workspace-panel">
            {editing ? (
              <EntryEditor
                draft={editing}
                category={activeSection}
                onChange={setEditing}
                onCancel={() => setEditing(null)}
                onSave={saveEntry}
                saving={saving}
                t={t}
              />
            ) : (
              <EntryReader
                entry={selectedEntry}
                onEdit={() => selectedEntry && setEditing({ ...selectedEntry })}
                onDelete={deleteEntry}
                t={t}
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
