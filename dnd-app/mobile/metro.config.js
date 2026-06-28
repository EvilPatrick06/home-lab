const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const path = require('node:path')

const projectRoot = __dirname
// The shared TypeScript (bridge protocol, shared types) lives one level up in
// the desktop/web repo; Metro must watch it to bundle cross-package imports.
const repoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Watch the parent repo's `src/shared` so `@shared/*` imports resolve.
config.watchFolders = [path.resolve(repoRoot, 'src/shared')]

// Resolve modules from the mobile app first, then fall back to the repo root
// (lets us reuse a hoisted dependency if present).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules')
]
config.resolver.disableHierarchicalLookup = true
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), 'zip']

module.exports = withNativeWind(config, { input: './global.css' })
