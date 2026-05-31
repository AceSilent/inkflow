import { useState } from 'react'

export function AddMemoryModal({ open, onCancel, onSubmit }) {
  const [text, setText] = useState('')
  const [scope, setScope] = useState('user')
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
        <h3 className="display-heading">手动添加记忆</h3>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="label-sc">Scope
            <select value={scope} onChange={e => setScope(e.target.value)}
              style={{ marginLeft: 8, padding: '2px 6px' }}>
              <option value="user">跨项目 / 用户偏好</option>
              <option value="book">本项目</option>
            </select>
          </label>
          <textarea
            className="editable-input"
            placeholder="memory 内容（markdown 可）..."
            value={text} onChange={e => setText(e.target.value)}
            rows={6} autoFocus
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" disabled={!text.trim()} onClick={() => {
            onSubmit({ text: text.trim(), scope })
            setText(''); setScope('user')
          }}>保存</button>
        </div>
      </div>
    </div>
  )
}
