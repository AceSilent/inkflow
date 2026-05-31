import { X, Trash2 } from 'lucide-react'
import { EditableField } from '../outline/EditableField'

export function NodeDetailDrawer({ open, node, edges, nodes, onClose, onPatch, onDelete, onEdgeRemove }) {
  if (!open || !node) return null

  const incoming = edges.filter(e => e.to === node.id)
  const outgoing = edges.filter(e => e.from === node.id)

  return (
    <div className="node-drawer">
      <div className="drawer-head">
        <span className="label-sc" style={{ color: 'var(--accent)' }}>{node.type}</span>
        <div style={{ flex: 1 }}>
          <EditableField value={node.title} onSave={v => onPatch({ title: v })} />
        </div>
        <button onClick={onClose}><X size={14} /></button>
      </div>

      <div className="drawer-section">
        <div className="label-sc">描述</div>
        <EditableField
          multiline
          value={node.description}
          onSave={v => onPatch({ description: v })}
          placeholder="— 点此添加 —"
        />
      </div>

      <div className="drawer-section">
        <div className="label-sc">Stage 引用</div>
        <EditableField
          value={(node.references ?? []).join(', ')}
          onSave={v => onPatch({ references: v.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="ch01, ch02"
        />
      </div>

      <div className="drawer-section">
        <div className="label-sc">角色</div>
        <EditableField
          value={(node.characters ?? []).join(', ')}
          onSave={v => onPatch({ characters: v.split(',').map(s => s.trim()).filter(Boolean) })}
          placeholder="林舟, 她"
        />
      </div>

      <div className="drawer-section">
        <div className="label-sc">状态</div>
        <select
          value={node.status}
          onChange={e => onPatch({ status: e.target.value })}
          style={{ padding: '2px 6px', fontFamily: 'var(--font-body)' }}
        >
          {['draft', 'confirmed', 'pruned', 'alternative'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
      </div>

      <div className="drawer-section">
        <div className="label-sc">入边（{incoming.length}）</div>
        {incoming.map(e => {
          const src = nodes[e.from]
          return (
            <div key={e.id} className="drawer-edge">
              <span>{src?.title ?? e.from}</span>
              <span className="label-sc">--{e.type}→</span>
              <button onClick={() => onEdgeRemove(e.id)}><Trash2 size={10} /></button>
            </div>
          )
        })}
      </div>

      <div className="drawer-section">
        <div className="label-sc">出边（{outgoing.length}）</div>
        {outgoing.map(e => {
          const dst = nodes[e.to]
          return (
            <div key={e.id} className="drawer-edge">
              <span className="label-sc">--{e.type}→</span>
              <span>{dst?.title ?? e.to}</span>
              <button onClick={() => onEdgeRemove(e.id)}><Trash2 size={10} /></button>
            </div>
          )
        })}
      </div>

      <div className="drawer-section">
        <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          <Trash2 size={12} /> 删除节点（含相关边）
        </button>
      </div>
    </div>
  )
}
