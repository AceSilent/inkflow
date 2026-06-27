// 晨雾·远峦 — mist theme backdrop (WebGL).
// Ported from design-explorations/backdrops/mist.html. Three drifting fog layers,
// receding ridgelines, and an oblique morning beam. Parameters lerp toward the
// active preset each frame, so intensity changes ease in without a jump. Base/fog
// colors prefer live mist-theme tokens.

import { createGlContext, createProgram, setupFullscreenQuad, loseContext, VERTEX_SRC } from './glHelpers'
import { readPalette, DPR_CAP } from './colorTokens'

const STILL_PHASE = 6.5
const STILL_BREATH_PHASE = 1.25
const STATIC_PRESET = 'medium'

const PRESETS = {
  subtle: {
    botDark: 0.0, depth: 0.0,
    fogA: 0.50, fogB: 0.42, fogC: 0.55,
    sharp: 0.0, warp: 0.0, mtn: 1.0, r4: 0.0,
    beam: 1.0, rays: 0.0, wisp: 1.0, fgw: 0.0, vig: 1.0,
    breathAmp: 0.65, breathRate: 0.15707963,
    spdA: 1.0, spdB: 1.0, spdC: 1.0, spdW: 1.0,
  },
  medium: {
    botDark: 0.50, depth: 0.48,
    fogA: 0.70, fogB: 0.66, fogC: 0.70,
    sharp: 0.45, warp: 0.45, mtn: 1.7, r4: 0.34,
    beam: 2.2, rays: 1.4, wisp: 2.6, fgw: 0.25, vig: 1.35,
    breathAmp: 0.60, breathRate: 0.24166,
    spdA: 2.2, spdB: 2.8, spdC: 2.3, spdW: 3.2,
  },
  rich: {
    botDark: 1.0, depth: 1.0,
    fogA: 0.92, fogB: 0.88, fogC: 0.78,
    sharp: 1.0, warp: 1.0, mtn: 2.6, r4: 0.72,
    beam: 5.2, rays: 5.0, wisp: 5.5, fgw: 0.65, vig: 2.0,
    breathAmp: 0.50, breathRate: 0.3926991,
    spdA: 3.6, spdB: 5.5, spdC: 4.4, spdW: 6.5,
  },
}
const PARAM_KEYS = Object.keys(PRESETS.subtle)

// The mist scene mixes between a light "top" and a deeper "bottom" base. The shader
// keeps the concept's hand-tuned baseline literals; the uniform palette lets a token
// shift tint the top wash without retuning the whole gradient.
const PALETTE_SPEC = {
  baseTop: { token: '--bg', fallback: '#f7fafe' },
}

