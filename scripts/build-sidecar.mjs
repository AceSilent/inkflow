import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const binariesDir = path.join(root, 'desktop', 'binaries')
const serverDir = path.join(root, 'server')
const serverEntry = path.join(root, 'server', 'dist', 'index.js')
const pkgConfig = path.join(root, 'scripts', 'pkg-sidecar.config.cjs')

const macTargets = [
  { pkg: 'node22-macos-arm64', suffix: 'aarch64-apple-darwin' },
  { pkg: 'node22-macos-x64', suffix: 'x86_64-apple-darwin' },
]
const devTargets = [
  os.arch() === 'arm64'
    ? { pkg: 'node22-macos-arm64', suffix: 'aarch64-apple-darwin' }
    : { pkg: 'node22-macos-x64', suffix: 'x86_64-apple-darwin' },
]
const targets = args.has('--mac-dev') ? devTargets : macTargets

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${result.status}`)
  }
}

run(process.execPath, [path.join(serverDir, 'node_modules', 'typescript', 'bin', 'tsc')], {
  cwd: serverDir,
})
fs.mkdirSync(binariesDir, { recursive: true })

const pkgBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'pkg.cmd' : 'pkg')
for (const target of targets) {
  const output = path.join(binariesDir, `inkflow-server-${target.suffix}`)
  run(process.execPath, [
    pkgBin,
    serverEntry,
    '--config', pkgConfig,
    '--targets', target.pkg,
    '--output', output,
    '--compress', 'GZip',
  ])
  if (process.platform !== 'win32') fs.chmodSync(output, 0o755)
}
