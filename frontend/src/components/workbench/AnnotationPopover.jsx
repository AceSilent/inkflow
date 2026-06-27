// Small popover anchored to a selected editor range; the parent owns absolute
// positioning inside the relatively positioned `.workbench-editor` container.
import { useState } from 'react'
import { Clock3, Send, X } from 'lucide-react'

export function AnnotationPopover({ anchor, selectedText, onCancel, onQueue, onSendNow }) {
  const [comment, setComment] = useState('')
  if (!anchor) return null
  const submitQueue = () => onQueue?.(comment)
  const submitNow = () => onSendNow?.(comment)

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
      <div className="popover-title">问作者</div>
      <div className="popover-quote">“{selectedText}”</div>
      <textarea
        className="popover-textarea"
        placeholder="想让作者怎么看这段？不填也可以。"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="popover-actions">
        <button onClick={onCancel} title="取消" aria-label="取消"><X size={12} /></button>
        <button
          onClick={submitQueue}
        >
          <Clock3 size={12} /> 先加入待处理
        </button>
        <button
          className="primary"
          onClick={submitNow}
        >
          <Send size={12} /> 立即问作者
        </button>
      </div>
    </div>
  )
}
