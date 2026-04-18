export function UnresolvedSetupsPopover({ open, items, onJumpToNode, onClose }) {
  if (!open) return null
  const list = Array.isArray(items) ? items : []
  return (
    <div className="unresolved-popover">
      <div className="popover-head">
        <span className="label-sc" style={{ color: 'var(--accent)' }}>
          未回收伏笔（{list.length}）
        </span>
        <button onClick={onClose} aria-label="close">×</button>
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>没有未回收伏笔</div>
      )}
      {list.map(it => (
        <div
          key={it.id}
          className="unresolved-item"
          onClick={() => onJumpToNode && onJumpToNode(it.id)}
        >
          <div className="label-sc" style={{ color: 'var(--accent)' }}>
            {it.references?.[0] ?? '?'}
          </div>
          <div style={{ fontWeight: 500 }}>{it.title}</div>
          {it.description && (
            <div style={{ fontSize: 10, color: 'var(--ink-secondary)', marginTop: 2 }}>
              {it.description}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
