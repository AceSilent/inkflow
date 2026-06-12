// Minimal WebGL plumbing shared by the three shader-based backdrops
// (ink-river, mist, paper). Each backdrop owns its own GL context; these helpers
// only build / tear down the fullscreen-quad program so teardown stays leak-free.

export function createGlContext(canvas) {
  const attrs = {
    alpha: false,
    antialias: false,
    depth: false,
    desynchronized: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: false,
    stencil: false,
  }
  return canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl')
}

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(`InkFlow ${label} shader failed to compile:`, gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function createProgram(gl, vertexSrc, fragmentSrc, label) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSrc, label)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc, label)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn(`InkFlow ${label} program failed to link:`, gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

// Build the standard fullscreen quad, bind a_pos, and configure shared GL state.
// Returns the buffer (for later deletion) or null on failure.
export function setupFullscreenQuad(gl, program) {
  const position = gl.getAttribLocation(program, 'a_pos')
  const buffer = gl.createBuffer()
  if (!buffer || position < 0) {
    if (buffer) gl.deleteBuffer(buffer)
    return null
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.useProgram(program)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)
  return buffer
}

// Best-effort GL context release on destroy.
export function loseContext(gl) {
  const ext = gl.getExtension('WEBGL_lose_context')
  if (ext) ext.loseContext()
}

export const VERTEX_SRC = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main() {',
  '  v_uv = a_pos * 0.5 + 0.5;',
  '  gl_Position = vec4(a_pos, 0.0, 1.0);',
  '}',
].join('\n')
