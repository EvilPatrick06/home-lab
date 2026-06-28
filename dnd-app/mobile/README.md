# Dungeon Table Online — Mobile (React Native + Expo)

The Android client for [Dungeon Table Online](../README.md). Phase-1 architecture
(embed-first): native UI for menus / characters / library / settings, with the
live game session (PixiJS map, Three.js dice, PeerJS) running inside an embedded
WebView. The two realms talk over a typed `window.api` bridge.

> Native renderers (`react-native-skia` map, `expo-three` dice) and
> `react-native-webrtc` are **phase 2** — see the plan. The bridge protocol and
> `window.api` seam are forward-compatible, so that migration is incremental.

## Architecture

```
React Native shell (this package)        Embedded WebView (../dist-embed)
┌───────────────────────────────┐        ┌──────────────────────────────┐
│ screens/ (NativeWind UI)      │        │ renderer (map, dice, PeerJS)  │
│ storage/  SQLite adapter      │  RPC   │ window.api → bridge proxy     │
│ bridge/   native host  ◄──────┼────────┤ src/web/main.embed.tsx        │
│           BridgeEndpoint      │ events │ MemoryRouter (#/route)        │
└───────────────────────────────┘        └──────────────────────────────┘
        shared protocol: ../src/shared/bridge (msgpack + base64 over postMessage)
```

- Native owns durable storage (characters, campaigns, settings) via
  `src/storage/storage-adapter.ts` (expo-sqlite). The WebView reaches it through
  the bridge (`src/bridge/native-bridge.ts`).
- The WebView owns the live session + PeerJS (a WebView is a browser realm, so
  WebRTC works without `react-native-webrtc` in phase 1).
- `src/bridge/EmbeddedWebView.tsx` wires both directions of the bridge.

## Prerequisites

- Node 22+, the repo's root deps installed (`cd .. && npm install`).
- `npm install` in this folder (`mobile/`).
- For local Android runs: Android Studio + SDK, or use EAS cloud builds.
- After installing, align native module versions with the SDK:
  `npx expo install --fix`.

## Develop

```bash
# 1. Build the embedded in-game bundle and stage it into the app:
npm run build:embed          # → ../dist-embed, copied to ./assets/embed

# 2. Start Metro / Expo:
npm start                    # then press 'a' for Android (needs a dev build)

# Or run a native debug build directly:
npm run android
```

By default the WebView loads the embed from the URL in `src/config.ts`
(`EMBED_URL`). Point `extra.embedUrl` (in `app.config.ts`) at:

- the staged offline bundle's `index.html` localUri (offline; use the
  `assets/embed/` files), or
- a deployed copy of `dist-embed/` (e.g. behind the Cloudflare tunnel).

The default remote URL is a convenience for first-run bring-up; ship offline for
production.

## Release to Google Play

Uses EAS Build (`eas.json` profiles: `development`, `preview`, `production`).

```bash
npm i -g eas-cli && eas login
eas init                                   # writes extra.eas.projectId

# Internal testing APK (sideload-able):
npm run build:android:preview

# Production AAB (Play Console upload):
npm run build:android:production           # eas build -p android --profile production

# Submit to the Play internal track (draft):
npm run submit:android                     # requires a Play service account JSON
```

EAS manages the upload keystore (app signing) by default. Bump `versionCode`
(or rely on `autoIncrement` in the production profile) for each upload.

See [`docs/play-store/`](./docs/play-store/) for the store listing copy, the Data
Safety answers, the privacy policy, and the SRD/IP content review that must be
completed before publishing.
