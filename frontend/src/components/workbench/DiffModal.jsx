// Task 16 — DiffModal: view Agent's just-made change.
// Intentionally avoids a real diff algorithm (no deps); renders both sides
// line-by-line and tints lines whose index content differs.
export function DiffModal({ open, oldText, newText, onClose }) {
  if (!open) return null
  const oldLines = (oldText ?? '').split('\n')
  const newLines = (newText ?? '').split('\n')
  const max = Math.max(oldLines.length, newLines.length)
  // Pad the shorter side so the loop renders a symmetric grid.
  while (oldLines.length < max) oldLines.push('')
  while (newLines.length < max) newLines.push('')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal diff-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '90vw', width: 960, maxHeight: '80vh', overflow: 'auto' }}
      >
        <h3 className="display-heading">Agent 的改动</h3>
        <div className="epigraph">左：上一版（备份） · 右：新版</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <pre style={{ background: 'var(--bg)', padding: 10, whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>
            {oldLines.map((l, i) => (
              <div
                key={i}
                style={{ background: l !== newLines[i] ? 'rgba(138,46,26,0.08)' : 'transparent' }}
              >
                {l || '\u00a0'}
              </div>
            ))}
          </pre>
          <pre style={{ background: 'var(--bg)', padding: 10, whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>
            {newLines.map((l, i) => (
              <div
                key={i}
                style={{ background: l !== oldLines[i] ? 'rgba(45,90,61,0.1)' : 'transparent' }}
              >
                {l || '\u00a0'}
              </div>
            ))}
          </pre>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
