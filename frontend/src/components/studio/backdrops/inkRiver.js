// 深空·墨河 — ink theme backdrop (WebGL).
// Ported from design-explorations/backdrops/ink-river.html. The fbm-driven ink
// river, parallax starfield, and meteor scheduler are preserved verbatim; only the
// hard-coded base/nebula colors now prefer the live ink-theme CSS tokens.

import { createGlContext, createProgram, setupFullscreenQuad, loseContext, VERTEX_SRC } from './glHelpers'
import { readPalette, DPR_CAP } from './colorTokens'

const STATIC_TIME = 26.0 // reduced-motion single-frame timestamp
const STATIC_PRESET = 'medium'

// Three intensity presets. `subtle` is bit-for-bit the original concept; medium ≈ 2.5×,
// rich ≈ 5×+. Each preset scales river width, filament contrast, edge breakup, star
// density/radius, nebula wash, motion speed, and meteor cadence together.
const PRESETS = {
  subtle: {
    speed: 1.0,
    river: [0.115, 0.016, 1.0, 0.22],
    mask: [0.18, 0.62, 0.55, 0.70],
    fil: [0.30, 0.85, 2.2],
    star: [0.0, 1.0, 1.0],
    glint: [0.0, 1.0],
    misc: [0.0, 0.93, 0.10, 0.55],
    meteorFirst: [14, 6],
    meteorEvery: [25, 15],
  },
  medium: {
    speed: 1.5,
    river: [0.26, 0.038, 1.25, 0.20],
    mask: [0.14, 0.55, 0.50, 0.85],
    fil: [0.28, 1.05, 2.5],
    star: [0.012, 1.6, 1.3],
    glint: [0.010, 1.5],
    misc: [0.5, 0.915, 0.22, 0.75],
    meteorFirst: [7, 5],
    meteorEvery: [15, 9],
  },
  rich: {
    speed: 2.2,
    river: [0.46, 0.075, 1.55, 0.18],
    mask: [0.10, 0.48, 0.45, 1.00],
    fil: [0.24, 1.30, 2.9],
    star: [0.025, 2.4, 1.7],
    glint: [0.022, 2.1],
    misc: [1.0, 0.895, 0.34, 1.0],
    meteorFirst: [3, 3],
    meteorEvery: [8, 7],
  },
}

// Base gradient + nebula wash colors. Tokens drive them at runtime; the fallbacks are
// the concept's hand-converted sRGB. (The ink #root gradient is darker than --bg, so
// the gradient stops keep concept fallbacks and are only lightly nudged by tokens.)
const PALETTE_SPEC = {
  c1: { token: '--shell-base-a', fallback: '#000509' },
  c2: { token: '--shell-base-b', fallback: '#000104' },
  c3: { token: '--shell-base-c', fallback: '#000405' },
  accent: { token: '--accent', fallback: '#4f9a94' },
}

