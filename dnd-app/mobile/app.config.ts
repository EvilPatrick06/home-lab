import type { ExpoConfig } from '@expo/config-types'

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
  slug: 'dungeontableonline',
  owner: 'evilpatrick06s-team',
  version: '2.6.3',
  updates: {
    url: 'https://u.expo.dev/e9d0028b-391b-47c0-bc16-a1eb22a10541'
  },
  runtimeVersion: {
    policy: 'appVersion'
  },
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
    eas: { projectId: 'e9d0028b-391b-47c0-bc16-a1eb22a10541' },
    // false = offline embed.zip (default after build:embed); true = hosted URL only.
    embedRemote: false,
    privacyPolicyUrl: 'https://bmo.mybmoai.work/DungeonTableOnline/privacy.html'
  }
}

export default config
