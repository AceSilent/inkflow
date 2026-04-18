export function ApprovalConfirmModal({ open, unresolvedCount, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal approval-modal" onClick={e => e.stopPropagation()}>
        <h3 className="display-heading">确定通过？</h3>
        <p className="epigraph">
          还有 <strong style={{ color: 'var(--accent)' }}>{unresolvedCount}</strong> 条未处理批注。
          通过后这些批注将保留但不再参与判断。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn primary" onClick={onConfirm}>确定通过</button>
        </div>
      </div>
    </div>
  )
}
