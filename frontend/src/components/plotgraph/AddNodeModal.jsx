import { useState } from 'react'
import { X, Check } from 'lucide-react'

const NODE_TYPE_OPTIONS = [
  { value: 'event', label: 'Event · 事件' },
  { value: 'setup', label: 'Setup · 伏笔' },
  { value: 'payoff', label: 'Payoff · 回收' },
  { value: 'decision', label: 'Decision · 抉择' },
  { value: 'turning_point', label: 'Turning · 转折' },
  { value: 'convergence', label: 'Convergence · 汇合' },
]

export function AddNodeModal({ open, onCancel, onSubmit }) {
  const [type, setType] = useState('event')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [references, setReferences] = useState('')
  const [characters, setCharacters] = useState('')

  if (!open) return null

  const submit = () => {
    if (!title.trim()) return
    onSubmit({
      type,
      title: title.trim(),
      description: description.trim(),
      references: references.split(',').map(s => s.trim()).filter(Boolean),
      characters: characters.split(',').map(s => s.trim()).filter(Boolean),
      status: 'draft',
    })
    // reset
    setTitle(''); setDescription(''); setReferences(''); setCharacters(''); setType('event')
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
        <h3 className="display-heading">新节点</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label className="label-sc">类型
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ marginLeft: 8, padding: '2px 6px', fontFamily: 'var(--font-body)' }}>
              {NODE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <input className="editable-input" placeholder="标题"
            value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea className="editable-input" placeholder="描述（可选）"
            value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          <input className="editable-input" placeholder="关联章节（逗号分隔，如 ch01,ch02）"
            value={references} onChange={e => setReferences(e.target.value)} />
          <input className="editable-input" placeholder="涉及角色（逗号分隔）"
            value={characters} onChange={e => setCharacters(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}><X size={12} /> 取消</button>
          <button className="btn primary" onClick={submit} disabled={!title.trim()}>
            <Check size={12} /> 创建
          </button>
        </div>
      </div>
    </div>
  )
}
