import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { isThemeId } from '../theme/palettes'

function nextThemeFor(current, requested) {
  if (isThemeId(requested)) return requested
  return current === 'ink' ? 'mist' : 'ink'
}

function themeTransitionOrigin(event) {
  const target = event?.currentTarget
  const rect = target?.getBoundingClientRect?.()
  if (rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }
}

function writeThemeTransitionOrigin(event) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const { x, y } = themeTransitionOrigin(event)
  document.documentElement.style.setProperty('--theme-transition-x', `${x}px`)
  document.documentElement.style.setProperty('--theme-transition-y', `${y}px`)
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('autonovel-theme') || localStorage.getItem('inkflow-theme')
    if (isThemeId(saved)) return saved
    if (saved === 'dark') return 'ink'
    return 'ink'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('inkflow-theme', theme)
    localStorage.setItem('autonovel-theme', theme)
  }, [theme])

  const toggle = (nextTheme, event) => {
    const targetTheme = nextThemeFor(theme, nextTheme)
    if (targetTheme === theme) return

    writeThemeTransitionOrigin(event)

    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Point-origin circular reveal (clip-path keyframes in index.css, anchored at the
    // clicked swatch via --theme-transition-x/y). Skipped when the engine lacks View
    // Transitions or the user prefers reduced motion. (Previously disabled for the
    // Tauri/WKWebView desktop, whose compositor snapshotted the live WebGL backdrop
    // poorly; the desktop is now Electron/Chromium where it's smooth, and the cached
    // BackdropLayer keeps the target theme's surface ready so the reveal is clean.)
    if (prefersReduced || typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
      setTheme(targetTheme)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => setTheme(targetTheme))
    })
  }
  return [theme, toggle, setTheme]
}
