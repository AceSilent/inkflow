import { useState, useEffect } from 'react'
import { isThemeId } from '../theme/palettes'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('autonovel-theme') || localStorage.getItem('inkflow-theme')
    if (isThemeId(saved)) return saved
    if (saved === 'dark') return 'ink'
    return 'mist'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('inkflow-theme', theme)
    localStorage.setItem('autonovel-theme', theme)
  }, [theme])

  const toggle = (nextTheme) => {
    if (isThemeId(nextTheme)) {
      setTheme(nextTheme)
      return
    }
    setTheme(t => t === 'ink' ? 'mist' : 'ink')
  }
  return [theme, toggle, setTheme]
}
