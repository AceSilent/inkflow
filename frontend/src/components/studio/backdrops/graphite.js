// 石墨·炭光 — graphite theme backdrop (Canvas2D).
// Ported from design-explorations/backdrops/graphite.html. Floating carbon dust,
// an oblique sweep across brushed graphite, slowly breathing corner shadows, and
// large-scale luminance swell. Deliberately colorless: only neutral-gray material
// and light. Sprites are baked once; the frame loop only drawImages. Base/particle
// colors prefer live graphite-theme tokens (--bg, --ink).

import { readTokenRgb, DPR_CAP } from './colorTokens'

const TAU = Math.PI * 2
const SWEEP_ANGLE = -0.42
const BREATH_PERIOD = 60
const CORNER_PHASE = [0, 1.9, 3.7, 5.1]
const STATIC_T = 8.5
const STATIC_PRESET = 'medium'

const PRESETS = {
  subtle: {
    speed: 1,
    sweep: { period: 30, dur: 11, offset: 26, band: 0.032, lit: 0.8, halfFrac: 0.26 },
    streak: { div: 2100, min: 420, max: 1600, light: [0.045, 0.11], dark: [0.035, 0.07], width: [0.5, 1.3], len: [60, 480], resident: 0.16 },
    sheen: 0,
    breath: { base: 0.17, amp: 0.10, speed: 1 },
    noise: { peak: 13, alpha: 0.9 },
    spotMul: 1,
    swell: 0,
    dust: {
      div: 42000, min: 20, max: 40,
      layers: [
        { frac: 5 / 6, sprite: 'sharp', size: [1.7, 3.4], alpha: [0.055, 0.095], drift: 1, rise: [0.05, 0.13] },
        { frac: 1 / 6, sprite: 'soft', size: [4.2, 6.8], alpha: [0.030, 0.050], drift: 1, rise: [0.05, 0.13] },
      ],
    },
  },
  medium: {
    speed: 1.35,
    sweep: { period: 22, dur: 9, offset: 18, band: 0.07, lit: 0.95, halfFrac: 0.24 },
    streak: { div: 1400, min: 700, max: 2600, light: [0.07, 0.15], dark: [0.04, 0.08], width: [0.5, 1.5], len: [50, 400], resident: 0.45 },
    sheen: 0.045,
    breath: { base: 0.20, amp: 0.13, speed: 1.3 },
    noise: { peak: 15, alpha: 1 },
    spotMul: 1.7,
    swell: 0.025,
    dust: {
      div: 19000, min: 45, max: 85,
      layers: [
        { frac: 0.24, sprite: 'soft', size: [3.6, 6.4], alpha: [0.050, 0.080], drift: 0.8, rise: [0.05, 0.12] },
        { frac: 0.48, sprite: 'sharp', size: [1.8, 3.4], alpha: [0.090, 0.150], drift: 1.1, rise: [0.07, 0.16] },
        { frac: 0.28, sprite: 'near', size: [3.2, 5.6], alpha: [0.120, 0.190], drift: 1.5, rise: [0.09, 0.20] },
      ],
    },
  },
  rich: {
    speed: 1.8,
    sweep: { period: 15, dur: 7.5, offset: 7, band: 0.13, lit: 1.0, halfFrac: 0.20 },
    streak: { div: 850, min: 1100, max: 4000, light: [0.09, 0.19], dark: [0.05, 0.10], width: [0.6, 1.7], len: [40, 300], resident: 0.9 },
    sheen: 0.115,
    breath: { base: 0.24, amp: 0.15, speed: 1.7 },
    noise: { peak: 18, alpha: 1 },
    spotMul: 2.6,
    swell: 0.06,
    dust: {
      div: 9000, min: 80, max: 120,
      layers: [
        { frac: 0.24, sprite: 'soft', size: [3.4, 6.0], alpha: [0.080, 0.120], drift: 0.85, rise: [0.05, 0.12] },
        { frac: 0.44, sprite: 'sharp', size: [2.4, 4.4], alpha: [0.160, 0.250], drift: 1.2, rise: [0.08, 0.18] },
        { frac: 0.32, sprite: 'near', size: [5.6, 10.5], alpha: [0.260, 0.400], drift: 1.8, rise: [0.11, 0.24] },
      ],
    },
  },
}

