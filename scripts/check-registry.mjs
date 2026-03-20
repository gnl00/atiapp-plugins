import fs from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'

const REPO_ROOT = process.cwd()
const REGISTRY_PATH = path.join(REPO_ROOT, 'registry.json')

async function main() {
  let before = ''
  try {
    before = await fs.readFile(REGISTRY_PATH, 'utf-8')
  } catch {
    before = ''
  }

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'generate-registry.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const after = await fs.readFile(REGISTRY_PATH, 'utf-8')
  if (before !== after) {
    console.error('[Registry] registry.json was outdated and has been regenerated. Please commit the updated file.')
    process.exitCode = 1
    return
  }

  console.log('[Registry] registry.json is up to date.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
