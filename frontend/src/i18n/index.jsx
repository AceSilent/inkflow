import { createContext, useContext, useState, useCallback } from 'react'
import { locales, defaultLocale } from './locales'

const I18nContext = createContext()

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

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
