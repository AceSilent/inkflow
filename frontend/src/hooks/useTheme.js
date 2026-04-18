import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('autonovel-theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('autonovel-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  return [theme, toggle]
}
