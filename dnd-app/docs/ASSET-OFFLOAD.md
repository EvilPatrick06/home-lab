# Large-asset offload (sounds "CDN" seam)

The app bundles ~130 MP3s under `public/sounds/` (plus large JSON). They inflate
the installer. There is no external CDN in this environment, so instead the app
has a **code seam** that lets bundled audio load from the Pi's library API when
the Pi is reachable, with the **bundled file as the automatic fallback**. This
mirrors the JSON path in `services/library/remote-library.ts`.

## The seam

`services/library/remote-sounds.ts` — a single, typed module:

- `prewarmRemoteSounds(): Promise<void>` — fetches the Pi sounds-manifest **once
  per session** (time-boxed, best-effort), caching which clips the Pi serves +
  the resolved base URL. Idempotent; concurrent calls share one in-flight
  request. Never throws. Call it off the hot path (currently invoked from
  `sound-manager.reinit`).
- `resolveSoundUrl(bundledPath): string` — **synchronous**. Returns the
  Pi-hosted URL iff the manifest is warm AND lists that clip, else the bundled
  `./sounds/...` path unchanged. Synchronous on purpose so it drops into the
  existing `new Audio(...)` call sites without making them async.
- `mapSoundPathToRel(path): string | null` — `./sounds/dice/d20-1.mp3` →
  `dice/d20-1.mp3`; non-`./sounds/` (e.g. a DM's absolute custom-audio path) →
  `null`, so custom overrides always pass through untouched.

### Wiring (asset-loading sites only)

- `services/sound-manager.ts` `init()` — pool `new Audio(...)` calls go through
  `resolveSoundUrl`. `reinit()` kicks off `prewarmRemoteSounds()`.
- `services/sound-playback.ts` `playAmbient()` — the ambient `new Audio(...)`
  goes through `resolveSoundUrl`.

Because the manifest is cold on first use and on every offline session, the
first plays are always bundled; once the manifest warms, subsequent Audio
creations prefer the Pi copy. **Nothing breaks offline** — a failed/empty
manifest just keeps everything bundled.

## Pi-side contract (implemented — `bmo/pi/routes/sounds_api.py`)

BMO serves the sounds endpoint (read-only, registered via `register_sounds(app)`
in `bmo/pi/app.py`):

- `GET /api/sounds/manifest` →
  `{ "version": "<hash>", "files": { "<rel>": { "size": <bytes> } } }`
  where `<rel>` is the path **without** the leading `./sounds/`
  (e.g. `dice/d20-1.mp3`, `ambient/tavern.mp3`).
- `GET /api/sounds/file?path=<rel>` → the raw audio bytes
  (`Content-Type: audio/mpeg`), path-jailed under the served sounds dir.

When the Pi is unreachable the manifest fetch fails → empty served-set → every
clip stays bundled. Extend `remote-sounds.ts` if the manifest shape evolves.