const FRAGMENT_SRC = [
  'precision highp float;',
  '',
  'uniform float u_time;',
  'uniform vec2 u_res;',
  'uniform vec4 u_meteor;',
  'uniform vec2 u_meteorDir;',
  'uniform vec4 u_river;',
  'uniform vec4 u_mask;',
  'uniform vec3 u_fil;',
  'uniform vec3 u_star;',
  'uniform vec2 u_glint;',
  'uniform vec4 u_misc;',
  'uniform vec3 u_c1;',
  'uniform vec3 u_c2;',
  'uniform vec3 u_c3;',
  '',
  'varying vec2 v_uv;',
  '',
  'float hash(vec2 p) {',
  '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);',
  '}',
  'vec2 hash2(vec2 p) {',
  '  return fract(sin(vec2(dot(p, vec2(269.5, 183.3)), dot(p, vec2(113.5, 271.9)))) * 43758.5453123);',
  '}',
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
  'mat2 rot(float a) {',
  '  float s = sin(a);',
  '  float c = cos(a);',
  '  return mat2(c, -s, s, c);',
  '}',
  'float fbm(vec2 p) {',
  '  float v = 0.0;',
  '  float amp = 0.52;',
  '  mat2 turn = rot(0.56);',
  '  for (int i = 0; i < 5; i += 1) {',
  '    v += amp * noise(p);',
  '    p = turn * p * 2.04 + vec2(13.7, 8.3);',
  '    amp *= 0.52;',
  '  }',
  '  return v;',
  '}',
  'float fbm3(vec2 p) {',
  '  float v = 0.0;',
  '  float amp = 0.55;',
  '  mat2 turn = rot(0.56);',
  '  for (int i = 0; i < 3; i += 1) {',
  '    v += amp * noise(p);',
  '    p = turn * p * 2.04 + vec2(13.7, 8.3);',
  '    amp *= 0.52;',
  '  }',
  '  return v;',
  '}',
  'float starLayer(vec2 uv, float grid, float threshold, float radius, float t, float sparkle) {',
  '  vec2 cell = floor(uv * grid);',
  '  vec2 local = fract(uv * grid);',
  '  vec2 rnd = hash2(cell);',
  '  vec2 star = 0.10 + rnd * 0.80;',
  '  float dist = length(local - star);',
  '  float core = smoothstep(radius, 0.0, dist);',
  '  float gate = step(threshold, rnd.x);',
  '  float twinkle = 0.68 + 0.32 * sin(t * sparkle + rnd.x * 57.0 + rnd.y * 31.0);',
  '  return core * gate * twinkle;',
  '}',
  'float glintLayer(vec2 uv, float grid, float threshold, float radius, float t) {',
  '  vec2 cell = floor(uv * grid);',
  '  vec2 local = fract(uv * grid);',
  '  vec2 rnd = hash2(cell + vec2(41.0, 19.0));',
  '  vec2 star = 0.16 + rnd * 0.68;',
  '  vec2 delta = abs(local - star);',
  '  float gate = step(threshold, rnd.x);',
  '  float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * 0.9 + rnd.y * 41.0), 3.0);',
  '  float core = smoothstep(radius, 0.0, length(delta));',
  '  float horizontal = smoothstep(radius * 6.0, 0.0, delta.x) * smoothstep(radius * 0.6, 0.0, delta.y);',
  '  float vertical = smoothstep(radius * 0.6, 0.0, delta.x) * smoothstep(radius * 3.8, 0.0, delta.y);',
  '  return gate * pulse * (core + (horizontal + vertical) * 0.16);',
  '}',
  'float meteor(vec2 p, float t) {',
  '  float age = t - u_meteor.x;',
  '  if (u_meteor.w < 0.5 || age < 0.0 || age > 2.4) return 0.0;',
  '  vec2 a = u_meteor.yz;',
  '  float travel = clamp(age / 0.55, 0.0, 1.0);',
  '  vec2 ab = u_meteorDir * travel;',
  '  float len2 = max(dot(ab, ab), 1e-6);',
  '  float h = clamp(dot(p - a, ab) / len2, 0.0, 1.0);',
  '  vec2 closest = a + ab * h;',
  '  float d = length(p - closest);',
  '  float passAge = max(age - h * 0.55, 0.0);',
  '  float fade = exp(-passAge * 3.0);',
  '  float core = exp(-d * d * 130000.0);',
  '  float halo = exp(-d * d * 14000.0) * 0.2;',
  '  vec2 hd = p - (a + u_meteorDir * travel);',
  '  float head = exp(-dot(hd, hd) * 36000.0) * (1.0 - step(0.55, age)) * 1.1;',
  '  return (core + halo) * fade + head;',
  '}',
  'void main() {',
  '  vec2 uv = v_uv;',
  '  float aspect = u_res.x / max(u_res.y, 1.0);',
  '  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);',
  '  float t = u_time;',
  '  float g = clamp((uv.x + (1.0 - uv.y)) * 0.5, 0.0, 1.0);',
  '  vec3 base = mix(mix(u_c1, u_c2, smoothstep(0.0, 0.55, g)), u_c3, smoothstep(0.55, 1.0, g));',
  '  float cloud = fbm3(p * 1.7 + vec2(t * 0.013, -t * 0.009));',
  '  float w1 = smoothstep(0.95, 0.10, length((p - vec2(-0.14, 0.16)) * vec2(0.85, 1.30)));',
  '  float w2 = smoothstep(0.90, 0.08, length((p - vec2(0.30, -0.24)) * vec2(1.20, 0.80)));',
  '  base += vec3(0.124, 0.246, 0.308) * w1 * smoothstep(0.32, 0.85, cloud) * 0.050;',
  '  base += vec3(0.073, 0.205, 0.190) * w2 * smoothstep(0.40, 0.90, 1.0 - cloud) * 0.036;',
  '  if (u_misc.x > 0.001) {',
  '    vec2 np = p * vec2(0.95, 1.35) + vec2(t * 0.0045, -t * 0.0032);',
  '    float neb = fbm(np + vec2(7.7, 2.1));',
  '    float nebFine = fbm3(np * 2.6 + vec2(3.1, 9.4));',
  '    neb = smoothstep(0.38, 0.92, neb + (nebFine - 0.5) * 0.30);',
  '    float nebW = smoothstep(1.15, 0.20, length((p - vec2(0.06, 0.10)) * vec2(0.72, 1.05)));',
  '    vec3 nebCol = mix(vec3(0.082, 0.178, 0.196), vec3(0.075, 0.150, 0.215), smoothstep(0.2, 0.8, uv.y));',
  '    base += nebCol * neb * nebW * 0.34 * u_misc.x;',
  '  }',
  '  vec3 color = base;',
  '  float rx = p.x;',
  '  float meander = (fbm3(vec2(rx * 0.80 + t * 0.011, 7.31)) - 0.5) * 0.24 + sin(rx * 1.45 - t * 0.024) * 0.03;',
  '  float yc = 0.685 + meander;',
  '  float dy = uv.y - yc;',
  '  float band = 0.26 + 0.08 * u_river.z;',
  '  if (abs(dy) < band) {',
  '    float edgeFade = smoothstep(band, band - 0.06, abs(dy));',
  '    float wMod = fbm3(vec2(rx * 1.5 - t * 0.017, 3.17));',
  '    float halfW = (0.045 + 0.050 * wMod) * u_river.z;',
  '    float env = exp(-(dy * dy) / (halfW * halfW) * 1.8);',
  '    float envWide = exp(-(dy * dy) / (halfW * halfW) * 0.32);',
  '    vec2 fp = vec2(rx * 2.3 - t * 0.050, dy * 13.0 + t * 0.006);',
  '    fp += (vec2(fbm3(fp * 0.8 + vec2(0.0, t * 0.020)), fbm3(fp * 0.8 + vec2(5.2, -t * 0.016))) - 0.5) * 1.1;',
  '    float fil = fbm(fp);',
  '    float ridge = pow(clamp(1.0 - abs(fil - 0.52) * u_fil.z, 0.0, 1.0), 2.6);',
  '    float breakup = fbm3(vec2(rx * 2.9 + t * 0.014, uv.y * 7.5 - t * 0.008));',
  '    float mask = smoothstep(u_mask.x, u_mask.y, env * (u_mask.z + u_mask.w * breakup));',
  '    float pulse = (1.0 - u_river.w) + u_river.w * sin(rx * 1.1 - t * 0.18);',
  '    float breath = 0.86 + 0.14 * sin(t * 0.12 + 1.7);',
  '    float river = mask * (u_fil.x + u_fil.y * ridge) * pulse * breath;',
  '    float hueN = fbm3(vec2(rx * 0.55 + t * 0.008, 11.7));',
  '    vec3 teal = vec3(0.310, 0.604, 0.580);',
  '    vec3 cyanT = vec3(0.295, 0.585, 0.640);',
  '    vec3 blueT = vec3(0.260, 0.490, 0.600);',
  '    vec3 riverCol = mix(teal, cyanT, smoothstep(0.30, 0.62, hueN));',
  '    riverCol = mix(riverCol, blueT, smoothstep(0.58, 0.92, hueN));',
  '    vec3 riverGlow = riverCol * river * u_river.x;',
  '    riverGlow += riverCol * envWide * u_river.y;',
  '    float motes = starLayer(vec2(uv.x - t * 0.004, uv.y + meander * 0.2), 160.0, u_misc.y, 0.030, t, 1.3);',
  '    riverGlow += riverCol * motes * env * u_misc.z;',
  '    color += riverGlow * edgeFade;',
  '  }',
  '  vec2 drift = vec2(t * 0.0016, t * 0.00055);',
  '  float farS = starLayer(uv + vec2(0.27, 0.43) + drift * 0.25, 360.0, 0.965 - u_star.x, 0.034 * u_star.z, t, 2.0);',
  '  float midS = starLayer(uv + vec2(0.13, 0.07) + drift * 0.55, 230.0, 0.945 - u_star.x, 0.030 * u_star.z, t, 1.5);',
  '  float nearS = starLayer(uv + vec2(0.37, 0.23) + drift, 110.0, 0.948 - u_star.x, 0.034 * u_star.z, t, 0.9);',
  '  float warmS = starLayer(uv + vec2(0.61, 0.17) + drift * 0.7, 150.0, 0.972 - u_star.x, 0.030 * u_star.z, t, 1.1);',
  '  float glint = glintLayer(uv + vec2(0.19, 0.31) + drift * 0.4, 60.0, 0.978 - u_glint.x, 0.028 * u_star.z, t);',
  '  color += vec3(0.78, 0.85, 0.95) * (farS * 0.20 + midS * 0.34 + nearS * 0.55) * u_star.y;',
  '  color += vec3(0.86, 0.74, 0.58) * warmS * 0.20 * u_star.y;',
  '  color += vec3(0.82, 0.92, 1.00) * glint * 0.62 * u_glint.y;',
  '  color += vec3(0.76, 0.88, 0.90) * meteor(p, t) * u_misc.w;',
  '  float vig = smoothstep(1.25, 0.30, length(p * vec2(0.82, 1.05)));',
  '  color *= 0.62 + vig * 0.38;',
  '  color += (hash(gl_FragCoord.xy + vec2(fract(t) * 13.0, 0.0)) - 0.5) * 0.006;',
  '  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);',
  '}',
].join('\n')

