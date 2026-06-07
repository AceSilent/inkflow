export function resolveRestoredBookSelection({
  books,
  savedBookId,
  selectedNodeId,
  selectedBookId,
}) {
  const restored = books.find(node => node.id === savedBookId)
    || (!selectedBookId && !selectedNodeId ? books[books.length - 1] : null)

  if (!restored) return { restored: null, nextSelectedNodeId: selectedNodeId }
  if (selectedBookId === restored.id) return { restored: null, nextSelectedNodeId: selectedNodeId }

  return { restored, nextSelectedNodeId: restored.id }
}
