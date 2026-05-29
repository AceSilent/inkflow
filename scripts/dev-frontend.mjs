import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontendDir = path.join(root, 'frontend')
const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')

const result = spawnSync(process.execPath, [viteBin], {
  cwd: frontendDir,
  stdio: 'inherit',
})

if (result.status !== 0) {
  if (result.signal || result.status === 130 || result.status === 143) {
    process.exit(0)
  }
  throw new Error(`frontend dev server failed with exit code ${result.status}`)
}
