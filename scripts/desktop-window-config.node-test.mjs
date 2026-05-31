import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const capability = JSON.parse(await readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'))
const cargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')
const pkgSidecarConfig = await readFile(new URL('../scripts/pkg-sidecar.config.cjs', import.meta.url), 'utf8')

test('macOS desktop window uses native traffic lights over a rounded transparent shell', () => {
  assert.equal(config.app.macOSPrivateApi, true)
  assert.equal(config.app.withGlobalTauri, true)

  const [windowConfig] = config.app.windows
  assert.equal(windowConfig.decorations, true)
  assert.equal(windowConfig.transparent, true)
  assert.equal(windowConfig.titleBarStyle, 'Overlay')
  assert.equal(windowConfig.hiddenTitle, true)
  assert.equal(windowConfig.shadow, true)
  assert.deepEqual(windowConfig.trafficLightPosition, { x: 14, y: 22 })
  assert.deepEqual(windowConfig.windowEffects.effects, ['underWindowBackground'])

  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"2",\s*features\s*=\s*\[[^\]]*"macos-private-api"/)
})

test('desktop capability explicitly allows native titlebar dragging', () => {
  assert.deepEqual(capability.windows, ['*'])
  assert.ok(capability.permissions.includes('core:default'))
  assert.ok(capability.permissions.includes('core:window:allow-start-dragging'))
  assert.ok(capability.permissions.includes('core:window:allow-set-position'))
})

test('desktop production build refreshes backend sidecar before bundling', async () => {
  assert.equal(config.build.beforeBuildCommand, 'node scripts/build-tauri-assets.mjs')

  const buildAssets = await readFile(new URL('../scripts/build-tauri-assets.mjs', import.meta.url), 'utf8')
  const sidecarIndex = buildAssets.indexOf('build-sidecar.mjs')
  const frontendIndex = buildAssets.indexOf('build-frontend.mjs')

  assert.notEqual(sidecarIndex, -1)
  assert.notEqual(frontendIndex, -1)
  assert.ok(sidecarIndex < frontendIndex)
})

test('desktop sidecar package includes prompt assets used by the author agent', () => {
  assert.match(pkgSidecarConfig, /assets\s*:/)
  assert.match(pkgSidecarConfig, /\.\.\/prompts\/\*\*\/\*/)
})