const FRAGMENT_SHADER = [
  'precision highp float;',
  '',
  'uniform float u_time;',
  'uniform vec2  u_res;',
  'uniform vec3  u_fog;',
  'uniform vec4  u_shape;',
  'uniform vec4  u_light;',
  'uniform vec4  u_detail;',
  'uniform vec4  u_phase;',
  'uniform vec3  u_baseTop;',
  '',
  'varying vec2 v_uv;',
  '',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
  'float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }',
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
  'float noise1(float x) {',
  '  float i = floor(x);',
  '  float f = fract(x);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  return mix(hash1(i), hash1(i + 1.0), f);',
  '}',
  'mat2 rot(float a) { float s = sin(a); float c = cos(a); return mat2(c, -s, s, c); }',
  'float fbm(vec2 p) {',
  '  float v = 0.0;',
  '  float a = 0.52;',
  '  mat2 m = rot(0.62);',
  '  for (int i = 0; i < 5; i++) {',
  '    v += a * noise(p);',
  '    p = m * p * 2.02 + vec2(11.3, 7.1);',
  '    a *= 0.5;',
  '  }',
  '  return v;',
  '}',
  'float fbm1(float x) {',
  '  float v = 0.0;',
  '  float a = 0.5;',
  '  for (int i = 0; i < 4; i++) {',
  '    v += a * noise1(x);',
  '    x = x * 2.13 + 19.7;',
  '    a *= 0.5;',
  '  }',
  '  return v;',
  '}',
  'void main() {',
  '  vec2 uv = v_uv;',
  '  float aspect = u_res.x / max(u_res.y, 1.0);',
  '  vec2 p = vec2(uv.x * aspect, uv.y);',
  '  float sharp  = u_shape.x;',
  '  float warp   = u_shape.y;',
  '  float mtn    = u_shape.z;',
  '  float r4amt  = u_shape.w;',
  '  float depth  = u_detail.z;',
  '  float breath = u_detail.w;',
  '  float tA = u_phase.x;',
  '  float tB = u_phase.y;',
  '  float tC = u_phase.z;',
  '  float tW = u_phase.w;',
  '  vec3 baseTop    = mix(u_baseTop, vec3(0.9160, 0.9320, 0.9560), depth);',
  '  vec3 baseBottom = mix(vec3(0.9110, 0.9265, 0.9475), vec3(0.7620, 0.7970, 0.8430), u_light.w);',
  '  vec3 col = mix(baseBottom, baseTop, smoothstep(-0.05, 1.05, uv.y));',
  '  float horizon = exp(-pow((uv.y - 0.305) / 0.165, 2.0));',
  '  col += vec3(0.0125, 0.0118, 0.0090) * horizon * (1.0 + 1.7 * depth);',
  '  vec2 qa = vec2(p.x * 1.75 - tA * 0.0105, uv.y * 3.1 + 1.7);',
  '  vec2 wa = vec2(noise(qa * 0.55 + vec2(tA * 0.0050, 0.0)), noise(qa * 0.55 - vec2(0.0, tA * 0.0038))) - 0.5;',
  '  float fa = fbm(qa + wa * (0.55 + 0.65 * warp));',
  '  float bandA = smoothstep(0.88, 0.52, uv.y) * smoothstep(0.10, 0.38, uv.y);',
  '  float fogA = smoothstep(mix(0.40, 0.47, sharp), mix(0.80, 0.63, sharp), fa) * bandA;',
  '  vec3 fogACol = mix(vec3(0.9865, 0.9925, 1.0000), vec3(0.9940, 0.9968, 1.0000), depth);',
  '  float faLow = smoothstep(0.30, 0.58, fa) * bandA;',
  '  col = mix(col, vec3(0.8350, 0.8620, 0.9000), faLow * (1.0 - fogA) * depth * 0.62);',
  '  col = mix(col, fogACol, fogA * u_fog.x);',
  '  float r1 = 0.300 + (fbm1(p.x * 1.30 + 11.0) - 0.47) * 0.26 + (fbm1(p.x * 4.2 + 5.0) - 0.5) * 0.050 * depth;',
  '  float a1 = smoothstep(r1 + mix(0.022, 0.008, depth), r1 - mix(0.012, 0.004, depth), uv.y);',
  '  a1 *= smoothstep(r1 - mix(0.34, 0.50, depth), r1 - mix(0.10, 0.16, depth), uv.y);',
  '  vec3 ridge1Col = mix(vec3(0.8950, 0.9120, 0.9350), vec3(0.7950, 0.8250, 0.8660), depth);',
  '  col = mix(col, ridge1Col, min(a1 * 0.46 * mtn, 0.92));',
  '  col += vec3(0.0095, 0.0090, 0.0066) * exp(-pow((uv.y - r1) / 0.007, 2.0)) * 0.34 * breath * (1.0 + 1.4 * depth);',
  '  vec2 qb = vec2(p.x * 1.15 - tB * 0.0190, uv.y * 2.3 - tB * 0.0016 + 8.2);',
  '  float wb = fbm(qb * 0.5 + vec2(tB * 0.0040, -tB * 0.0030)) - 0.5;',
  '  float fb = fbm(qb + wb * (0.70 + 0.60 * warp));',
  '  float bandB = smoothstep(0.66, 0.30, uv.y) * smoothstep(0.04, 0.22, uv.y);',
  '  float fogB = smoothstep(mix(0.45, 0.46, sharp), mix(0.85, 0.68, sharp), fb) * bandB;',
  '  vec3 fogBCol = mix(vec3(0.8880, 0.9060, 0.9310), vec3(0.7450, 0.7820, 0.8290), depth);',
  '  col = mix(col, fogBCol, fogB * u_fog.y);',
  '  float r2 = 0.225 + (fbm1(p.x * 1.85 + 47.0) - 0.47) * 0.32 + (fbm1(p.x * 5.1 + 57.0) - 0.5) * 0.065 * depth;',
  '  float a2 = smoothstep(r2 + mix(0.016, 0.006, depth), r2 - mix(0.010, 0.004, depth), uv.y);',
  '  a2 *= smoothstep(r2 - mix(0.30, 0.46, depth), r2 - mix(0.08, 0.13, depth), uv.y);',
  '  vec3 ridge2Col = mix(vec3(0.8845, 0.9025, 0.9280), vec3(0.7150, 0.7530, 0.8030), depth);',
  '  col = mix(col, ridge2Col, min(a2 * 0.50 * mtn, 0.94));',
  '  col += vec3(0.0110, 0.0096, 0.0060) * exp(-pow((uv.y - r2) / 0.006, 2.0)) * depth * breath * 0.9;',
  '  float r3 = 0.150 + (fbm1(p.x * 2.55 + 83.0) - 0.47) * 0.38 + (fbm1(p.x * 6.3 + 91.0) - 0.5) * 0.080 * depth;',
  '  float a3 = smoothstep(r3 + mix(0.012, 0.005, depth), r3 - mix(0.008, 0.003, depth), uv.y);',
  '  a3 *= smoothstep(r3 - mix(0.26, 0.40, depth), r3 - mix(0.06, 0.10, depth), uv.y);',
  '  vec3 ridge3Col = mix(vec3(0.8740, 0.8935, 0.9210), vec3(0.6280, 0.6720, 0.7300), depth);',
  '  col = mix(col, ridge3Col, min(a3 * 0.52 * mtn, 0.95));',
  '  col += vec3(0.0096, 0.0082, 0.0050) * exp(-pow((uv.y - r3) / 0.006, 2.0)) * depth * breath * 0.7;',
  '  float r4 = 0.105 + (fbm1(p.x * 3.10 + 131.0) - 0.47) * 0.40 + (fbm1(p.x * 8.2 + 141.0) - 0.5) * 0.075;',
  '  float a4 = smoothstep(r4 + 0.006, r4 - 0.003, uv.y);',
  '  a4 *= smoothstep(r4 - 0.30, r4 - 0.07, uv.y);',
  '  col = mix(col, vec3(0.5450, 0.5950, 0.6600), min(a4 * r4amt, 0.94));',
  '  vec2 qc = vec2(p.x * 0.72 + tC * 0.0072, uv.y * 1.7 + 3.9);',
  '  float wc = fbm(qc * 0.6 - vec2(tC * 0.0030, 0.0)) - 0.5;',
  '  float fc = fbm(qc + wc * (0.80 + 0.70 * warp));',
  '  float bandC = smoothstep(mix(0.50, 0.40, depth), mix(0.14, 0.05, depth), uv.y);',
  '  float fogC = smoothstep(mix(0.42, 0.45, sharp), mix(0.82, 0.66, sharp), fc) * bandC;',
  '  vec3 fogCCol = mix(vec3(0.9405, 0.9540, 0.9590), vec3(0.9600, 0.9690, 0.9750), depth);',
  '  col = mix(col, fogCCol, fogC * u_fog.z);',
  '  float wisp = fbm(vec2(p.x * 4.6 - tW * 0.030, uv.y * 13.0 + 6.0));',
  '  float bandW = smoothstep(0.62, 0.40, uv.y) * smoothstep(0.16, 0.30, uv.y);',
  '  col += vec3(0.0080, 0.0082, 0.0080) * smoothstep(0.60, 0.86, wisp) * bandW * u_detail.x;',
  '  float fgn = fbm(vec2(p.x * 1.30 + tW * 0.0165, uv.y * 2.7 - tW * 0.0035 + 21.0));',
  '  float bandF = smoothstep(0.36, 0.02, uv.y);',
  '  float fg = smoothstep(0.50, 0.88, fgn) * bandF;',
  '  col = mix(col, vec3(0.9600, 0.9700, 0.9790), fg * u_detail.y);',
  '  vec2 lo = vec2(-0.06, 1.14);',
  '  vec2 ldir = normalize(vec2(0.56, -0.83));',
  '  vec2 rel = p - lo;',
  '  float along = dot(rel, ldir);',
  '  float sperp = dot(rel, vec2(-ldir.y, ldir.x));',
  '  float perp = abs(sperp);',
  '  float beamWide = smoothstep(mix(0.52, 0.72, depth), 0.0, perp);',
  '  float beamCore = smoothstep(mix(0.16, 0.24, depth), 0.0, perp);',
  '  float fall = smoothstep(-0.10, 0.30, along) * exp(-along * mix(0.85, 0.55, depth));',
  '  float beam = (beamWide * 0.62 + beamCore * 0.38) * fall;',
  '  beam *= 0.72 + 0.55 * fogA;',
  '  col += vec3(0.0420, 0.0355, 0.0210) * beam * u_light.x * breath;',
  '  float sun = exp(-pow(length(rel) / 0.78, 2.0));',
  '  col += vec3(0.1150, 0.0940, 0.0490) * sun * depth * breath;',
  '  float rayN = fbm1(sperp * 6.5 + tW * 0.0110 + 3.0);',
  '  float rays = smoothstep(0.50, 0.86, rayN) * beamWide * fall * (0.45 + 0.95 * fogA);',
  '  col += vec3(0.0540, 0.0455, 0.0265) * rays * u_light.y * breath;',
  '  col -= vec3(0.0125, 0.0100, 0.0052) * (1.0 - smoothstep(0.30, 0.62, rayN)) * beamWide * fall * u_light.y * 0.45;',
  '  float cool = smoothstep(1.15, 0.25, length(vec2(p.x - aspect, uv.y + 0.08)));',
  '  col -= vec3(0.0095, 0.0070, 0.0030) * cool * u_light.z;',
  '  float vig = smoothstep(0.55, 1.45, length(vec2((p.x - aspect * 0.52) * 0.82, (uv.y - 0.55) * 1.05)));',
  '  col -= vec3(0.0060, 0.0050, 0.0030) * vig * u_light.z;',
  '  float dn = hash(gl_FragCoord.xy + vec2(mod(floor(u_time * 6.0), 9.0) * 17.0, 0.0));',
  '  col += (dn - 0.5) * 0.0055;',
  '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
  '}',
].join('\n')

