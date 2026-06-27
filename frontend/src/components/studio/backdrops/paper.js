// 宣纸·墨晕 — paper theme backdrop (WebGL).
// Ported from design-explorations/backdrops/paper.html. A static rice-paper fiber
// layer plus ink blooms that spread fast-then-slow, feather at the edge, and settle;
// occasional dry-brush strokes graze the corners. Bloom/brush timelines advance in JS;
// the shader renders from per-frame uniforms. The base ink/paper colors prefer live
// paper-theme tokens.

import { createGlContext, createProgram, setupFullscreenQuad, loseContext, VERTEX_SRC } from './glHelpers'
import { readPalette, DPR_CAP } from './colorTokens'

const PRESETS = {
  subtle: {
    bloomLife: 16.0, riseEnd: 1.4, fadeStart: 5.5,
    radiusK: 2.4, radiusPow: 0.55, maxRBase: 0.14, maxRVar: 0.09,
    peakBase: 0.054, peakVar: 0.014,
    firstBloom: 1.0, intervalBase: 12, intervalVar: 8, maxBlooms: 2,
    brushLife: 7.5, brushFade: 3.5, brushDraw: 2.1, brushWidth: 1.0,
    brushPeakBase: 0.028, brushPeakVar: 0.010,
    brushFirst: 24, brushIntBase: 50, brushIntVar: 28,
    inkCap: 0.085,
    fiber: 1.0, grain: 1.0, cloud: 1.0, fiberDen: 0.0,
    driftSpeed: 1.0, driftAmp: 1.0, structMul: 1.0, fingerMul: 1.0,
  },
  medium: {
    bloomLife: 20.0, riseEnd: 1.8, fadeStart: 9.0,
    radiusK: 4.2, radiusPow: 0.52, maxRBase: 0.17, maxRVar: 0.10,
    peakBase: 0.13, peakVar: 0.04,
    firstBloom: 0.8, intervalBase: 9, intervalVar: 5, maxBlooms: 2,
    brushLife: 8.5, brushFade: 4.0, brushDraw: 2.4, brushWidth: 1.25,
    brushPeakBase: 0.07, brushPeakVar: 0.02,
    brushFirst: 14, brushIntBase: 30, brushIntVar: 18,
    inkCap: 0.30,
    fiber: 1.6, grain: 1.5, cloud: 2.0, fiberDen: 0.04,
    driftSpeed: 2.0, driftAmp: 1.5, structMul: 1.35, fingerMul: 1.15,
  },
  rich: {
    bloomLife: 26.0, riseEnd: 2.2, fadeStart: 13.0,
    radiusK: 7.0, radiusPow: 0.50, maxRBase: 0.19, maxRVar: 0.10,
    peakBase: 0.32, peakVar: 0.08,
    firstBloom: 0.5, intervalBase: 6, intervalVar: 4, maxBlooms: 3,
    brushLife: 9.5, brushFade: 4.5, brushDraw: 2.8, brushWidth: 1.6,
    brushPeakBase: 0.12, brushPeakVar: 0.06,
    brushFirst: 7, brushIntBase: 18, brushIntVar: 12,
    inkCap: 0.55,
    fiber: 2.1, grain: 2.2, cloud: 3.2, fiberDen: 0.05,
    driftSpeed: 3.0, driftAmp: 2.0, structMul: 1.7, fingerMul: 1.25,
  },
}
const STATIC_PRESET = 'medium'

// Three base paper tints + the ink color. Tokens drive them; concept fallbacks match
// the prototype's hand-converted sRGB.
const PALETTE_SPEC = {
  paperHi: { token: '--bg-elevated', fallback: '#fffcf3' },
  paperMid: { token: '--bg', fallback: '#fdf7ea' },
  paperLo: { token: '--bg-subtle', fallback: '#f7f1e2' },
  ink: { token: '--ink', fallback: '#2a1b11' },
}

