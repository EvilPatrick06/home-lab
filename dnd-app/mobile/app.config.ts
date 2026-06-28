import type { ExpoConfig } from 'expo/config'

/**
 * Expo app config for the Dungeon Table Online Android client.
 *
 * The app id `com.dndvtt.app` is the Play Store package name (Google Play
 * requires a stable, reverse-DNS id that never changes after first publish).
 * Mirrors the desktop electron-builder appId `com.dnd-vtt.app` but uses an
 * Android-legal segment (no hyphen in the final label).
 */
const config: ExpoConfig = {
  name: 'Dungeon Table Online',
  slug: 'dungeon-table-online',
  version: '2.6.3',
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'dndvtt',
  userInterfaceStyle: 'dark',
  backgroundColor: '#030712',
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#030712'
  },
  assetBundlePatterns: ['**/*'],
  android: {
    package: 'com.dndvtt.app',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/icon-maskable-512.png',
      backgroundColor: '#030712'
    },
    permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'RECORD_AUDIO']
  },
  plugins: ['expo-sqlite'],
  experiments: {
    typedRoutes: false
  },
  extra: {
    // EAS project id is injected by `eas init`.
    eas: { projectId: null },
    // false = offline embed.zip (default after build:embed); true = hosted URL only.
    embedRemote: false,
    privacyPolicyUrl: 'https://github.com/EvilPatrick06/home-lab/blob/master/dnd-app/mobile/docs/play-store/PRIVACY-POLICY.md'
  }
}

export default config
