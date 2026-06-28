module.exports = (api) => {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel'
    ],
    plugins: [
      // Resolve tsconfig path aliases at transform time. `@shared` points at the
      // in-tree synced copy (scripts/sync-shared.mjs) so Metro/EAS bundle it
      // without reaching outside the app dir. Reanimated/Worklets plugin is
      // auto-added by babel-preset-expo (SDK 54+), so it is NOT listed here.
      [
        'module-resolver',
        {
          alias: {
            '@app': './src',
            '@shared': './src/_shared'
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
        }
      ]
    ]
  }
}
