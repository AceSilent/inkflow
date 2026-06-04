import { useEffect, useRef } from 'react'

const DPR_CAP = 2
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const DEEP_SPACE_FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;
uniform vec2 u_res;
uniform float u_opacity;
uniform float u_warm;

varying vec2 v_uv;

const float STAR_GRID_DENSE = 190.0;
const float STAR_GRID_FINE = 310.0;
const float NEBULA_FLOW_GAIN = 3.25;
const float STAR_TWINKLE_GAIN = 0.48;
const float PARALLAX_DRIFT = 0.12;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(
    dot(p, vec2(269.5, 183.3)),
    dot(p, vec2(113.5, 271.9))
  )) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 turn = rotate2d(0.56);

  for (int i = 0; i < 5; i += 1) {
    value += amplitude * noise(p);
    p = turn * p * 2.04 + vec2(13.7, 8.3);
    amplitude *= 0.52;
  }

  return value;
}

float starLayer(vec2 uv, float gridScale, float threshold, float radius, float time, float sparkle) {
  vec2 cell = floor(uv * gridScale);
  vec2 local = fract(uv * gridScale);
  vec2 rnd = hash2(cell);
  vec2 star = 0.10 + rnd * 0.80;
  float dist = length(local - star);
  float core = smoothstep(radius, 0.0, dist);
  float gate = step(threshold, rnd.x);
  float twinkle = (1.0 - STAR_TWINKLE_GAIN) + STAR_TWINKLE_GAIN * sin(time * sparkle + rnd.x * 57.0 + rnd.y * 31.0);
  return core * gate * twinkle;
}

