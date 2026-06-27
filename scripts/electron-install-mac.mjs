import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'dist-electron')
const appDest = '/Applications/InkFlow.app'

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

function findBuiltApp(dir) {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name === 'InkFlow.app') return full
    if (entry.isDirectory()) {
      const nested = findBuiltApp(full)
      if (nested) return nested
    }
  }
  return null
}

run(process.execPath, [path.join(root, 'scripts', 'electron-build.mjs'), '--mac'])

const builtApp = findBuiltApp(outputDir)
if (!builtApp) {
  throw new Error(`InkFlow.app not found in ${outputDir}`)
}

spawnSync('osascript', ['-e', 'tell application "InkFlow" to quit'], { stdio: 'ignore' })
spawnSync('pkill', ['-f', '/Applications/InkFlow.app/Contents/MacOS/inkflow-server'], { stdio: 'ignore' })
spawnSync('pkill', ['-f', '/Applications/InkFlow.app/Contents/MacOS/InkFlow'], { stdio: 'ignore' })

fs.rmSync(appDest, { recursive: true, force: true })
run('ditto', [builtApp, appDest])
spawnSync('xattr', ['-dr', 'com.apple.quarantine', appDest], { stdio: 'ignore' })
run('open', [appDest])
