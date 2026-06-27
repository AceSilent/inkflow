import { useEffect, useRef, useState } from 'react'
import { getBackdropInit, DEFAULT_BACKDROP_THEME } from './backdrops'
import { clearColorCache, REDUCED_MOTION_QUERY } from './backdrops/colorTokens'
import { useBackdropIntensity } from '../../hooks/useBackdropIntensity'

const VALID_THEMES = ['ink', 'mist', 'paper', 'graphite']

// Roughly when the app/module first loaded. Used to gate the transparent-window
// first-paint re-init to cold start only (see BackdropLayer) — layers created later by
// a user theme switch must NOT re-init, or they'd pay the build cost twice.
const APP_LOAD_TS = typeof performance !== 'undefined' ? performance.now() : 0
const COLD_START_MS = 2000

function resolveTheme(explicit) {
  if (VALID_THEMES.includes(explicit)) return explicit
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme')
    if (VALID_THEMES.includes(attr)) return attr
  }
  return DEFAULT_BACKDROP_THEME
}

// One cached animation layer per theme. It mounts its own <canvas> ONCE (compiling the
// WebGL program / baking the Canvas2D sprites — the ~700ms-blocking work), then keeps
// it alive. When inactive it pauses its rAF and hides (display:none), costing nothing
// but retaining its compiled state, so switching BACK to it is instant — no teardown,
// no rebuild, no shader recompile. `theme` never changes for a given layer (the parent
// keys layers by theme), so the heavy effect runs once per layer; `active` only toggles
// the loop on/off via a separate effect.
function BackdropLayer({ theme, active, intensityRef }) {
  const canvasRef = useRef(null)
  const apiRef = useRef(null)
  // Latest `active` for the heavy effect's closure (which is created once and must not
  // re-run when active flips). Synced in the [active] effect below — never during render.
  const activeRef = useRef(active)

  // Re-init once shortly after mount to clear a transparent-window first-paint bleed
  // (the GL context can come up transparent before the window compositor settles on a
  // cold load). Gated to cold start: a layer created later by a theme switch skips this
  // so it doesn't rebuild (and re-freeze) a second time.
  const [reinitNonce, setReinitNonce] = useState(0)
  useEffect(() => {
    if (typeof performance !== 'undefined' && performance.now() - APP_LOAD_TS > COLD_START_MS) {
      return undefined
    }
    let raf1 = 0
    let raf2 = 0
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

    // Tokens are static per theme, but a swap reuses the same custom-property names —
    // clear the parse cache so this layer reads its own theme's palette.
    clearColorCache()

    const initFn = getBackdropInit(theme)
    const getParams = () => intensityRef.current

    let controller = null
    let animationFrame = 0
    let lastNow = 0

    const shouldReduceMotion = () => reducedMotion?.matches === true

    // display:none (not visibility:hidden) fully removes the canvas's GPU surface so a
    // failed/paused canvas can't keep compositing — and bleed through the transparent
    // window. The opaque floor is the parent .atmosphere-backdrop div's var(--bg).
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
      if (animationFrame || document.hidden || shouldReduceMotion() || !controller || !activeRef.current) return
      animationFrame = window.requestAnimationFrame(frame)
    }

    function renderOnce() {
      if (!controller) return
      if (shouldReduceMotion()) controller.renderStatic()
      else controller.frame(0)
    }

    // Show + size + paint + (maybe) animate, or pause + hide. Resizing requires the
    // canvas to be laid out (display:block), so always show before resize.
    function applyActive(isActive) {
      if (!controller) return
      if (isActive) {
        showCanvas()
        controller.resize(shouldReduceMotion())
        renderOnce()
        if (!shouldReduceMotion()) schedule()
      } else {
        stop()
        hideCanvas()
      }
    }

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
      applyActive(activeRef.current)
      return true
    }

    const handleVisibility = () => {
      if (document.hidden) {
        stop()
      } else if (activeRef.current) {
        lastNow = 0
        schedule()
      }
    }

    const handleReducedMotionChange = () => {
      stop()
      if (!controller || !activeRef.current) return
      if (shouldReduceMotion()) controller.renderStatic()
      else schedule()
    }

    const handleResize = () => {
      if (!controller || !activeRef.current) return
      controller.resize(shouldReduceMotion())
      renderOnce()
    }

    const handleContextLost = (event) => {
      event.preventDefault()
      stop()
      controller = null
      hideCanvas()
    }
    const handleContextRestored = () => {
      setup()
    }

    const resizeObserver = new ResizeObserver(handleResize)

    canvas.addEventListener('webglcontextlost', handleContextLost, false)
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false)
    resizeObserver.observe(canvas)
    reducedMotion?.addEventListener?.('change', handleReducedMotionChange)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('resize', handleResize)

    // Expose pause/resume to the [active] effect without re-running this heavy effect.
    apiRef.current = { applyActive: (a) => applyActive(a) }

    setup()

    return () => {
      apiRef.current = null
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
    // intensityRef is a stable ref (read live via getParams), so it isn't a real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, reinitNonce])

  // Toggle the loop on/off when activeness changes — without rebuilding the controller —
  // and keep activeRef current for the frame loop's schedule guard.
  useEffect(() => {
    activeRef.current = active
    apiRef.current?.applyActive(active)
  }, [active])

  // data-theme is on the canvas itself so it reads its OWN theme's tokens (the parent
  // div carries the ACTIVE theme; an inactive layer's canvas must not inherit that).
  return <canvas ref={canvasRef} data-theme={theme} className="atmosphere-backdrop__canvas" />
}

// Single mounted backdrop. Picks the per-theme animation implementation and keeps a
// cached (paused) layer for every theme the user has visited, so theme switches are
// instant after the first visit. Intensity comes from the useBackdropIntensity hook;
// `intensity` prop overrides it when provided.
export function AtmosphereBackdrop({ theme, intensity }) {
  const ctx = useBackdropIntensity()
  const activeIntensity = intensity || ctx.intensity || 'medium'

  const intensityRef = useRef(activeIntensity)
  useEffect(() => {
    intensityRef.current = activeIntensity
  }, [activeIntensity])

  const resolvedTheme = resolveTheme(theme)

  // Keep a layer mounted for each theme the user has activated. Switching to a visited
  // theme just flips `active` (instant resume); switching to a new one mounts its layer
  // (pays the one-time build once). Order doesn't matter — only the active one paints.
  const [visited, setVisited] = useState(() => [resolvedTheme])
  useEffect(() => {
    // Append-only and idempotent (a no-op once a theme has been mounted), so it can't
    // cascade — it only fires on the first visit to each theme.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisited((prev) => (prev.includes(resolvedTheme) ? prev : [...prev, resolvedTheme]))
  }, [resolvedTheme])

  return (
    <div className="atmosphere-backdrop" data-theme={resolvedTheme} aria-hidden="true">
      {visited.map((t) => (
        <BackdropLayer key={t} theme={t} active={t === resolvedTheme} intensityRef={intensityRef} />
      ))}
    </div>
  )
}
