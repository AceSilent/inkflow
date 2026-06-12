import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Persisted, localStorage-backed (mirrors useTheme.js — deliberately NOT a backend
// setting). The studio backdrop reads intensity through this hook; a later settings
// UI flips it via setIntensity. Stable API: { intensity, setIntensity, INTENSITY_OPTIONS }.

const STORAGE_KEY = 'inkflow-backdrop-intensity'
const DEFAULT_INTENSITY = 'medium'

// Order matters: rendered left→right in the (future) segmented control.
export const INTENSITY_OPTIONS = [
  { value: 'subtle', labelKey: 'settings.backdropSubtle', label: '含蓄' },
  { value: 'medium', labelKey: 'settings.backdropMedium', label: '适中' },
  { value: 'rich', labelKey: 'settings.backdropRich', label: '浓郁' },
]

const VALID = new Set(INTENSITY_OPTIONS.map(o => o.value))

export function isBackdropIntensity(value) {
  return VALID.has(value)
}

function readStoredIntensity() {
  if (typeof localStorage === 'undefined') return DEFAULT_INTENSITY
  const saved = localStorage.getItem(STORAGE_KEY)
  return isBackdropIntensity(saved) ? saved : DEFAULT_INTENSITY
}

const BackdropIntensityContext = createContext(null)

export function BackdropIntensityProvider({ children }) {
  const [intensity, setIntensityState] = useState(readStoredIntensity)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, intensity)
  }, [intensity])

  const setIntensity = useCallback((next) => {
    if (!isBackdropIntensity(next)) return
    setIntensityState(next)
  }, [])

  const value = useMemo(
    () => ({ intensity, setIntensity, INTENSITY_OPTIONS }),
    [intensity, setIntensity],
  )

  // createElement (not JSX) keeps this a plain .js module — the Vite/eslint setup
  // only transforms JSX inside .jsx files.
  return createElement(BackdropIntensityContext.Provider, { value }, children)
}

export function useBackdropIntensity() {
  const ctx = useContext(BackdropIntensityContext)
  if (ctx) return ctx
  // Fallback for trees not wrapped in the provider (e.g. isolated tests): a stable,
  // read-only default so consumers never crash on a missing provider.
  return { intensity: DEFAULT_INTENSITY, setIntensity: () => {}, INTENSITY_OPTIONS }
}

export { STORAGE_KEY as BACKDROP_INTENSITY_STORAGE_KEY, DEFAULT_INTENSITY as DEFAULT_BACKDROP_INTENSITY }
