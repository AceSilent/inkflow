import { useEffect, useRef, useState } from 'react'
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

  // On the Tauri desktop's TRANSPARENT WKWebView window, the very first WebGL
  // composite after a cold load can come up transparent (the canvas isn't laid out
  // yet / the window is still settling its compositor), bleeding the desktop through.
  // A manual theme switch fixes it because it tears down and rebuilds the GL context
  // once the window is settled. We reproduce that automatically: bump a nonce a beat
  // after mount so the main effect re-initializes once on a stable window. Harmless
  // in Chrome/Safari (one extra init).
  const [reinitNonce, setReinitNonce] = useState(0)
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    // Two rAFs + a short timeout: wait past first layout/paint AND give the
    // transparent window's compositor time to settle before the corrective re-init.
    const timer = setTimeout(() => {
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setReinitNonce((n) => n + 1))
      })
    }, 180)
    return () => {
      clearTimeout(timer)
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [])

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
    let animationFrame = 0
    let lastNow = 0

    const shouldReduceMotion = () => reducedMotion?.matches === true

    // Show the live canvas only while a working controller exists; otherwise hide it
    // so the backdrop div's opaque var(--bg) shows through. This is critical on the
    // Tauri desktop: the native window is transparent, so a failed or context-lost
    // alpha:false WebGL canvas would otherwise expose the desktop wallpaper instead
    // of a dark background. The div bg is the guaranteed, GPU-independent floor.
    // display:none (not visibility:hidden) fully removes the canvas's GPU surface,
    // which otherwise keeps compositing — and bleeding through the transparent
    // window — even while hidden. With it gone the div's opaque var(--bg) shows.
    const showCanvas = () => { canvas.style.display = '' }
    const hideCanvas = () => { canvas.style.display = 'none' }

    function stop() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
      lastNow = 0
    }

    const frame = (now) => {
      animationFrame = 0
      if (!controller) return
      const dt = lastNow ? (now - lastNow) / 1000 : 0
      lastNow = now
      controller.frame(dt)
      schedule()
    }

    function schedule() {
      if (animationFrame || document.hidden || shouldReduceMotion() || !controller) return
      animationFrame = window.requestAnimationFrame(frame)
    }

    function renderOnce() {
      if (!controller) return
      if (shouldReduceMotion()) controller.renderStatic()
      else controller.frame(0)
    }

    // Build (or rebuild) the controller on the current/restored GL context.
    function setup() {
      try {
        controller = initFn(canvas, getParams)
      } catch (err) {
        console.warn('AtmosphereBackdrop init failed:', err)
        controller = null
      }
      if (!controller) {
        hideCanvas()
        return false
      }
      showCanvas()
      controller.resize(shouldReduceMotion())
      renderOnce()
      if (!shouldReduceMotion()) schedule()
      return true
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
      if (!controller) return
      if (shouldReduceMotion()) controller.renderStatic()
      else schedule()
    }

    const handleResize = () => {
      if (!controller) return
      controller.resize(shouldReduceMotion())
      renderOnce()
    }

    // WebGL contexts can be reclaimed by the OS/WebView (window occlusion, GPU
    // switch, memory pressure) — frequent in WKWebView. preventDefault keeps the
    // context restorable; on restore we rebuild the program and resume. Until then
    // the canvas is hidden so the opaque div bg holds the window (no desktop bleed).
    const handleContextLost = (event) => {
      event.preventDefault()
      stop()
      controller = null
      hideCanvas()
    }
    const handleContextRestored = () => {
      setup()
    }

    // ResizeObserver catches canvas box changes (grid/sidebar reflow); the window
    // resize listener additionally catches DPR-only changes (e.g. moving monitors).
    const resizeObserver = new ResizeObserver(handleResize)

    canvas.addEventListener('webglcontextlost', handleContextLost, false)
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
    resizeObserver.observe(canvas)
    reducedMotion?.addEventListener?.('change', handleReducedMotionChange)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('resize', handleResize)

    // Initial paint (hides the canvas + shows the opaque floor if init fails).
    setup()

    return () => {
      stop()
      resizeObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost, false)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false)
      reducedMotion?.removeEventListener?.('change', handleReducedMotionChange)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('resize', handleResize)
      try {
        controller && controller.destroy()
      } catch (err) {
        console.warn('AtmosphereBackdrop destroy failed:', err)
      }
    }
  }, [resolvedTheme, reinitNonce])

  return (
    <div className="atmosphere-backdrop" data-theme={resolvedTheme} aria-hidden="true">
      <canvas ref={canvasRef} className="atmosphere-backdrop__canvas" />
    </div>
  )
}
