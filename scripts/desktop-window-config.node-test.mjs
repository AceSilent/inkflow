import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const cargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8')

test('macOS desktop window uses native traffic lights over a rounded transparent shell', () => {
  assert.equal(config.app.macOSPrivateApi, true)

  const [windowConfig] = config.app.windows
  assert.equal(windowConfig.decorations, true)
  assert.equal(windowConfig.transparent, true)
  assert.equal(windowConfig.titleBarStyle, 'Overlay')
  assert.equal(windowConfig.hiddenTitle, true)
  assert.equal(windowConfig.shadow, true)
  assert.deepEqual(windowConfig.trafficLightPosition, { x: 16, y: 15 })

  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"2",\s*features\s*=\s*\[[^\]]*"macos-private-api"/)
})