const FRAG = [
  'precision highp float;',
  '',
  'uniform vec2 u_res;',
  'uniform float u_time;',
  'uniform vec4 u_bloom0;',
  'uniform vec2 u_meta0;',
  'uniform vec4 u_bloom1;',
  'uniform vec2 u_meta1;',
  'uniform vec4 u_bloom2;',
  'uniform vec2 u_meta2;',
  'uniform vec4 u_brush;',
  'uniform vec3 u_brushMeta;',
  'uniform vec4 u_paper;',
  'uniform vec2 u_drift;',
  'uniform vec3 u_inkCtl;',
  'uniform vec3 u_paperHi;',
  'uniform vec3 u_paperMid;',
  'uniform vec3 u_paperLo;',
  'uniform vec3 u_inkCol;',
  '',
  'varying vec2 v_uv;',
  '',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
  'float noise(vec2 p) {',
  '  vec2 i = floor(p);',
  '  vec2 f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  float a = hash(i);',
  '  float b = hash(i + vec2(1.0, 0.0));',
  '  float c = hash(i + vec2(0.0, 1.0));',
  '  float d = hash(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
  '}',
  'mat2 rot(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }',
  'float fbm(vec2 p) {',
  '  float v = 0.0;',
  '  float amp = 0.52;',
  '  mat2 m = rot(0.62);',
  '  for (int i = 0; i < 4; i++) {',
  '    v += amp * noise(p);',
  '    p = m * p * 2.03 + vec2(11.3, 7.1);',
  '    amp *= 0.5;',
  '  }',
  '  return v;',
  '}',
  'float strand(vec2 p, float a, vec2 freq, float seed) {',
  '  vec2 q = rot(a) * p;',
  '  float n = fbm(q * freq + seed);',
  '  float line = smoothstep(0.47, 0.52, n) * smoothstep(0.57, 0.52, n);',
  '  float den = u_paper.w;',
  '  float patch = smoothstep(0.42 - den, 0.66 - den * 1.5, fbm(p * 1.3 + seed * 2.7 + 31.0));',
  '  return line * patch;',
  '}',
  'float inkBloom(vec2 p, vec4 b, vec2 meta, float mottle) {',
  '  float amp = b.w;',
  '  if (amp <= 0.001) return 0.0;',
  '  vec2 q = p - b.xy;',
  '  float d = length(q) + 1e-5;',
  '  if (d > b.z * 1.7 + 0.02) return 0.0;',
  '  float seed = meta.x;',
  '  float ageN = meta.y;',
  '  vec2 cdir = q / d;',
  '  float fing = u_inkCtl.z;',
  '  float f1 = fbm(cdir * 2.4 + seed);',
  '  float f2 = fbm(cdir * 6.0 + seed * 1.7 + 11.3);',
  '  float f3 = fbm(cdir * 13.0 - seed * 2.3 + 4.7);',
  '  float boundary = b.z * (1.0 + ((f1 - 0.49) * 0.55 + (f2 - 0.49) * 0.30 + (f3 - 0.49) * 0.18) * fing);',
  '  boundary *= 1.0 + 0.12 * fing * smoothstep(0.66, 0.90, f3);',
  '  float x = d / max(boundary, 1e-4);',
  '  float edgeSoft = 0.10 + 0.22 * ageN;',
  '  float body = 1.0 - smoothstep(1.0 - edgeSoft, 1.0, x);',
  '  float tone = mix(1.0, 0.42 + 0.58 * smoothstep(0.0, 1.0, x), ageN * 0.85);',
  '  float rimN = 0.40 + 0.85 * fbm(cdir * 8.5 + seed * 3.1);',
  '  float rt = (x - 0.97) / (0.05 + 0.05 * ageN);',
  '  float rim = exp(-rt * rt) * rimN * (0.35 + 0.75 * ageN);',
  '  float ring2N = 0.35 + 0.65 * fbm(cdir * 4.5 - seed * 2.0 + 7.7);',
  '  float r2t = (x - 0.58 - 0.10 * fract(seed * 0.731)) / 0.085;',
  '  float ring2 = exp(-r2t * r2t) * ring2N * smoothstep(0.25, 0.70, ageN) * 0.5;',
  '  float gran = 0.72 + 0.56 * mottle;',
  '  return (body * tone * 0.66 + (rim * 0.55 + ring2 * 0.35) * u_inkCtl.y) * gran * amp;',
  '}',
  'float dryBrush(vec2 p, vec4 br, vec3 meta) {',
  '  float amp = br.w;',
  '  if (amp <= 0.001) return 0.0;',
  '  vec2 q = p - br.xy;',
  '  float c = cos(meta.x);',
  '  float s = sin(meta.x);',
  '  vec2 lp = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);',
  '  float along = lp.x / 0.58;',
  '  if (along < 0.0 || along > 1.18) return 0.0;',
  '  float seed = meta.y;',
  '  float w = 0.040 * meta.z * (1.0 - 0.50 * along) * (0.75 + 0.5 * noise(vec2(along * 6.0 + seed, seed)));',
  '  float crossEnv = 1.0 - smoothstep(w * 0.15, w, abs(lp.y));',
  '  float bristle = smoothstep(0.48, 0.70, fbm(vec2(lp.y * 110.0, lp.x * 4.0) + seed));',
  '  float skip = smoothstep(0.34, 0.58, fbm(vec2(lp.x * 16.0, lp.y * 36.0) + seed * 1.7));',
  '  float head = smoothstep(br.z, br.z - 0.10, along);',
  '  float load = 1.0 - 0.70 * along;',
  '  return crossEnv * bristle * skip * head * load * amp;',
  '}',
  'void main() {',
  '  vec2 uv = v_uv;',
  '  vec2 p = (uv - 0.5) * vec2(u_res.x / max(u_res.y, 1.0), 1.0);',
  '  float r = length(p * vec2(0.82, 1.0));',
  '  vec3 col = mix(u_paperHi, u_paperMid, smoothstep(0.18, 1.05, r));',
  '  col = mix(col, u_paperLo, smoothstep(0.85, 1.45, r));',
  '  col *= 1.0 + (fbm(p * 3.1 + 5.5) - 0.49) * (0.020 * u_paper.z);',
  '  float fL = strand(p, 0.35, vec2(1.6, 64.0), 3.7);',
  '  float fD1 = strand(p, -0.85, vec2(2.2, 78.0), 9.2);',
  '  float fD2 = strand(p, 1.75, vec2(1.9, 70.0), 17.5);',
  '  col += vec3(0.012, 0.011, 0.009) * fL * u_paper.x;',
  '  col -= vec3(0.010, 0.009, 0.008) * fD1 * u_paper.x;',
  '  col -= vec3(0.008, 0.007, 0.006) * fD2 * u_paper.x;',
  '  float grain = hash(gl_FragCoord.xy) - 0.5;',
  '  float tooth = hash(floor(gl_FragCoord.xy * 0.5) + 7.3) - 0.5;',
  '  col *= 1.0 + (grain * 0.022 + tooth * 0.012) * u_paper.y;',
  '  col *= 1.0 + sin(dot(uv, vec2(1.4, 0.9)) * 3.1 - u_time * 0.05 * u_drift.x) * (0.006 * u_drift.y);',
  '  float mottle = fbm(p * 21.0 + 2.2);',
  '  float ink = inkBloom(p, u_bloom0, u_meta0, mottle)',
  '            + inkBloom(p, u_bloom1, u_meta1, mottle)',
  '            + inkBloom(p, u_bloom2, u_meta2, mottle)',
  '            + dryBrush(p, u_brush, u_brushMeta);',
  '  ink = min(ink, u_inkCtl.x);',
  '  col = mix(col, u_inkCol, ink);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n')

