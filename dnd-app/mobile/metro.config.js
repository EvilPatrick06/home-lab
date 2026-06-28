const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// The offline embed bundle is shipped as a .zip asset (see scripts/sync-embed.mjs).
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), 'zip']

module.exports = withNativeWind(config, { input: './global.css' })
