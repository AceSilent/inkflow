export const WORKSPACE_MIN_WIDTH = 320
export const WORKSPACE_DEFAULT_WIDTH = 460

export const defaultWorkspaceLayout = {
  collapsed: false,
  width: WORKSPACE_DEFAULT_WIDTH,
  activeTab: 'chapter',
}

export function storageKeyForBook(bookId) {
  return `inkflow.workspaceLayout:${bookId || 'global'}`
}

export function clampWorkspaceWidth(width, viewportWidth = 1440) {
  const max = Math.max(WORKSPACE_MIN_WIDTH, Math.floor(viewportWidth * 0.5))
  return Math.min(max, Math.max(WORKSPACE_MIN_WIDTH, Math.round(Number(width) || WORKSPACE_DEFAULT_WIDTH)))
}

function readStore(store, key) {
  if (store instanceof Map) return store.get(key) ?? null
  return store.getItem(key)
}

function writeStore(store, key, value) {
  if (store instanceof Map) store.set(key, value)
  else store.setItem(key, value)
}

export function loadWorkspaceLayout(bookId, store = window.localStorage) {
  try {
    const raw = readStore(store, storageKeyForBook(bookId))
    if (!raw) return defaultWorkspaceLayout
    const parsed = JSON.parse(raw)
    return {
      collapsed: Boolean(parsed.collapsed),
      width: clampWorkspaceWidth(parsed.width),
      activeTab: ['chapter', 'outline', 'plot'].includes(parsed.activeTab)
        ? parsed.activeTab
        : defaultWorkspaceLayout.activeTab,
    }
  } catch {
    return defaultWorkspaceLayout
  }
}

export function saveWorkspaceLayout(bookId, layout, store = window.localStorage) {
  const normalized = {
    collapsed: Boolean(layout.collapsed),
    width: clampWorkspaceWidth(layout.width),
    activeTab: ['chapter', 'outline', 'plot'].includes(layout.activeTab)
      ? layout.activeTab
      : defaultWorkspaceLayout.activeTab,
  }
  writeStore(store, storageKeyForBook(bookId), JSON.stringify(normalized))
  return normalized
}
