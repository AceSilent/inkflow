import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(script) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`)
  }
}

run('build-sidecar.mjs')
run('build-frontend.mjs')
