export const LIBRARY_COLLAPSED_STORAGE_KEY = 'inkflow.libraryCollapsed'

function readStore(store, key) {
  if (store instanceof Map) return store.get(key) ?? null
  return store.getItem(key)
}

function writeStore(store, key, value) {
  if (store instanceof Map) store.set(key, value)
  else store.setItem(key, value)
}

export function loadLibraryCollapsed(store = window.localStorage) {
  try {
    return readStore(store, LIBRARY_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveLibraryCollapsed(collapsed, store = window.localStorage) {
  const normalized = Boolean(collapsed)
  writeStore(store, LIBRARY_COLLAPSED_STORAGE_KEY, String(normalized))
  return normalized
}