export function init(canvas, getParams) {
  const gl = createGlContext(canvas)
  if (!gl) return null
  const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC, 'ink-river')
  if (!program) return null
  const buffer = setupFullscreenQuad(gl, program)
  if (!buffer) {
    gl.deleteProgram(program)
    return null
  }

  const loc = {
    time: gl.getUniformLocation(program, 'u_time'),
    res: gl.getUniformLocation(program, 'u_res'),
    meteor: gl.getUniformLocation(program, 'u_meteor'),
    meteorDir: gl.getUniformLocation(program, 'u_meteorDir'),
    river: gl.getUniformLocation(program, 'u_river'),
    mask: gl.getUniformLocation(program, 'u_mask'),
    fil: gl.getUniformLocation(program, 'u_fil'),
    star: gl.getUniformLocation(program, 'u_star'),
    glint: gl.getUniformLocation(program, 'u_glint'),
    misc: gl.getUniformLocation(program, 'u_misc'),
    c1: gl.getUniformLocation(program, 'u_c1'),
    c2: gl.getUniformLocation(program, 'u_c2'),
    c3: gl.getUniformLocation(program, 'u_c3'),
  }

  let width = 1
  let height = 1
  let animTime = 0
  let palette = readPalette(PALETTE_SPEC)

  // Meteor scheduler state (all pre-allocated; frame loop allocates nothing).
  let meteorStart = -10
  let meteorAx = 0
  let meteorAy = 0
  let meteorDx = 0
  let meteorDy = 0
  let meteorActive = 0

  const presetFor = (reduced) => PRESETS[reduced ? STATIC_PRESET : getParams()] || PRESETS.medium
  let nextMeteorAt = (PRESETS.medium.meteorFirst[0] + Math.random() * PRESETS.medium.meteorFirst[1]) * PRESETS.medium.speed

  function applyPalette() {
    gl.useProgram(program)
    gl.uniform3fv(loc.c1, palette.c1)
    gl.uniform3fv(loc.c2, palette.c2)
    gl.uniform3fv(loc.c3, palette.c3)
  }

  function applyUniforms(p) {
    gl.uniform4f(loc.river, p.river[0], p.river[1], p.river[2], p.river[3])
    gl.uniform4f(loc.mask, p.mask[0], p.mask[1], p.mask[2], p.mask[3])
    gl.uniform3f(loc.fil, p.fil[0], p.fil[1], p.fil[2])
    gl.uniform3f(loc.star, p.star[0], p.star[1], p.star[2])
    gl.uniform2f(loc.glint, p.glint[0], p.glint[1])
    gl.uniform4f(loc.misc, p.misc[0], p.misc[1], p.misc[2], p.misc[3])
  }

  function spawnMeteor(t, preset) {
    const aspect = width / Math.max(height, 1)
    const ux = 0.12 + Math.random() * 0.6
    const uy = 0.60 + Math.random() * 0.28
    const sign = Math.random() < 0.5 ? -1 : 1
    const ang = (-(14 + Math.random() * 16)) * Math.PI / 180
    const len = 0.45 + Math.random() * 0.40
    const every = preset.meteorEvery
    meteorAx = (ux - 0.5) * aspect
    meteorAy = uy - 0.5
    meteorDx = Math.cos(ang) * len * sign
    meteorDy = Math.sin(ang) * len
    meteorStart = t
    meteorActive = 1
    nextMeteorAt = t + (every[0] + Math.random() * every[1]) * preset.speed
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

  function draw(t) {
    gl.useProgram(program)
    gl.uniform1f(loc.time, t)
    gl.uniform2f(loc.res, width, height)
    gl.uniform4f(loc.meteor, meteorStart, meteorAx, meteorAy, meteorActive)
    gl.uniform2f(loc.meteorDir, meteorDx, meteorDy)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function frame(dt) {
    const preset = presetFor(false)
    let step = dt
    if (!(step > 0)) step = 0.016
    if (step > 0.1) step = 0.1
    animTime += step * preset.speed
    if (animTime >= nextMeteorAt) spawnMeteor(animTime, preset)
    applyUniforms(preset)
    draw(animTime)
  }

  function renderStatic() {
    applyUniforms(PRESETS[STATIC_PRESET])
    meteorActive = 0
    draw(STATIC_TIME)
  }

  function refreshPalette() {
    palette = readPalette(PALETTE_SPEC)
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
