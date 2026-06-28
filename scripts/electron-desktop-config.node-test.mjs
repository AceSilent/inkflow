import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const viteConfig = await readFile(new URL('../frontend/vite.config.js', import.meta.url), 'utf8')

test('Electron desktop scripts build, run, and install the mac app', () => {
  assert.equal(pkg.main, 'electron/main.cjs')
  assert.equal(pkg.scripts['desktop:dev:electron'], 'node scripts/electron-dev.mjs')
  assert.equal(pkg.scripts['desktop:build:electron:mac'], 'node scripts/electron-build.mjs --mac')
  assert.equal(pkg.scripts['desktop:install:electron:mac'], 'node scripts/electron-install-mac.mjs')
  assert.ok(pkg.devDependencies.electron)
  assert.ok(pkg.devDependencies['electron-builder'])
})

test('Electron main window keeps the native macOS shell polish', async () => {
  assert.equal(existsSync(new URL('../electron/main.cjs', import.meta.url)), true)
  assert.equal(existsSync(new URL('../electron/preload.cjs', import.meta.url)), true)

  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  assert.match(main, /new BrowserWindow/)
  assert.match(main, /titleBarStyle:\s*'hiddenInset'/)
  assert.match(main, /trafficLightPosition:\s*\{\s*x:\s*14,\s*y:\s*22\s*\}/)
  assert.match(main, /transparent:\s*true/)
  assert.match(main, /vibrancy:\s*'under-window'/)
  assert.match(main, /backgroundColor:\s*'#00000000'/)
})

test('Electron sidecar uses the existing InkFlow data directory', async () => {
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  assert.match(main, /AUTONOVEL_DATA_DIR/)
  assert.match(main, /app\.getPath\('appData'\)/)
  assert.match(main, /com\.inkflow\.studio/)
  assert.match(main, /books/)
  assert.match(main, /inkflow-server-aarch64-apple-darwin/)
  assert.match(main, /process\.resourcesPath/)
})

test('Electron builder packages the frontend and backend sidecar without changing app identity', async () => {
  assert.equal(existsSync(new URL('../electron-builder.yml', import.meta.url)), true)
  const builder = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')
  assert.match(builder, /appId:\s*com\.inkflow\.studio/)
  assert.match(builder, /productName:\s*InkFlow/)
  assert.match(builder, /frontend\/dist\/\*\*\//)
  assert.match(builder, /desktop\/binaries\/inkflow-server/)
  assert.match(builder, /desktop\/icon\.icns/)
})

test('frontend build emits relative asset URLs for Electron file loading', () => {
  assert.match(viteConfig, /base:\s*['"]\.\/['"]/)
})
