import { useState, useCallback } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'

const LINE_TYPES = [
  { value: 'dialogue', label: '对话', color: '#3b82f6' },
  { value: 'narration', label: '旁白', color: '#6b7280' },
  { value: 'action', label: '动作', color: '#f59e0b' },
  { value: 'thought', label: '心声', color: '#8b5cf6' },
]

function LineRow({ line, index, onChange, onDelete }) {
  const [dirOpen, setDirOpen] = useState(false)
  const typeInfo = LINE_TYPES.find(t => t.value === (line.type || 'narration')) || LINE_TYPES[1]

  const update = (field, value) => {
    onChange(index, { ...line, [field]: value })
  }

  return (
    <div className="script-line-row">
      <div className="script-line-grip"><GripVertical size={14} /></div>
      <select
        className="script-line-type"
        value={line.type || 'narration'}
        onChange={e => update('type', e.target.value)}
        style={{ borderLeftColor: typeInfo.color }}
      >
        {LINE_TYPES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      {(line.type === 'dialogue' || line.type === 'thought') && (
        <input
          className="script-line-speaker"
          placeholder="说话人"
          value={line.speaker || ''}
          onChange={e => update('speaker', e.target.value)}
        />
      )}
      <textarea
        className="script-line-text"
        placeholder="台词/旁白..."
        value={line.text || ''}
        onChange={e => update('text', e.target.value)}
        rows={1}
      />
      {(line.type === 'dialogue' || line.type === 'thought') && (
        <input
          className="script-line-emotion"
          placeholder="情绪"
          value={line.emotion || ''}
          onChange={e => update('emotion', e.target.value)}
        />
      )}
      <button
        className="script-line-dir-toggle"
        onClick={() => setDirOpen(!dirOpen)}
        title="演出指示"
      >
        {dirOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <button className="script-line-delete" onClick={() => onDelete(index)} title="删除">
        <Trash2 size={14} />
      </button>
      {dirOpen && (
        <div className="script-line-direction">
          <label>BGM <input value={line.direction?.bgm || ''} onChange={e => update('direction', { ...line.direction, bgm: e.target.value })} /></label>
          <label>SFX <input value={line.direction?.sfx || ''} onChange={e => update('direction', { ...line.direction, sfx: e.target.value })} /></label>
          <label>BG <input value={line.direction?.bg || ''} onChange={e => update('direction', { ...line.direction, bg: e.target.value })} /></label>
        </div>
      )}
    </div>
  )
}

export function ScriptEditor({ lines = [], onChange, stageId }) {
  const handleLineChange = useCallback((index, updated) => {
    const next = [...lines]
    next[index] = updated
    onChange(next)
  }, [lines, onChange])

  const handleDelete = useCallback((index) => {
    onChange(lines.filter((_, i) => i !== index))
  }, [lines, onChange])

  const handleAdd = useCallback((type = 'dialogue') => {
    onChange([...lines, { text: '', type, speaker: '' }])
  }, [lines, onChange])

  return (
    <div className="script-editor">
      <div className="script-editor-header">
        <span className="script-editor-stage">Stage: {stageId || '—'}</span>
        <span className="script-editor-count">{lines.length} lines</span>
      </div>
      <div className="script-editor-lines">
        {lines.map((line, i) => (
          <LineRow key={line.id || i} line={line} index={i} onChange={handleLineChange} onDelete={handleDelete} />
        ))}
      </div>
      <div className="script-editor-actions">
        {LINE_TYPES.map(t => (
          <button key={t.value} onClick={() => handleAdd(t.value)} style={{ borderColor: t.color }}>
            <Plus size={12} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
