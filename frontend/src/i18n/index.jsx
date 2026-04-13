import { useState, useCallback } from 'react'
import { locales, defaultLocale } from './locales'
import { I18nContext } from './context'

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('autonovel-lang') || defaultLocale)

  const t = useCallback((key) => {
    return locales[lang]?.[key] || locales[defaultLocale]?.[key] || key
  }, [lang])

  const switchLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'zh' ? 'en' : 'zh'
      localStorage.setItem('autonovel-lang', next)
      return next
    })
  }, [])

  return (
    <I18nContext.Provider value={{ lang, t, switchLang }}>
      {children}
    </I18nContext.Provider>
  )
}
