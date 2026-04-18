export function RenumberConfirmModal({ open, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="display-heading">整理章节编号？</h3>
        <p className="epigraph">
          此操作会按 outline 顺序把章节 ID 重编为 ch01 / ch02 / ...
          并同步重命名：.md 草稿 / review / chapter_status / annotations / .draft_history。
          同时 plot_graph 的 references 会跟着变。
        </p>
        <p className="epigraph" style={{ color: 'var(--accent)' }}>
          不可撤销（但会备份 .bak）。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>确认整理</button>
        </div>
      </div>
    </div>
  )
}
