const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const API_BASE = 'http://127.0.0.1:3001'
const APP_DATA_ID = 'com.inkflow.studio'
const DEV_URL = process.env.INKFLOW_ELECTRON_DEV_URL || 'http://127.0.0.1:5173'
const MAC_ARM_SIDECAR = 'inkflow-server-aarch64-apple-darwin'
const MAC_X64_SIDECAR = 'inkflow-server-x86_64-apple-darwin'

let mainWindow = null
let sidecarProcess = null

function sidecarSuffix() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? MAC_ARM_SIDECAR.replace('inkflow-server-', '')
      : MAC_X64_SIDECAR.replace('inkflow-server-', '')
  }
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc.exe'
  return 'x86_64-unknown-linux-gnu'
}

function sidecarName() {
  return `inkflow-server-${sidecarSuffix()}`
}

function appRoot() {
  return path.resolve(__dirname, '..')
}

function resolveSidecarPath() {
  const name = sidecarName()
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'binaries', name)
  }
  return path.join(appRoot(), 'src-tauri', 'binaries', name)
}

function resolveFrontendIndex() {
  return path.join(appRoot(), 'frontend', 'dist', 'index.html')
}

function resolveDataDir() {
  return path.join(app.getPath('appData'), APP_DATA_ID, 'books')
}

function waitForHealth(timeoutMs = 12000) {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(`${API_BASE}/health`, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(tick, 250)
      })
      req.setTimeout(900, () => {
        req.destroy()
      })
    }
    tick()
  })
}

async function startSidecar() {
  const dataDir = resolveDataDir()
  fs.mkdirSync(dataDir, { recursive: true })

  const binary = resolveSidecarPath()
  if (!fs.existsSync(binary)) {
    throw new Error(`InkFlow sidecar not found: ${binary}`)
  }

  sidecarProcess = spawn(binary, [], {
    cwd: app.getPath('appData'),
    env: {
      ...process.env,
      AUTONOVEL_DATA_DIR: dataDir,
      INKFLOW_DESKTOP_SHELL: 'electron',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  sidecarProcess.stdout?.on('data', (chunk) => {
    console.log(`[inkflow-server] ${chunk.toString().trimEnd()}`)
  })
  sidecarProcess.stderr?.on('data', (chunk) => {
    console.error(`[inkflow-server] ${chunk.toString().trimEnd()}`)
  })
  sidecarProcess.once('exit', (code, signal) => {
    if (sidecarProcess) {
      console.log(`[inkflow-server] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    }
    sidecarProcess = null
  })

  await waitForHealth()
}

function stopSidecar() {
  const child = sidecarProcess
  sidecarProcess = null
  if (!child || child.killed) return
  child.kill('SIGTERM')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'InkFlow',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 22 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    roundedCorners: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })

  if (process.env.INKFLOW_ELECTRON_DEV === '1') {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadFile(resolveFrontendIndex())
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.setName('InkFlow')
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess')

app.whenReady().then(async () => {
  await startSidecar()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error) => {
  console.error(error)
  app.quit()
})

app.on('before-quit', stopSidecar)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