export function init(canvas, getParams) {
  const gl = createGlContext(canvas)
  if (!gl) return null
  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SHADER, 'mist')
  if (!program) return null
  const buffer = setupFullscreenQuad(gl, program)
  if (!buffer) {
    gl.deleteProgram(program)
    return null
  }

  const loc = {
    time: gl.getUniformLocation(program, 'u_time'),
    res: gl.getUniformLocation(program, 'u_res'),
    fog: gl.getUniformLocation(program, 'u_fog'),
    shape: gl.getUniformLocation(program, 'u_shape'),
    light: gl.getUniformLocation(program, 'u_light'),
    detail: gl.getUniformLocation(program, 'u_detail'),
    phase: gl.getUniformLocation(program, 'u_phase'),
    baseTop: gl.getUniformLocation(program, 'u_baseTop'),
  }

  let width = 1
  let height = 1
  let simTime = 0
  let phaseA = 0
  let phaseB = 0
  let phaseC = 0
  let phaseW = 0
  let breathPhase = 0
  // Read tokens off `canvas`, NOT documentElement. The .atmosphere-backdrop div
  // (canvas's parent) gets data-theme during React render, so its tokens are already
  // the new theme here; documentElement's data-theme is written by useTheme's parent
  // effect which fires AFTER this child effect — reading it would bake the PREVIOUS
  // theme's colors into the new canvas (the theme-switch "residue" bug).
  let palette = readPalette(PALETTE_SPEC, canvas)

  // Current (interpolated) params, seeded from the initial preset.
  const cur = {}
  const initial = PRESETS[getParams()] || PRESETS.medium
  for (const k of PARAM_KEYS) cur[k] = initial[k]

  function applyPalette() {
    gl.useProgram(program)
    gl.uniform3fv(loc.baseTop, palette.baseTop)
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
    gl.viewport(0, 0, w, h)
  }

  function uploadAndDraw(params, pA, pB, pC, pW, bPhase, timeSec) {
    const breath = (1.0 - params.breathAmp) + params.breathAmp * (0.5 + 0.5 * Math.sin(bPhase))
    gl.useProgram(program)
    gl.uniform1f(loc.time, timeSec)
    gl.uniform2f(loc.res, width, height)
    gl.uniform3f(loc.fog, params.fogA, params.fogB, params.fogC)
    gl.uniform4f(loc.shape, params.sharp, params.warp, params.mtn, params.r4)
    gl.uniform4f(loc.light, params.beam, params.rays, params.vig, params.botDark)
    gl.uniform4f(loc.detail, params.wisp, params.fgw, params.depth, breath)
    gl.uniform4f(loc.phase, pA, pB, pC, pW)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function frame(dt) {
    let step = dt
    if (step > 0.05) step = 0.05
    const target = PRESETS[getParams()] || PRESETS.medium
    if (step > 0) {
      simTime += step
      const k = 1 - Math.exp(-step * 4.0)
      for (const key of PARAM_KEYS) {
        cur[key] += (target[key] - cur[key]) * k
      }
      phaseA += step * cur.spdA
      phaseB += step * cur.spdB
      phaseC += step * cur.spdC
      phaseW += step * cur.spdW
      breathPhase += step * cur.breathRate
    }
    uploadAndDraw(cur, phaseA, phaseB, phaseC, phaseW, breathPhase, simTime)
  }

  function renderStatic() {
    uploadAndDraw(PRESETS[STATIC_PRESET], STILL_PHASE, STILL_PHASE, STILL_PHASE, STILL_PHASE, STILL_BREATH_PHASE, STILL_PHASE)
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
