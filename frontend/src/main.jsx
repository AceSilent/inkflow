import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import { I18nProvider } from './i18n/index.jsx'
import App from './App.jsx'
import { installApiFetch } from './api/fetch'

installApiFetch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