function rgbToCss(rgb, a) {
  const r = Math.round(rgb[0] * 255)
  const g = Math.round(rgb[1] * 255)
  const b = Math.round(rgb[2] * 255)
  return a == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`
}

export function init(canvas, getParams) {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null

  function rand(a, b) { return a + Math.random() * (b - a) }

  // Palette pulled from real tokens (graphite --bg / --ink), with concept fallbacks.
  // The charcoal corner/swell-dark tone is derived as a deepened --bg.
  let bgRgb = readTokenRgb('--bg', '#1a1d22')
  let inkRgb = readTokenRgb('--ink', '#e7ecf0')
  let inkStr = '231,236,240'

  function refreshTokens() {
    bgRgb = readTokenRgb('--bg', '#1a1d22')
    inkRgb = readTokenRgb('--ink', '#e7ecf0')
    inkStr = `${Math.round(inkRgb[0] * 255)},${Math.round(inkRgb[1] * 255)},${Math.round(inkRgb[2] * 255)}`
  }
  refreshTokens()

  let currentKey = getParams()
  let activeKey = null
  let P = PRESETS[currentKey] || PRESETS[STATIC_PRESET]

  let W = 0
  let H = 0
  let dpr = 1
  let diag = 0
  let bandHalf = 0
  let cornerSize = 0
  let base = null
  let streak = null
  let noiseLayer = null
  let sweepTemp = null
  let sweepCtx = null
  let bandGrad = null
  let cornerSprite = null
  let swellBright = null
  let swellDark = null
  const sprites = {}
  const particles = []

  let clock = 0

  function makeDustSprite(size, hardness) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const r = size / 2
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    grad.addColorStop(0, `rgba(${inkStr},1)`)
    grad.addColorStop(hardness, `rgba(${inkStr},0.5)`)
    grad.addColorStop(1, `rgba(${inkStr},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  }

  function makeNearSprite(size) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const r = size / 2
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    grad.addColorStop(0, `rgba(${inkStr},1)`)
    grad.addColorStop(0.45, `rgba(${inkStr},0.92)`)
    grad.addColorStop(0.72, `rgba(${inkStr},0.32)`)
    grad.addColorStop(1, `rgba(${inkStr},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    return c
  }

  function makeCornerSprite() {
    const s = 384
    const c = document.createElement('canvas')
    c.width = c.height = s
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, s)
    grad.addColorStop(0, rgbToCss([bgRgb[0] * 0.38, bgRgb[1] * 0.44, bgRgb[2] * 0.5], 0.85))
    grad.addColorStop(0.45, rgbToCss([bgRgb[0] * 0.38, bgRgb[1] * 0.44, bgRgb[2] * 0.5], 0.38))
    grad.addColorStop(1, rgbToCss([bgRgb[0] * 0.38, bgRgb[1] * 0.44, bgRgb[2] * 0.5], 0))
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    return c
  }

  function makeSwellSprite(dark) {
    const s = 256
    const c = document.createElement('canvas')
    c.width = c.height = s
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    if (dark) {
      const d = [bgRgb[0] * 0.3, bgRgb[1] * 0.36, bgRgb[2] * 0.42]
      grad.addColorStop(0, rgbToCss(d, 0.9))
      grad.addColorStop(0.5, rgbToCss(d, 0.38))
      grad.addColorStop(1, rgbToCss(d, 0))
    } else {
      grad.addColorStop(0, `rgba(${inkStr},0.9)`)
      grad.addColorStop(0.5, `rgba(${inkStr},0.38)`)
      grad.addColorStop(1, `rgba(${inkStr},0)`)
    }
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    return c
  }

  function buildStreak() {
    const S = P.streak
    streak = document.createElement('canvas')
    streak.width = Math.round(W * dpr)
    streak.height = Math.round(H * dpr)
    const g = streak.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.translate(W / 2, H / 2)
    g.rotate(SWEEP_ANGLE)
    g.lineCap = 'round'
    const n = Math.max(S.min, Math.min(S.max, Math.round((W * H) / S.div)))
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * diag * 0.75
      const y0 = (Math.random() * 2 - 1) * diag * 0.75
      const len = rand(S.len[0], S.len[1])
      const slope = (Math.random() * 2 - 1) * 0.035
      const dark = Math.random() < 0.28
      g.strokeStyle = dark
        ? `rgba(0,0,0,${rand(S.dark[0], S.dark[1]).toFixed(3)})`
        : `rgba(${inkStr},${rand(S.light[0], S.light[1]).toFixed(3)})`
      g.lineWidth = S.width[0] + Math.random() * (S.width[1] - S.width[0])
      g.beginPath()
      g.moveTo(x, y0)
      g.lineTo(x + slope * len, y0 + len)
      g.stroke()
    }
  }

  function buildNoise() {
    noiseLayer = document.createElement('canvas')
    noiseLayer.width = Math.round(W * dpr)
    noiseLayer.height = Math.round(H * dpr)
    const g = noiseLayer.getContext('2d')
    const img = g.createImageData(noiseLayer.width, noiseLayer.height)
    const d = img.data
    const peak = P.noise.peak
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255
      d[i] = v; d[i + 1] = v; d[i + 2] = v
      d[i + 3] = (Math.random() * peak) | 0
    }
    g.putImageData(img, 0, 0)
  }

  function sheenBand(g, cx, half, peak, dark) {
    const col = dark ? '8,10,12' : inkStr
    const grad = g.createLinearGradient(cx - half, 0, cx + half, 0)
    grad.addColorStop(0, `rgba(${col},0)`)
    grad.addColorStop(0.5, `rgba(${col},${peak.toFixed(3)})`)
    grad.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = grad
    g.fillRect(cx - half, -diag, half * 2, diag * 2)
  }

  function buildBase() {
    base = document.createElement('canvas')
    base.width = Math.round(W * dpr)
    base.height = Math.round(H * dpr)
    const g = base.getContext('2d')
    g.setTransform(dpr, 0, 0, dpr, 0, 0)

    g.fillStyle = rgbToCss(bgRgb)
    g.fillRect(0, 0, W, H)

    function spot(cx, cy, r, color) {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
    }
    const m = P.spotMul
    const dm = 1 + (m - 1) * 0.6
    spot(W * 0.32, H * 0.22, diag * 0.55, `rgba(${inkStr},${(0.020 * m).toFixed(3)})`)
    spot(W * 0.66, H * 0.14, diag * 0.38, `rgba(${inkStr},${(0.012 * m).toFixed(3)})`)
    spot(W * 0.76, H * 0.74, diag * 0.50, rgbToCss([bgRgb[0] * 0.5, bgRgb[1] * 0.55, bgRgb[2] * 0.6], Math.min(0.45, 0.22 * dm).toFixed(3)))

    if (P.sheen > 0) {
      g.save()
      g.translate(W / 2, H / 2)
      g.rotate(SWEEP_ANGLE)
      sheenBand(g, -diag * 0.16, diag * 0.14, P.sheen, false)
      sheenBand(g, diag * 0.02, diag * 0.10, P.sheen * 0.85, true)
      sheenBand(g, diag * 0.22, diag * 0.11, P.sheen * 0.6, false)
      sheenBand(g, -diag * 0.34, diag * 0.09, P.sheen * 0.7, true)
      g.restore()
    }

    const vg = g.createRadialGradient(W * 0.5, H * 0.52, diag * 0.30, W * 0.5, H * 0.52, diag * 0.62)
    vg.addColorStop(0, rgbToCss([bgRgb[0] * 0.3, bgRgb[1] * 0.36, bgRgb[2] * 0.42], 0))
    vg.addColorStop(1, rgbToCss([bgRgb[0] * 0.3, bgRgb[1] * 0.36, bgRgb[2] * 0.42], Math.min(0.42, 0.32 * dm).toFixed(3)))
    g.fillStyle = vg
    g.fillRect(0, 0, W, H)

    g.globalAlpha = P.streak.resident
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(streak, 0, 0)
    g.globalAlpha = P.noise.alpha
    g.drawImage(noiseLayer, 0, 0)
    g.globalAlpha = 1
  }

  function seedParticles() {
    const D = P.dust
    const count = Math.max(D.min, Math.min(D.max, Math.round((W * H) / D.div)))
    particles.length = 0
    let made = 0
    for (let li = 0; li < D.layers.length; li++) {
      const L = D.layers[li]
      const n = (li === D.layers.length - 1) ? count - made : Math.round(count * L.frac)
      made += n
      for (let i = 0; i < n; i++) {
        particles.push({
          bx: Math.random() * W,
          py: Math.random() * H,
          rise: rand(L.rise[0], L.rise[1]),
          a1: rand(1.2, 3.4) * L.drift, f1: rand(0.05, 0.14), p1: rand(0, TAU),
          a2: rand(0.5, 1.6) * L.drift, f2: rand(0.17, 0.34), p2: rand(0, TAU),
          ay: rand(0.6, 1.8) * L.drift, fy: rand(0.06, 0.16), py2: rand(0, TAU),
          size: rand(L.size[0], L.size[1]),
          alpha: rand(L.alpha[0], L.alpha[1]),
          tf: rand(0.45, 1.05), tp: rand(0, TAU),
          sprite: L.sprite,
        })
      }
    }
  }

  function rebuild() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    W = Math.max(1, canvas.clientWidth)
    H = Math.max(1, canvas.clientHeight)
    diag = Math.sqrt(W * W + H * H)
    bandHalf = diag * P.sweep.halfFrac
    cornerSize = Math.min(W, H) * 0.62

    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)

    buildStreak()
    buildNoise()
    buildBase()

    sweepTemp = document.createElement('canvas')
    sweepTemp.width = canvas.width
    sweepTemp.height = canvas.height
    sweepCtx = sweepTemp.getContext('2d')

    bandGrad = ctx.createLinearGradient(-bandHalf, 0, bandHalf, 0)
    bandGrad.addColorStop(0, `rgba(${inkStr},0)`)
    bandGrad.addColorStop(0.2, `rgba(${inkStr},0.16)`)
    bandGrad.addColorStop(0.42, `rgba(${inkStr},0.82)`)
    bandGrad.addColorStop(0.5, `rgba(${inkStr},1)`)
    bandGrad.addColorStop(0.58, `rgba(${inkStr},0.82)`)
    bandGrad.addColorStop(0.8, `rgba(${inkStr},0.16)`)
    bandGrad.addColorStop(1, `rgba(${inkStr},0)`)

    seedParticles()
  }

  function drawSwell(sprite, x, y, r, alpha, mode) {
    if (alpha <= 0) return
    ctx.save()
    ctx.globalCompositeOperation = mode
    ctx.globalAlpha = Math.min(1, alpha)
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2)
    ctx.restore()
  }

  function draw(t, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.drawImage(base, 0, 0, W, H)

    if (P.swell > 0) {
      const st = t * P.speed
      drawSwell(swellBright,
        W * (0.50 + 0.30 * Math.sin(st * 0.055 + 0.8)),
        H * (0.40 + 0.27 * Math.cos(st * 0.041)),
        diag * 0.42,
        P.swell * (0.62 + 0.38 * Math.sin(st * 0.067 + 1.4)), 'screen')
      drawSwell(swellBright,
        W * (0.44 + 0.36 * Math.cos(st * 0.037 + 2.2)),
        H * (0.62 + 0.30 * Math.sin(st * 0.049 + 4.1)),
        diag * 0.30,
        P.swell * 0.7 * (0.55 + 0.45 * Math.cos(st * 0.059 + 0.3)), 'screen')
      drawSwell(swellDark,
        W * (0.55 + 0.33 * Math.sin(st * 0.044 + 3.5)),
        H * (0.50 + 0.30 * Math.cos(st * 0.052 + 1.9)),
        diag * 0.46,
        P.swell * 1.25 * (0.6 + 0.4 * Math.sin(st * 0.048 + 2.7)), 'source-over')
    }

    for (let i = 0; i < 4; i++) {
      const breath = P.breath.base + P.breath.amp * Math.sin(TAU * t * P.breath.speed / BREATH_PERIOD + CORNER_PHASE[i])
      ctx.save()
      ctx.globalAlpha = breath
      if (i === 0) ctx.translate(0, 0)
      else if (i === 1) { ctx.translate(W, 0); ctx.scale(-1, 1) }
      else if (i === 2) { ctx.translate(W, H); ctx.scale(-1, -1) }
      else { ctx.translate(0, H); ctx.scale(1, -1) }
      ctx.drawImage(cornerSprite, 0, 0, cornerSize, cornerSize)
      ctx.restore()
    }

    const tc = (t + P.sweep.offset) % P.sweep.period
    if (tc < P.sweep.dur) {
      const p = tc / P.sweep.dur
      let env = Math.sin(Math.PI * p)
      env = env * env
      const off = (p * 2 - 1) * (diag * 0.5 + bandHalf)

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = P.sweep.band * env
      ctx.translate(W / 2, H / 2)
      ctx.rotate(SWEEP_ANGLE)
      ctx.translate(off, 0)
      ctx.fillStyle = bandGrad
      ctx.fillRect(-bandHalf, -diag, bandHalf * 2, diag * 2)
      ctx.restore()

      sweepCtx.setTransform(1, 0, 0, 1, 0, 0)
      sweepCtx.clearRect(0, 0, sweepTemp.width, sweepTemp.height)
      sweepCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sweepCtx.translate(W / 2, H / 2)
      sweepCtx.rotate(SWEEP_ANGLE)
      sweepCtx.translate(off, 0)
      sweepCtx.fillStyle = bandGrad
      sweepCtx.fillRect(-bandHalf, -diag, bandHalf * 2, diag * 2)
      sweepCtx.globalCompositeOperation = 'source-in'
      sweepCtx.setTransform(1, 0, 0, 1, 0, 0)
      sweepCtx.drawImage(streak, 0, 0)
      sweepCtx.globalCompositeOperation = 'source-over'

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = P.sweep.lit * env
      ctx.drawImage(sweepTemp, 0, 0, W, H)
      ctx.restore()
    }

    const tm = t * P.speed
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (let j = 0; j < particles.length; j++) {
      const d = particles[j]
      if (dt > 0) {
        d.py -= d.rise * P.speed * dt
        if (d.py < -16) { d.py = H + 16; d.bx = Math.random() * W }
      }
      let x = d.bx + Math.sin(tm * d.f1 + d.p1) * d.a1 + Math.sin(tm * d.f2 + d.p2) * d.a2
      const y = d.py + Math.sin(tm * d.fy + d.py2) * d.ay
      if (x < -16) x += W + 32
      else if (x > W + 16) x -= W + 32
      const tw = 0.78 + 0.22 * Math.sin(tm * d.tf + d.tp)
      ctx.globalAlpha = d.alpha * tw
      const s = d.size
      ctx.drawImage(sprites[d.sprite], x - s / 2, y - s / 2, s, s)
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  // Build the sprite/layer set for the level the orchestrator currently wants.
  // `reduced` forces the medium preset (reduced-motion static frame).
  function syncPreset(reduced) {
    const want = reduced ? STATIC_PRESET : getParams()
    if (want !== activeKey) {
      activeKey = want
      currentKey = want
      P = PRESETS[want] || PRESETS[STATIC_PRESET]
      rebuild()
    }
  }

  function resize(reduced) {
    syncPreset(reduced)
    rebuild()
  }

  function frame(dt) {
    syncPreset(false)
    let step = dt
    if (step < 0) step = 0
    if (step > 0.1) step = 0.1
    clock += step
    draw(clock, step)
  }

  function renderStatic() {
    syncPreset(true)
    draw(STATIC_T, 0)
  }

  function refreshPalette() {
    // Token swap (theme change) — rebuild sprites and layers in the new palette.
    refreshTokens()
    cornerSprite = makeCornerSprite()
    swellBright = makeSwellSprite(false)
    swellDark = makeSwellSprite(true)
    sprites.sharp = makeDustSprite(32, 0.22)
    sprites.soft = makeDustSprite(32, 0.5)
    sprites.near = makeNearSprite(48)
    activeKey = null
    syncPreset(false)
  }

  // Bake sprites once up front.
  cornerSprite = makeCornerSprite()
  swellBright = makeSwellSprite(false)
  swellDark = makeSwellSprite(true)
  sprites.sharp = makeDustSprite(32, 0.22)
  sprites.soft = makeDustSprite(32, 0.5)
  sprites.near = makeNearSprite(48)
  syncPreset(false)

  return {
    resize,
    frame,
    renderStatic,
    refreshPalette,
    destroy() {
      // Drop references so the offscreen canvases can be GC'd promptly.
      base = streak = noiseLayer = sweepTemp = sweepCtx = null
      cornerSprite = swellBright = swellDark = null
      sprites.sharp = sprites.soft = sprites.near = null
      particles.length = 0
    },
  }
}
