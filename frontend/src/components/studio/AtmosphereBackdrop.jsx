import { useEffect, useRef } from 'react'
import { getBackdropInit, DEFAULT_BACKDROP_THEME } from './backdrops'
import { clearColorCache, REDUCED_MOTION_QUERY } from './backdrops/colorTokens'
import { useBackdropIntensity } from '../../hooks/useBackdropIntensity'

const VALID_THEMES = ['ink', 'mist', 'paper', 'graphite']

function resolveTheme(explicit) {
  if (VALID_THEMES.includes(explicit)) return explicit
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (VALID_THEMES.includes(attr)) return attr
  }
  return DEFAULT_BACKDROP_THEME
}

// Single mounted backdrop. Picks the per-theme animation implementation, owns the
// rAF lifecycle (DPR≤2, document.hidden pause, prefers-reduced-motion static frame,
// ResizeObserver), and rebuilds cleanly on theme change. Intensity comes from the
// useBackdropIntensity hook; `intensity` prop overrides it when provided.
export function AtmosphereBackdrop({ theme, intensity }) {
  const canvasRef = useRef(null)
  const ctx = useBackdropIntensity()
  const activeIntensity = intensity || ctx.intensity || 'medium'

  // Latest intensity in a ref so the per-frame getParams() reads it without
  // re-initializing the controller on every change. Synced in an effect (never
  // mutated during render).
  const intensityRef = useRef(activeIntensity)
  useEffect(() => {
    intensityRef.current = activeIntensity
  }, [activeIntensity])

  // Resolve the theme to a stable string so the effect only re-runs on real changes.
  const resolvedTheme = resolveTheme(theme)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const reducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null

    // Tokens are static per theme, but a theme swap reuses the same custom-property
    // names — clear the parse cache so palettes are re-read for the new theme.
    clearColorCache()

    const initFn = getBackdropInit(resolvedTheme)
    const getParams = () => intensityRef.current
    let controller = null
    try {
      controller = initFn(canvas, getParams)
    } catch (err) {
      console.warn('AtmosphereBackdrop init failed:', err)
      controller = null
    }
    // No GL/2D context (or compile failure): leave the CSS fallback gradient showing.
    if (!controller) return undefined

    let animationFrame = 0
    let lastNow = 0

    const shouldReduceMotion = () => reducedMotion?.matches === true

    const frame = (now) => {
      animationFrame = 0
      const dt = lastNow ? (now - lastNow) / 1000 : 0
      lastNow = now
      controller.frame(dt)
      schedule()
    }

    function schedule() {
      if (animationFrame || document.hidden || shouldReduceMotion()) return
      animationFrame = window.requestAnimationFrame(frame)
    }

    function stop() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
      lastNow = 0
    }

    function renderOnce() {
      if (shouldReduceMotion()) controller.renderStatic()
      else controller.frame(0)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        lastNow = 0
        schedule()
      }
    }

    const handleReducedMotionChange = () => {
      stop()
      if (shouldReduceMotion()) {
        controller.renderStatic()
      } else {
        schedule()
      }
    }

    const handleResize = () => {
      controller.resize(shouldReduceMotion())
      renderOnce()
    }

    // ResizeObserver catches canvas box changes (grid/sidebar reflow); the window
    // resize listener additionally catches DPR-only changes (e.g. moving monitors).
    const resizeObserver = new ResizeObserver(handleResize)

    // Initial paint.
    controller.resize(shouldReduceMotion())
    resizeObserver.observe(canvas)
    if (shouldReduceMotion()) {
      controller.renderStatic()
    } else {
      controller.frame(0)
      schedule()
    }

    reducedMotion?.addEventListener?.('change', handleReducedMotionChange)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('resize', handleResize)

    return () => {
      stop()
      resizeObserver.disconnect()
      reducedMotion?.removeEventListener?.('change', handleReducedMotionChange)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('resize', handleResize)
      try {
        controller.destroy()
      } catch (err) {
        console.warn('AtmosphereBackdrop destroy failed:', err)
      }
    }
  }, [resolvedTheme])

  return (
    <div className="atmosphere-backdrop" data-theme={resolvedTheme} aria-hidden="true">
      <canvas ref={canvasRef} className="atmosphere-backdrop__canvas" />
    </div>
  )
}
