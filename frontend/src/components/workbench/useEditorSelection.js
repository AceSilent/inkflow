import { useEffect, useState } from 'react'

export function useEditorSelection(editorSelector = '.workbench-editor') {
  const [selection, setSelection] = useState(null)

  useEffect(() => {
    let pointerSelecting = false
    let ignoreSelectionChangesUntil = 0

    function updateSelectionFromWindow() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null)
        return
      }
      const range = sel.getRangeAt(0)
      const editorEl = document.querySelector(editorSelector)
      if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) {
        setSelection(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const editorRect = editorEl.getBoundingClientRect()
      setSelection({
        text: sel.toString(),
        start: 0,
        end: 0,
        anchor: {
          x: rect.left - editorRect.left,
          y: rect.bottom - editorRect.top + 4,
        },
      })
    }

    function onSelectionChange() {
      if (Date.now() < ignoreSelectionChangesUntil) return
      if (document.activeElement?.closest?.('.annotation-popover')) return
      if (pointerSelecting) return
      updateSelectionFromWindow()
    }

    function onPointerDown(event) {
      const editorEl = document.querySelector(editorSelector)
      if (event.target.closest?.('.annotation-popover')) return
      if (!editorEl || !editorEl.contains(event.target)) return
      pointerSelecting = true
      setSelection(null)
    }

    function onPointerUp() {
      if (!pointerSelecting) return
      pointerSelecting = false
      ignoreSelectionChangesUntil = Date.now() + 300
      updateSelectionFromWindow()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [editorSelector])

  return { selection, setSelection }
}
