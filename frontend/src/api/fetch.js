const DEFAULT_SIDECAR_API = 'http://127.0.0.1:3001'

function cleanBase(base) {
  return (base || '').replace(/\/$/, '')
}

export function isTauriRuntime() {
  if (typeof window === 'undefined') return false
  return window.location?.protocol === 'tauri:' || Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
}

export function apiBase(options = {}) {
  if (options.apiBase !== undefined) return cleanBase(options.apiBase)
  const envBase = import.meta.env?.VITE_INKFLOW_API_BASE
  if (envBase) return cleanBase(envBase)
  const tauri = options.isTauri ?? isTauriRuntime()
  return tauri ? DEFAULT_SIDECAR_API : ''
}

export function resolveApiUrl(input, options = {}) {
  if (typeof input !== 'string') return input
  if (!input.startsWith('/api/')) return input
  const base = apiBase(options)
  return base ? `${base}${input}` : input
}

export function installApiFetch() {
  if (typeof window === 'undefined' || window.__inkflowApiFetchInstalled) return
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => nativeFetch(resolveApiUrl(input), init)
  window.__inkflowApiFetchInstalled = true
}
