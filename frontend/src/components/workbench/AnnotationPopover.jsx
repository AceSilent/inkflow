// Task 13 — small popover that appears near a text selection in the editor
// and lets the user attach a comment. Positioned absolutely inside a
// relatively-positioned `.workbench-editor` container by the parent.
import { useState } from 'react'
import { X, Check } from 'lucide-react'

export function AnnotationPopover({ anchor, selectedText, onCancel, onSubmit }) {
  const [comment, setComment] = useState('')
  if (!anchor) return null

  return (
    <div
      className="annotation-popover"
      style={{
        position: 'absolute',
        top: anchor.y,
        left: anchor.x,
        zIndex: 100,
      }}
    >
      <div className="popover-quote">“{selectedText}”</div>
      <textarea
        className="popover-textarea"
        placeholder="批注..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="popover-actions">
        <button onClick={onCancel}><X size={12} /></button>
        <button
          className="primary"
          disabled={!comment.trim()}
          onClick={() => onSubmit(comment)}
        >
          <Check size={12} /> 保存
        </button>
      </div>
    </div>
  )
}
