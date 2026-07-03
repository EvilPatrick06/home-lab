module.exports = (api) => {
  api.cache(true)
  return {
    presets: [
      // NativeWind v5 no longer uses a Babel preset/plugin or the
      // `jsxImportSource: nativewind` option -- its transform is applied
      // automatically by nativewind/metro (withNativeWind). See the v5
      // migration guide. babel-preset-expo still auto-adds the
      // Reanimated/Worklets plugin (SDK 54+), so it is NOT listed here.
      "babel-preset-expo"
    ],
    plugins: [
      // Resolve tsconfig path aliases at transform time. `@shared` points at the
      // in-tree synced copy (scripts/sync-shared.mjs) so Metro/EAS bundle it
      // without reaching outside the app dir.
      [
        "module-resolver",
        {
          alias: {
            "@app": "./src",
            "@shared": "./src/_shared"
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
        }
      ]
    ]
  }
}
