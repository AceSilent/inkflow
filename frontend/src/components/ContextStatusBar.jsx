import { useEffect, useState } from 'react'
import { useI18n } from '../hooks/useI18n'

const TIER_STYLE = {
  green:  { color: 'var(--success)', label: 'OK' },
  yellow: { color: 'var(--warning)', label: 'WARN' },
  orange: { color: '#d07020',        label: 'HIGH' },
  red:    { color: 'var(--danger)',  label: 'FULL' },
}

export function ContextStatusBar({ bookId }) {
  // useI18n kept in the closure so future localized copy (tier labels,
  // banner text) can be swapped in without restructuring the component.
  useI18n()
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!bookId) return
    let timer
    let cancelled = false
    async function poll() {
      try {
        const r = await fetch(`/api/v1/books/${bookId}/debug/context-state`)
        if (r.ok && !cancelled) setState(await r.json())
      } catch { /* transient network error — next poll will retry */ }
      if (!cancelled) timer = setTimeout(poll, 5000)  // every 5s
    }
    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [bookId])

  if (!state?.current_tier) return null

  const tier = state.current_tier
  const style = TIER_STYLE[tier] ?? TIER_STYLE.green
  const pct = ((state.current_ratio ?? 0) * 100).toFixed(0)

  return (
    <div className="context-status-bar" style={{ color: style.color }}>
      <span>{style.label} · Context · {pct}% used · {state.tokens_used}/{state.window_size} tokens</span>
      {tier === 'red' && (
        <span className="context-red-banner">
          Context 已达 100%。下一轮将强制 compact。
          {state.breaker_tripped && ' 熔断已触发——请前往 Settings 手动重置。'}
        </span>
      )}
    </div>
  )
}