function smoothstepJs(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function init(canvas, getParams) {
  const gl = createGlContext(canvas)
  if (!gl) return null
  const program = createProgram(gl, VERTEX_SRC, FRAG, '宣纸·墨晕')
  if (!program) return null
  const buffer = setupFullscreenQuad(gl, program)
  if (!buffer) {
    gl.deleteProgram(program)
    return null
  }

  const uRes = gl.getUniformLocation(program, 'u_res')
  const uTime = gl.getUniformLocation(program, 'u_time')
  const uBloom = [
    gl.getUniformLocation(program, 'u_bloom0'),
    gl.getUniformLocation(program, 'u_bloom1'),
    gl.getUniformLocation(program, 'u_bloom2'),
  ]
  const uMeta = [
    gl.getUniformLocation(program, 'u_meta0'),
    gl.getUniformLocation(program, 'u_meta1'),
    gl.getUniformLocation(program, 'u_meta2'),
  ]
  const uBrush = gl.getUniformLocation(program, 'u_brush')
  const uBrushMeta = gl.getUniformLocation(program, 'u_brushMeta')
  const uPaper = gl.getUniformLocation(program, 'u_paper')
  const uDrift = gl.getUniformLocation(program, 'u_drift')
  const uInkCtl = gl.getUniformLocation(program, 'u_inkCtl')
  const uPaperHi = gl.getUniformLocation(program, 'u_paperHi')
  const uPaperMid = gl.getUniformLocation(program, 'u_paperMid')
  const uPaperLo = gl.getUniformLocation(program, 'u_paperLo')
  const uInkColLoc = gl.getUniformLocation(program, 'u_inkCol')

  // Read tokens off `canvas` (see mist.js): its parent .atmosphere-backdrop div has
  // the new theme's data-theme at render time, while documentElement still lags by
  // one effect — reading documentElement bakes the previous theme's colors in.
  let palette = readPalette(PALETTE_SPEC, canvas)

  // Pre-allocated bloom/brush state (frame loop allocates nothing).
  const slots = [
    { u: 0, v: 0, birth: -1e9, seed: 0, maxR: 0.18, peak: 0.062 },
    { u: 0, v: 0, birth: -1e9, seed: 0, maxR: 0.18, peak: 0.062 },
    { u: 0, v: 0, birth: -1e9, seed: 0, maxR: 0.18, peak: 0.062 },
  ]
  const brush = { u: 0, v: 0, birth: -1e9, seed: 0, angle: 0, peak: 0.034 }
  const brushSpots = [
    { u: 0.02, v: 0.30, a: -0.55 },
    { u: 0.62, v: 0.97, a: -0.42 },
    { u: 0.01, v: 0.80, a: 0.30 },
    { u: 0.55, v: 0.02, a: 0.35 },
  ]
  const fallbackSpots = [
    { u: 0.24, v: 0.68 }, { u: 0.30, v: 0.26 }, { u: 0.70, v: 0.86 }, { u: 0.18, v: 0.48 },
  ]

  let activeLevel = getParams()
  let P = PRESETS[activeLevel] || PRESETS[STATIC_PRESET]
  let clock = 0
  let width = 1
  let height = 1
  let aspect = 1
  let nextBloomAt = P.firstBloom
  let nextBrushAt = P.brushFirst + Math.random() * 4
  let spawnCount = 0

  function activeParams(reduced) {
    return reduced ? PRESETS[STATIC_PRESET] : P
  }

  function bloomRadius(age, maxR, Q) {
    const t = Math.max(age, 0)
    return maxR * Math.pow(t / (t + Q.radiusK), Q.radiusPow)
  }

  function bloomAmp(age, peak, Q) {
    if (age < 0 || age > Q.bloomLife) return 0
    return peak * smoothstepJs(0, Q.riseEnd, age) * (1 - smoothstepJs(Q.fadeStart, Q.bloomLife - 0.5, age))
  }

  function spawnBloom() {
    let slot = null
    for (let i = 0; i < P.maxBlooms; i++) {
      if (clock - slots[i].birth > P.bloomLife) { slot = slots[i]; break }
    }
    if (!slot) return false

    let u = -1
    let v = -1
    let ok = false
    for (let tries = 0; tries < 12; tries++) {
      u = 0.08 + Math.random() * 0.84
      v = 0.12 + Math.random() * 0.76
      const dx = u - 0.5
      const dy = v - 0.5
      if (dx * dx + dy * dy < 0.030) continue
      if (u > 0.46 && v > 0.20 && v < 0.80) continue
      let clash = false
      for (let j = 0; j < slots.length; j++) {
        if (slots[j] === slot) continue
        if (clock - slots[j].birth > P.bloomLife) continue
        const du = u - slots[j].u
        const dv = v - slots[j].v
        if (du * du + dv * dv < 0.075) { clash = true; break }
      }
      if (clash) continue
      ok = true
      break
    }
    if (!ok) {
      const fb = fallbackSpots[spawnCount % fallbackSpots.length]
      u = fb.u
      v = fb.v
    }
    spawnCount++
    slot.u = u
    slot.v = v
    slot.birth = clock
    slot.seed = Math.random() * 61 + 1.7
    slot.maxR = P.maxRBase + Math.random() * P.maxRVar
    slot.peak = P.peakBase + Math.random() * P.peakVar
    return true
  }

  function spawnBrush() {
    const spot = brushSpots[(Math.random() * brushSpots.length) | 0]
    brush.u = spot.u + (Math.random() - 0.5) * 0.05
    brush.v = spot.v + (Math.random() - 0.5) * 0.05
    brush.angle = spot.a + (Math.random() - 0.5) * 0.24
    brush.birth = clock
    brush.seed = Math.random() * 47 + 3.3
    brush.peak = P.brushPeakBase + Math.random() * P.brushPeakVar
  }

  // Mirror the concept's setIntensity rescale: when the level changes, scale the
  // in-flight blooms/brush by the preset midpoint ratios so the switch reads cleanly.
  function syncLevel() {
    const level = getParams()
    if (level === activeLevel || !PRESETS[level]) return
    const next = PRESETS[level]
    const old = P
    const pkR = (next.peakBase + next.peakVar * 0.5) / (old.peakBase + old.peakVar * 0.5)
    const rR = (next.maxRBase + next.maxRVar * 0.5) / (old.maxRBase + old.maxRVar * 0.5)
    const bR = (next.brushPeakBase + next.brushPeakVar * 0.5) / (old.brushPeakBase + old.brushPeakVar * 0.5)
    for (let i = 0; i < slots.length; i++) {
      if (clock - slots[i].birth <= old.bloomLife) {
        slots[i].peak *= pkR
        slots[i].maxR *= rR
      }
    }
    if (clock - brush.birth <= old.brushLife) brush.peak *= bR
    P = next
    activeLevel = level
    nextBloomAt = Math.min(nextBloomAt, clock + 0.8)
    nextBrushAt = Math.min(nextBrushAt, clock + next.brushFirst)
  }

  function uploadState(reduced) {
    const Q = activeParams(reduced)
    gl.useProgram(program)
    gl.uniform2f(uRes, width, height)
    gl.uniform1f(uTime, clock)
    for (let i = 0; i < 3; i++) {
      const s = slots[i]
      const age = clock - s.birth
      const amp = bloomAmp(age, s.peak, Q)
      const radius = amp > 0 ? bloomRadius(age, s.maxR, Q) : 0
      const ageN = Math.min(Math.max(age / Q.bloomLife, 0), 1)
      gl.uniform4f(uBloom[i], (s.u - 0.5) * aspect, s.v - 0.5, radius, amp)
      gl.uniform2f(uMeta[i], s.seed, ageN)
    }
    const bAge = clock - brush.birth
    let bAmp = 0
    let bProgress = 0
    if (bAge >= 0 && bAge <= Q.brushLife) {
      bAmp = brush.peak * smoothstepJs(0, 0.45, bAge) * (1 - smoothstepJs(Q.brushFade, Q.brushLife, bAge))
      bProgress = smoothstepJs(0.1, Q.brushDraw, bAge) * 1.18
    }
    gl.uniform4f(uBrush, (brush.u - 0.5) * aspect, brush.v - 0.5, bProgress, bAmp)
    gl.uniform3f(uBrushMeta, brush.angle, brush.seed, Q.brushWidth)
    gl.uniform4f(uPaper, Q.fiber, Q.grain, Q.cloud, Q.fiberDen)
    gl.uniform2f(uDrift, Q.driftSpeed, Q.driftAmp)
    gl.uniform3f(uInkCtl, Q.inkCap, Q.structMul, Q.fingerMul)
  }

  function applyPalette() {
    gl.useProgram(program)
    gl.uniform3fv(uPaperHi, palette.paperHi)
    gl.uniform3fv(uPaperMid, palette.paperMid)
    gl.uniform3fv(uPaperLo, palette.paperLo)
    gl.uniform3fv(uInkColLoc, palette.ink)
  }

  function render(reduced) {
    uploadState(reduced)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    width = w
    height = h
    aspect = w / h
    gl.viewport(0, 0, w, h)
  }

  function frame(dt) {
    syncLevel()
    const step = Math.min(dt, 0.1)
    clock += step > 0 ? step : 0
    if (clock >= nextBloomAt) {
      if (spawnBloom()) {
        nextBloomAt = clock + P.intervalBase + Math.random() * P.intervalVar
      } else {
        nextBloomAt = clock + 1.5
      }
    }
    if (clock >= nextBrushAt) {
      spawnBrush()
      nextBrushAt = clock + P.brushIntBase + Math.random() * P.brushIntVar
    }
    render(false)
  }

  // Reduced-motion: a "settled" static frame, amplitudes fixed at the medium preset.
  function renderStatic() {
    clock = 24
    slots[0].u = 0.28; slots[0].v = 0.64; slots[0].birth = 16
    slots[0].seed = 23.7; slots[0].maxR = 0.24; slots[0].peak = 0.15
    slots[1].u = 0.68; slots[1].v = 0.12; slots[1].birth = 19
    slots[1].seed = 8.9; slots[1].maxR = 0.18; slots[1].peak = 0.125
    slots[2].birth = -1e9
    brush.birth = -1e9
    render(true)
  }

  function refreshPalette() {
    palette = readPalette(PALETTE_SPEC, canvas)
    applyPalette()
  }

  applyPalette()

  return {
    resize,
    frame,
    renderStatic,
    refreshPalette,
    destroy() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      loseContext(gl)
    },
  }
}
