import fs from 'fs/promises'
import path from 'path'

const REPO_ROOT = process.cwd()
const REGISTRY_PATH = path.join(REPO_ROOT, 'registry.json')
const REPO_NAME = 'gnl00/atiapp-plugins'
const REPO_REF = 'main'
const RESERVED_DIRS = new Set([
  '.git',
  '.github',
  'scripts',
  'templates',
  'node_modules'
])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const normalized = value.replace(/\\/g, '/').trim()
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    return null
  }

  return normalized.replace(/^\.\//, '')
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readManifest(pluginDirName) {
  const pluginDir = path.join(REPO_ROOT, pluginDirName)
  const manifestPath = path.join(pluginDir, 'plugin.json')
  const manifestExists = await pathExists(manifestPath)
  if (!manifestExists) {
    return null
  }

  const raw = await fs.readFile(manifestPath, 'utf-8')
  const manifest = JSON.parse(raw)
  if (!isRecord(manifest)) {
    throw new Error(`Manifest in ${pluginDirName} must be a JSON object`)
  }

  const id = typeof manifest.id === 'string' && manifest.id.trim() ? manifest.id.trim() : null
  const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : null
  const version = typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : null
  const description = typeof manifest.description === 'string' && manifest.description.trim()
    ? manifest.description.trim()
    : undefined
  const entries = isRecord(manifest.entries) ? manifest.entries : undefined
  const mainEntry = normalizeRelativePath(entries?.main)
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : null

  if (!id || !name || !version || !capabilities || capabilities.length === 0 || !mainEntry) {
    throw new Error(`Manifest in ${pluginDirName} is missing required fields`)
  }

  const resolvedMainEntry = path.join(pluginDir, mainEntry)
  const mainEntryExists = await pathExists(resolvedMainEntry)
  if (!mainEntryExists) {
    throw new Error(`Manifest in ${pluginDirName} points to a missing entries.main: ${mainEntry}`)
  }

  return {
    id,
    path: pluginDirName,
    name,
    version,
    description,
    manifest: `${pluginDirName}/plugin.json`,
    readme: await pathExists(path.join(pluginDir, 'README.md')) ? `${pluginDirName}/README.md` : undefined,
    entries: {
      main: mainEntry
    },
    capabilities
  }
}

async function collectPlugins() {
  const entries = await fs.readdir(REPO_ROOT, { withFileTypes: true })
  const pluginDirs = entries
    .filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const plugins = []
  for (const pluginDirName of pluginDirs) {
    const plugin = await readManifest(pluginDirName)
    if (!plugin) {
      continue
    }
    plugins.push(plugin)
  }

  const ids = new Set()
  const paths = new Set()
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) {
      throw new Error(`Duplicate plugin id found in registry generation: ${plugin.id}`)
    }
    if (paths.has(plugin.path)) {
      throw new Error(`Duplicate plugin path found in registry generation: ${plugin.path}`)
    }
    ids.add(plugin.id)
    paths.add(plugin.path)
  }

  return plugins
}

async function main() {
  const plugins = await collectPlugins()
  const registry = {
    repo: REPO_NAME,
    ref: REPO_REF,
    plugins
  }

  await fs.writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8')
  console.log(`[Registry] Generated ${plugins.length} plugin entries -> ${REGISTRY_PATH}`)
}

main().catch((error) => {
  console.error('[Registry] Failed to generate registry.json')
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
