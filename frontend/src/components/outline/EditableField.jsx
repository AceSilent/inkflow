import { useState, useRef, useEffect } from 'react'

/**
 * EditableField — reusable inline editor.
 *
 * Click the display span to enter edit mode. Enter commits (single-line) or
 * Ctrl/Cmd+Enter (multi-line). Escape cancels. Blur commits. Empty value
 * renders a muted italic placeholder.
 */
export function EditableField({
  value,
  onSave,
  placeholder,
  multiline = false,
  className = '',
  style,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  // Track the last `value` prop we synced from; if it changes while we're not
  // editing, reset the draft. This is React's recommended "adjust state on
  // prop change" pattern — done during render, cheaper than an effect.
  const [lastValue, setLastValue] = useState(value ?? '')
  if (!editing && lastValue !== (value ?? '')) {
    setLastValue(value ?? '')
    setDraft(value ?? '')
  }
  const ref = useRef(null)

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      if (!multiline && typeof ref.current.select === 'function') {
        ref.current.select()
      }
    }
  }, [editing, multiline])

  const finish = () => {
    setEditing(false)
    if (draft !== (value ?? '')) onSave?.(draft)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value ?? '')
  }

  const onKey = (e) => {
    if (multiline) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        finish()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    } else {
      if (e.key === 'Enter') {
        e.preventDefault()
        finish()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
  }

  const isEmpty = !value || (typeof value === 'string' && value.trim() === '')

  if (!editing) {
    return (
      <span
        className={`editable-display ${className} ${isEmpty ? 'empty' : ''}`.trim()}
        style={style}
        onClick={() => setEditing(true)}
        title="点击编辑"
      >
        {isEmpty ? (placeholder ?? '— 点此添加 —') : value}
      </span>
    )
  }

  if (multiline) {
    const rows = Math.max(3, (draft.match(/\n/g)?.length ?? 0) + 2)
    return (
      <textarea
        ref={ref}
        className={`editable-input ${className}`.trim()}
        style={style}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={rows}
      />
    )
  }

  return (
    <input
      ref={ref}
      type="text"
      className={`editable-input ${className}`.trim()}
      style={style}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={onKey}
      placeholder={placeholder}
    />
  )
}
