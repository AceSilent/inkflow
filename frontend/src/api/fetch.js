function cleanBase(base) {
  return (base || '').replace(/\/$/, '')
}

// In the Electron desktop app, preload.cjs exposes the sidecar base via
// window.__INKFLOW_DESKTOP__.apiBase; in web/dev mode there is no base and /api/*
// stays relative (proxied by vite / served same-origin).
export function electronApiBase() {
  if (typeof window === 'undefined') return ''
  return window.__INKFLOW_DESKTOP__?.apiBase || ''
}

export function apiBase(options = {}) {
  if (options.apiBase !== undefined) return cleanBase(options.apiBase)
  const electronBase = electronApiBase()
  if (electronBase) return cleanBase(electronBase)
  const envBase = import.meta.env?.VITE_INKFLOW_API_BASE
  if (envBase) return cleanBase(envBase)
  return ''
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
