import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

const iconMap = { success: CheckCircle, warning: AlertTriangle, error: XCircle, info: Info }

export function useToast() {
  const [toasts, setToasts] = useState([])
  let idCounter = 0

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + (idCounter++)
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map(t => {
        const Icon = iconMap[t.type] || Info
        return (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon />
            <div className="toast-content"><div className="toast-msg">{t.msg}</div></div>
            <button className="btn-icon" style={{ width: 20, height: 20, flexShrink: 0 }} onClick={() => onRemove(t.id)}><X size={12} /></button>
          </div>
        )
      })}
    </div>
  )
}
