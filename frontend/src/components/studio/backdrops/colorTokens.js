// Shared helpers for the theme backdrops.
//
// The concept HTML prototypes hard-coded sRGB hex values that were hand-converted
// from each theme's oklch() design tokens. Here we prefer the *real* runtime token
// values (read off document.documentElement via getComputedStyle) and convert them
// to numeric RGB once per mount, so the canvas stays in sync with design-tokens.css
// even if a token shifts. The concept's pre-computed values remain as fallbacks for
// when a token is missing or the browser cannot parse the color.

const _parseCache = new Map()
let _parseCanvasCtx = null

function getParseContext() {
  if (_parseCanvasCtx) return _parseCanvasCtx
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  _parseCanvasCtx = canvas.getContext('2d', { willReadFrequently: true })
  return _parseCanvasCtx
}

// Parse any CSS color string (oklch, hex, rgb, …) into a [r, g, b] sRGB triplet
// in the 0..1 range. Returns null when the string cannot be resolved.
export function parseCssColor(value) {
  if (!value) return null
  const key = String(value).trim()
  if (!key) return null
  if (_parseCache.has(key)) return _parseCache.get(key)

  const ctx = getParseContext()
  if (!ctx) return null

  // Defensive reset: an unparseable fillStyle leaves the previous value in place,
  // so seed with a sentinel and detect that the assignment "took".
  ctx.fillStyle = '#000000'
  ctx.fillStyle = key
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  let rgb = null
  try {
    const data = ctx.getImageData(0, 0, 1, 1).data
    rgb = [data[0] / 255, data[1] / 255, data[2] / 255]
  } catch {
    rgb = null
  }
  _parseCache.set(key, rgb)
  return rgb
}

// Read a CSS custom property off the given element (defaults to the document root,
// which is where data-theme + design-tokens.css live) and return it as an sRGB
// [r, g, b] triplet. Falls back to the supplied hex/color string when the token is
// absent or unparseable.
export function readTokenRgb(name, fallback, element) {
  const root = element || (typeof document !== 'undefined' ? document.documentElement : null)
  if (root && typeof getComputedStyle === 'function') {
    const raw = getComputedStyle(root).getPropertyValue(name)
    const parsed = parseCssColor(raw)
    if (parsed) return parsed
  }
  return parseCssColor(fallback) || [0, 0, 0]
}

// Convenience: resolve a map of { uniformName: { token, fallback } } into
// { uniformName: [r, g, b] }. Used by the WebGL backdrops to build their palette
// from real tokens in one pass at init / theme-change time.
export function readPalette(spec, element) {
  const out = {}
  for (const key of Object.keys(spec)) {
    const entry = spec[key]
    out[key] = readTokenRgb(entry.token, entry.fallback, element)
  }
  return out
}

// Clear the parse cache. Tokens are static per theme, but a theme switch swaps the
// computed values behind the same custom-property names, so the backdrop calls this
// before re-reading the palette.
export function clearColorCache() {
  _parseCache.clear()
}

// Cap the backdrop render resolution. The full-screen multi-octave fbm shaders are
// GPU-bound on integrated GPUs (a MacBook Air measured ~20fps at 1.5×). The canvas
// CSS-stretches to fill, so the backing buffer can be well below display size: at
// 1.0 (no Retina supersampling) fragment count drops ~55% vs 1.5, roughly doubling
// fps, with no perceptible loss on a soft atmospheric backdrop. DOM/text are
// unaffected (full DPR) — this scales the canvas backing only.
export const DPR_CAP = 1.0
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
