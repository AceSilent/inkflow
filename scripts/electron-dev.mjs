import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function waitForUrl(url, timeoutMs = 20000) {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }
        setTimeout(tick, 250)
      })
      req.setTimeout(900, () => req.destroy())
    }
    tick()
  })
}

run(process.execPath, [path.join(root, 'scripts', 'build-sidecar.mjs'), '--mac-dev'])

// Bind vite to 127.0.0.1 explicitly. Vite 8 otherwise binds IPv6 [::1] only, so the
// IPv4 health probe below (and Electron's loadURL on 127.0.0.1) can't connect and the
// dev launcher times out before Electron ever starts.
const frontend = spawn(process.execPath, [path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'], {
  cwd: path.join(root, 'frontend'),
  stdio: 'inherit',
  env: { ...process.env, INKFLOW_API_TARGET: 'http://127.0.0.1:3001' },
})

const electron = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')

try {
  await waitForUrl('http://127.0.0.1:5173')
  // Opt-in Chromium DevTools Protocol port for debugging the renderer (theme/backdrop
  // work). Set INKFLOW_ELECTRON_DEBUG=9222 to enable; off by default.
  const electronArgs = ['.']
  if (process.env.INKFLOW_ELECTRON_DEBUG) {
    electronArgs.push(`--remote-debugging-port=${process.env.INKFLOW_ELECTRON_DEBUG}`)
  }
  const appProcess = spawn(electron, electronArgs, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      INKFLOW_ELECTRON_DEV: '1',
      INKFLOW_ELECTRON_DEV_URL: 'http://127.0.0.1:5173',
    },
  })

  const cleanup = () => {
    frontend.kill('SIGTERM')
    appProcess.kill('SIGTERM')
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  appProcess.on('exit', (code) => {
    frontend.kill('SIGTERM')
    process.exit(code ?? 0)
  })
} catch (error) {
  frontend.kill('SIGTERM')
  throw error
}