float glintLayer(vec2 uv, float gridScale, float threshold, float radius, float time) {
  vec2 cell = floor(uv * gridScale);
  vec2 local = fract(uv * gridScale);
  vec2 rnd = hash2(cell + vec2(41.0, 19.0));
  vec2 star = 0.16 + rnd * 0.68;
  vec2 delta = abs(local - star);
  float gate = step(threshold, rnd.x);
  float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(time * 1.15 + rnd.y * 41.0), 3.0);
  float core = smoothstep(radius, 0.0, length(delta));
  float horizontal = smoothstep(radius * 6.5, 0.0, delta.x) * smoothstep(radius * 0.62, 0.0, delta.y);
  float vertical = smoothstep(radius * 0.62, 0.0, delta.x) * smoothstep(radius * 4.2, 0.0, delta.y);
  return gate * pulse * (core + (horizontal + vertical) * 0.18);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv - 0.5;
  p.x *= u_res.x / max(u_res.y, 1.0);

  float motionTime = u_time * NEBULA_FLOW_GAIN;
  float time = motionTime;
  float longWave = motionTime * 0.12;
  vec2 slowDrift = vec2(
    sin(motionTime * 0.076) * 0.085 + sin(motionTime * 0.033 + 2.4) * 0.055,
    cos(motionTime * 0.064 + 0.7) * 0.080 + sin(motionTime * 0.041) * 0.046
  );
  vec2 flowWarp = vec2(
    fbm(p * 2.15 + vec2(motionTime * 0.055, -motionTime * 0.037)),
    fbm(rotate2d(1.18) * p * 2.05 + vec2(-motionTime * 0.043, motionTime * 0.051))
  ) - 0.5;
  vec2 nebulaP = p + flowWarp * 0.18;

  vec3 base = mix(vec3(0.004, 0.006, 0.010), vec3(0.014, 0.018, 0.027), smoothstep(-0.48, 0.52, p.y));

  vec2 flowA = nebulaP * 1.45 + slowDrift;
  vec2 flowB = rotate2d(-0.62 + sin(longWave) * 0.22) * (nebulaP * 2.85 - slowDrift * 0.8);
  float cloudNoise = fbm(flowA + vec2(motionTime * 0.058, -motionTime * 0.039));
  float veinNoise = fbm(flowB + vec2(-motionTime * 0.046, motionTime * 0.064));
  float dustNoise = fbm(nebulaP * 7.5 + vec2(motionTime * 0.045, motionTime * 0.032));

  float diagonal = smoothstep(0.46, 0.0, abs((nebulaP.y + nebulaP.x * 0.46) + 0.02 + (cloudNoise - 0.5) * 0.12));
  float blueCloud = smoothstep(0.95, 0.12, length((nebulaP - vec2(-0.20, 0.14) - slowDrift * 0.30) * vec2(0.92, 1.34)));
  float warmCloud = smoothstep(0.86, 0.10, length((nebulaP - vec2(0.24, -0.24) + slowDrift * 0.26) * vec2(1.24, 0.70)));
  float upperBlue = smoothstep(0.72, 0.10, length((nebulaP - vec2(-0.06, 0.28) + slowDrift * 0.18) * vec2(1.24, 0.92)));

  float blueBody = smoothstep(0.28, 0.82, cloudNoise) * blueCloud;
  float blueVeins = smoothstep(0.50, 0.88, veinNoise) * diagonal * blueCloud;
  float warmBody = smoothstep(0.32, 0.84, veinNoise) * warmCloud;
  float warmVeins = smoothstep(0.56, 0.92, dustNoise) * warmCloud * diagonal;

  vec3 nebula = vec3(0.0);
  nebula += vec3(0.16, 0.31, 0.50) * (blueBody * 0.46 + blueVeins * 0.42 + upperBlue * smoothstep(0.42, 0.78, cloudNoise) * 0.16);
  nebula += vec3(0.27, 0.20, 0.36) * diagonal * smoothstep(0.35, 0.82, cloudNoise) * 0.26;
  nebula += vec3(0.74, 0.29, 0.18) * u_warm * (warmBody * 0.34 + warmVeins * 0.22);
  nebula += vec3(0.44, 0.20, 0.39) * u_warm * warmCloud * smoothstep(0.40, 0.86, cloudNoise) * 0.20;

  vec2 starUv = uv + vec2(sin(motionTime * 0.018), cos(motionTime * 0.015 + 0.7)) * PARALLAX_DRIFT * 0.018;
  float farStars = starLayer(starUv + vec2(0.27, 0.43), 430.0, 0.970, 0.036, motionTime, 2.10);
  float tinyStars = starLayer(starUv + vec2(0.13, 0.07), STAR_GRID_FINE, 0.944, 0.032, motionTime, 1.55);
  float pinStars = starLayer(starUv + vec2(0.71, 0.52), 250.0, 0.938, 0.026, motionTime, 1.85);
  float denseStars = starLayer(starUv, STAR_GRID_DENSE, 0.888, 0.026, motionTime, 1.20);
  float nearStars = starLayer(starUv + vec2(0.37, 0.23), 92.0, 0.936, 0.035, motionTime, 0.82);
  float brightStars = glintLayer(starUv + vec2(0.19, 0.31), 58.0, 0.973, 0.030, motionTime);
  float warmStars = starLayer(starUv + vec2(0.61, 0.17), 122.0, 0.954, 0.029, motionTime, 1.05);

  float starField = farStars * 0.24 + tinyStars * 0.44 + pinStars * 0.36 + denseStars * 0.58 + nearStars * 0.82 + brightStars * 1.02;
  vec3 starColor = vec3(0.80, 0.88, 1.0) * starField + vec3(1.0, 0.62, 0.36) * warmStars * 0.48 * u_warm;

  float milkyDust = smoothstep(0.48, 0.86, dustNoise) * diagonal * 0.075;
  vec3 color = base + nebula + vec3(0.40, 0.55, 0.72) * milkyDust + starColor;

  float vignette = smoothstep(1.18, 0.22, length(p * vec2(0.78, 1.02)));
  float centerLift = smoothstep(0.86, 0.12, length((p - vec2(-0.04, 0.02)) * vec2(1.08, 0.92)));
  color *= 0.64 + vignette * 0.56;
  color += centerLift * vec3(0.020, 0.026, 0.036);

  color = clamp(color, 0.0, 1.0);
  color *= smoothstep(0.0, 0.08, u_opacity);
  gl_FragColor = vec4(color, 1.0);
}
`

function cssNumber(styles, name, fallback) {
  const parsed = Number.parseFloat(styles.getPropertyValue(name))
  return Number.isFinite(parsed) ? parsed : fallback
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('InkFlow deep-space shader failed to compile:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }

  return shader
}

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, DEEP_SPACE_FRAGMENT_SHADER)
  if (!vertex || !fragment) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('InkFlow deep-space program failed to link:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }

  return program
}

export function DeepSpaceBackdrop() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
      stencil: false,
    }) || canvas.getContext('experimental-webgl')
    if (!gl) return undefined

    const program = createProgram(gl)
    if (!program) return undefined

    const shell = canvas.closest('.studio-shell') || document.documentElement
    const reducedMotion = window.matchMedia?.(REDUCED_MOTION_QUERY)
    const position = gl.getAttribLocation(program, 'a_pos')
    const timeUniform = gl.getUniformLocation(program, 'u_time')
    const resUniform = gl.getUniformLocation(program, 'u_res')
    const opacityUniform = gl.getUniformLocation(program, 'u_opacity')
    const warmUniform = gl.getUniformLocation(program, 'u_warm')
    const buffer = gl.createBuffer()

    if (!buffer || position < 0) {
      gl.deleteProgram(program)
      return undefined
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.useProgram(program)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)

    let animationFrame = 0
    let width = 1
    let height = 1
    let lastThemeReadAt = -Infinity
    let themeValues = { opacity: 0, warmOpacity: 0.8 }

    const shouldReduceMotion = () => reducedMotion?.matches === true

    const readThemeValues = (now = 0) => {
      if (now - lastThemeReadAt < 800) return themeValues
      lastThemeReadAt = now
      const styles = getComputedStyle(shell)
      themeValues = {
        opacity: cssNumber(styles, '--deep-space-canvas-opacity', 0),
        warmOpacity: cssNumber(styles, '--deep-space-warm-opacity', 0.8),
      }
      return themeValues
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      width = Math.max(1, Math.round(rect.width * dpr))
      height = Math.max(1, Math.round(rect.height * dpr))

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      gl.viewport(0, 0, width, height)
    }

    const drawScene = (time = 0) => {
      const { opacity, warmOpacity } = readThemeValues(performance.now())

      gl.useProgram(program)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(timeUniform, time)
      gl.uniform2f(resUniform, width, height)
      gl.uniform1f(opacityUniform, opacity)
      gl.uniform1f(warmUniform, warmOpacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    const schedule = () => {
      if (animationFrame || shouldReduceMotion()) return
      animationFrame = window.requestAnimationFrame(frame)
    }

    const frame = (now) => {
      animationFrame = 0
      drawScene(now * 0.001)
      schedule()
    }

    const handleReducedMotionChange = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
      drawScene(0)
      schedule()
    }

    const resizeObserver = new ResizeObserver(() => {
      resize()
      drawScene(shouldReduceMotion() ? 0 : performance.now() * 0.001)
    })

    readThemeValues(performance.now())
    resize()
    resizeObserver.observe(canvas)
    drawScene(0)
    schedule()
    reducedMotion?.addEventListener?.('change', handleReducedMotionChange)
    window.addEventListener('resize', resize)

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      reducedMotion?.removeEventListener?.('change', handleReducedMotionChange)
      window.removeEventListener('resize', resize)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <div className="deep-space-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="deep-space-backdrop__canvas" />
    </div>
  )
}
