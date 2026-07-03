const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const config = getDefaultConfig(__dirname)

// The offline embed bundle is shipped as a .zip asset (see scripts/sync-embed.mjs).
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), "zip"]

// NativeWind v5: withNativeWind reads global.css via the CSS pipeline; the v4
// second-arg { input } is gone. global.css is imported from App.tsx.
module.exports = withNativeWind(config)
