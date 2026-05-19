# Phase 36 — Pi-hosted library + offline cache

Phase 36 moves the canonical D&D content library off the app bundle and onto the Pi. Players fetch library data live from the Pi on each launch, cache it locally, and fall back to the cache when offline. Library edits (errata, balance changes, homebrew adds) propagate to every player without re-distributing the app installer.

Phase 15 architecture (the truth store, hydration hooks, schemas, override discipline, migration) is unchanged — Phase 36 only swaps the loader's *source*. The library still validates through the same `SCHEMA_REGISTRY`; consumers still read via `useLibraryEntry` / `useHydratedRef`; the boundary test still enforces single-source. The only thing that moves is *where the raw JSON comes from*.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — app-side work

The app side gets a remote-loader, cache layer, manifest-driven invalidation, version-mismatch UX, and a settings toggle. Bundled content shrinks to a seed slice for first-run offline.

### Raspberry Pi (`patrick@bmo`) — server-side work

BMO gains library endpoints: manifest, per-category GET with ETag, optional delta-sync. Auth reuses Phase 32's JWT (public-read for official content; JWT-gated for homebrew/plugin). Storage layout under `bmo/pi/data/library/`.

**Files touched:**

| Side | File | Role |
|------|------|------|
| Pi | `bmo/pi/services/library_server.py` *(new)* | Flask blueprint serving `/api/library/manifest` + `/api/library/<category>` + ETag headers |
| Pi | `bmo/pi/data/library/` *(new)* | Authoritative copy of `public/data/5e/**` content + homebrew + plugin entries |
| Pi | `bmo/pi/services/library_storage.py` *(new)* | Read + checksum + version manifest generator |
| Pi | `bmo/pi/scripts/sync-library-from-app.sh` *(new)* | Bootstrap: copy current `public/data/5e/**` from the app repo to Pi |
| App | `src/renderer/src/services/library/remote-loader.ts` *(new)* | Manifest fetch + per-category fetch + cache write + offline detection |
| App | `src/renderer/src/services/library/library-cache.ts` *(new)* | Disk cache reader/writer (`userData/library-cache/`) |
| App | `src/renderer/src/services/library/seed-bundle.ts` *(new)* | First-run fallback reader for the slim bundled seed |
| App | `src/renderer/src/stores/use-library-store.ts` | `loadCategory` rewires to use `remote-loader` + cache + seed |
| App | `src/renderer/src/components/library/LibraryDownloadProgress.tsx` *(new)* | Chunked download UX with per-category progress bar |
| App | `src/renderer/src/components/library/LibraryVersionMismatchBanner.tsx` *(new)* | Schema-skew banner |
| App | `src/renderer/src/components/settings/LibrarySourcePanel.tsx` *(new)* | Settings UI: bundled / Pi (URL) / hybrid |
| App | `dnd-app/package.json` | electron-builder `files.exclude` excludes most of `public/data/5e/**`; keeps a defined seed slice |
| App | `src/renderer/src/i18n/locales/en.json` | New strings for download UX + mismatch banner (Phase 34 consumes) |

---

## 📋 Locked decisions (the 8 open questions, resolved)

1. **First-run offline — ship a seed bundle.** The app installer carries a minimal seed slice (species, classes, conditions, the 100 most-common spells, ~50 starter monsters) so a freshly-installed app renders something useful with no Pi reachable. On first online launch, the remote-loader pulls the full library and caches it; the cache supersedes the seed.
2. **Homebrew sync via Pi.** Homebrew lives on Pi (paired with Phase 31's `library` shard for live propagation between connected players). Local-only homebrew is supported as a fallback for users who don't run a Pi.
3. **Auth scope split.** Official content (`source: 'official'`) is public-read — no JWT required. Homebrew + plugin content (`source: 'homebrew' | 'plugin'`) is gated behind Phase 32's JWT (per-campaign or per-user, depending on the Pi-side ACL model). This keeps first-run easy (no auth setup needed for the base library) and protects homebrew that a DM doesn't want public.
4. **Cache invalidation — manifest-with-checksums.** One manifest GET per launch returns `{ version, categories: [{ name, sha256, count, bytes }] }`. App compares each category's cached sha256 against the manifest. Mismatches trigger a re-fetch. Matches use the cache. One extra round-trip per launch; tiny payload (~5KB).
5. **Schema version skew — fall back + banner.** If the Pi serves a library payload that doesn't validate against the app's installed `SCHEMA_REGISTRY` (e.g., the Pi has a newer field that's required in the app's schema), the loader falls back to the **seed bundle for that category** and surfaces a "Library version mismatch — update the app to receive new content" banner. The app stays usable; the user sees a clear "outdated client" message instead of crashing.
6. **Multi-Pi / fork scenarios — settings field.** Reuse Phase 32's `bmoPiBaseUrl` settings (already exists per `bmo-config.ts`). Library fetches use the same base URL. Players who join a friend's game can point at the friend's Pi for content via the same settings field; the auth/JWT scope determines what they can see.
7. **Bandwidth — chunked per-category download with progress.** Download categories sequentially (or with bounded parallelism = 3), showing a per-category progress bar. Cancel-safe; resumable after a network blip (the next launch's manifest GET tells us what's still stale). Default behavior: download in background after first launch's seed renders.
8. **Phase ordering — after 15 + 32.** Phase 36 depends on Phase 15 (the library store architecture) and Phase 32 (the Pi-API surface + JWT auth). Pi-side endpoints can be drafted earlier as a standalone REST service, but the full app-side integration waits for both. Light alternative: implement public-read official content right after Phase 15 (no auth dependency), defer homebrew/plugin sync until Phase 32.

---

## 🛠️ Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 36a | Seed bundle definition + electron-builder exclude | App ships a slim seed; rest of `public/data/5e/**` excluded from installer |
| 36b | Pi-side library API — manifest + per-category GET + ETag | New Flask blueprint, ~150 LOC, reuses Phase 32 JWT for protected paths |
| 36c | App-side remote-loader + cache layer | `remote-loader.ts`, `library-cache.ts`, `useLibraryStore.loadCategory` rewire |
| 36d | Cache invalidation flow | Manifest-with-checksums; cache lookup; staleness detection |
| 36e | Library version mismatch handling | Schema-skew detection, per-category seed fallback, banner UI |
| 36f | Homebrew sync via Pi + Phase 31 shard | `upsertHomebrew` writes to Pi (via JWT); library shard propagates to other clients |
| 36g | Settings UI — Library source panel | Bundled / Pi (with custom URL) / hybrid + cache management actions |
| 36h | Chunked download UX + offline detection | `LibraryDownloadProgress`, online/offline state, background sync after first render |
| 36i | Tests + docs + sync script | vitest specs for all flows; ADR; `sync-library-from-app.sh` bootstrap |
| 36j | Cleanup + release | Remove redundant bundled content; verify installer size drop; cut release |

10 sub-phases. Each ends with the 4-gate suite. One release at end: **v4.0.0** (installer shape change is breaking — users will see a "downloading library…" step on first launch after upgrade).

---

## 🛠️ Sub-Phase A: Seed bundle definition (36a)

### Step 1 — Define the seed slice

Pick the minimum library content needed for a fresh install to render useful UI offline:

- **Species:** all PHB 2024 base species (~10 entries)
- **Classes:** all 12 PHB classes (base only, no subclasses)
- **Conditions:** all RAW conditions (~15 entries)
- **Spells:** the 100 most-common spells (cantrips through 3rd level, broad-class coverage)
- **Items:** starter equipment (~50 items — basic weapons, armor, adventuring gear)
- **Monsters:** a starter bestiary (~50 monsters covering CR 0-5 for early adventures)
- **Backgrounds:** all PHB 2024 backgrounds (~14 entries)
- **Feats:** none in seed (rarely needed at level 1 — pull from Pi on first online launch)

Total seed size estimate: ~3-5 MB compressed. Ships in installer. Lives at `src/renderer/public/data/5e-seed/` (or a `seed/` subdirectory under existing path).

### Step 2 — Exclude rest of `public/data/5e/**` from installer

Edit `dnd-app/package.json` `build.files`:

```diff
   "build": {
     "files": [
       "!**/.vscode/*",
       "!src/**/*",
+      "!src/renderer/public/data/5e/!(5e-seed)/**/*",
       "!scripts/**/*",
       "...
     ]
   }
```

(Exact glob may need tuning — verify with `electron-builder --dir` + `ls dist/`.)

Result: installer drops from ~150MB to ~80MB (estimate; actual depends on current bundled content size).

### Step 3 — Seed loader

`src/renderer/src/services/library/seed-bundle.ts`:

```typescript
export async function loadSeedCategory<T extends LibraryCategory>(
  category: T
): Promise<LibraryEntry<T>[]> {
  const path = `/data/5e-seed/${category}.json`
  try {
    const res = await fetch(path)
    if (!res.ok) return []
    const raw = await res.json()
    return validateEntries(category, raw)  // reuse Phase 15 A.2 schema registry
  } catch {
    return []
  }
}
```

Used by `useLibraryStore.loadCategory(category)` when the remote fetch fails AND no cache exists.

### Step 4 — First-run UX

On first launch:
1. Mount UI immediately (don't block on library load).
2. Library page + builder + sheet show "Loading library…" placeholders.
3. Background: `remote-loader` attempts Pi fetch. Success → cache + populate. Failure → fall back to seed; surface a "Working with limited offline library — connect to network to download full library" toast.
4. Once Pi fetch completes (typically <30s on home internet), the library content swaps in live; consumers using `useLibraryEntry` re-render automatically.

### Acceptance

- Installer size drops by the expected amount.
- Fresh install with no network shows the seed library; builder lets the user create a level-1 character end-to-end with seed content.
- Fresh install with network downloads full library in background; UI doesn't block on it.
- 4-gate suite green; new vitest spec covers seed-only behavior.

---

## 🛠️ Sub-Phase B: Pi-side library API (36b)

### Step 5 — Pi storage layout

```
bmo/pi/data/library/
├── manifest.json                    ← generated; { version, categories: [{ name, sha256, count, bytes }] }
├── official/
│   ├── species.json
│   ├── classes.json
│   ├── spells.json
│   └── ... (all ~52 categories)
├── homebrew/
│   ├── <campaign-id>/
│   │   ├── monsters.json
│   │   └── ...
│   └── shared/
│       └── ...
└── plugins/
    └── <plugin-id>/
        ├── manifest.json
        └── content/
            └── ...
```

Initial population via `bmo/pi/scripts/sync-library-from-app.sh` (Step 22 below) — copies current `public/data/5e/**` from the dnd-app repo into `bmo/pi/data/library/official/`.

### Step 6 — Manifest endpoint

`GET /api/library/manifest`:

```json
{
  "version": "2026-05-18T14:30:00Z",
  "schemaVersion": 4,
  "categories": [
    { "name": "species", "sha256": "a1b2c3...", "count": 14, "bytes": 12500 },
    { "name": "classes", "sha256": "d4e5f6...", "count": 12, "bytes": 84000 },
    { "name": "spells",  "sha256": "789abc...", "count": 504, "bytes": 1240000 }
  ]
}
```

Cached on the Pi side for 60s (regenerated on file change OR by manual `POST /api/library/refresh-manifest`). Public-read (no auth).

### Step 7 — Per-category endpoint

`GET /api/library/<category>`:

- Response body: JSON array of validated entries for that category.
- Response headers: `ETag: "<sha256>"`, `Cache-Control: max-age=60`.
- Conditional GET: client sends `If-None-Match: "<sha256>"`; if match, Pi returns `304 Not Modified` with no body.
- Public-read for `category` in the official set; JWT-gated for homebrew + plugin paths.

### Step 8 — Homebrew + plugin paths

`GET /api/library/homebrew/<campaign-id>/<category>` — requires Phase 32 JWT with `campaign-id` scope.
`POST /api/library/homebrew/<campaign-id>` — same; writes a new homebrew entry, validates against the schema-of-record (Pi-side mirror of Phase 15 A.2 schemas), updates manifest.

### Step 9 — Manifest checksum generation

Pi computes `sha256(JSON.stringify(content, null, 0))` per category. The "no-whitespace JSON" canonical form ensures app + Pi compute matching hashes deterministically. App-side library writes go through the same canonical-stringify before disk write.

### Acceptance

- `curl http://pi.local:5000/api/library/manifest` returns valid JSON.
- `curl -H "If-None-Match: <hash>" http://pi.local:5000/api/library/species` returns 304 when matching.
- Homebrew GET without JWT returns 401.
- Homebrew GET with valid JWT returns the campaign's homebrew entries.
- pytest covers manifest, per-category, ETag, 304, auth paths.

---

## 🛠️ Sub-Phase C: App-side remote loader + cache (36c)

### Step 10 — `library-cache.ts`

```typescript
// src/renderer/src/services/library/library-cache.ts
const CACHE_DIR = 'library-cache'

interface CachedCategory<T extends LibraryCategory> {
  category: T
  sha256: string
  bytes: number
  cachedAt: string                    // ISO timestamp
  entries: LibraryEntry<T>[]
}

export async function readCache<T extends LibraryCategory>(
  category: T
): Promise<CachedCategory<T> | null> {
  // Reads userData/library-cache/<category>.json + sidecar
}

export async function writeCache<T extends LibraryCategory>(
  category: T,
  entries: LibraryEntry<T>[],
  sha256: string
): Promise<void> {
  // Atomic write via Phase 15 atomic-write.ts
}

export async function clearCache(): Promise<void> {
  // For the settings UI "clear cache" action
}
```

### Step 11 — `remote-loader.ts`

```typescript
// src/renderer/src/services/library/remote-loader.ts
export async function fetchManifest(): Promise<LibraryManifest> {
  const res = await fetch(`${getBmoBaseUrl()}/api/library/manifest`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`)
  return ManifestSchema.parse(await res.json())
}

export async function fetchCategory<T extends LibraryCategory>(
  category: T,
  ifNoneMatch?: string
): Promise<{ status: 'fresh' | 'cached' | 'fallback'; entries: LibraryEntry<T>[] } > {
  const headers = ifNoneMatch ? { 'If-None-Match': `"${ifNoneMatch}"` } : {}
  const res = await fetch(`${getBmoBaseUrl()}/api/library/${category}`, { headers, signal: AbortSignal.timeout(30_000) })
  if (res.status === 304) return { status: 'cached', entries: [] }
  if (!res.ok) throw new Error(`Category fetch failed: ${res.status}`)
  const raw = await res.json()
  const entries = validateEntries(category, raw)
  return { status: 'fresh', entries }
}
```

### Step 12 — `loadCategory` rewire

```typescript
// In useLibraryStore — A.3 from Phase 15 modified:
loadCategory: async (category) => {
  // 1. Try manifest. Network failure → use cache or seed.
  let manifest: LibraryManifest | null = null
  try {
    manifest = await fetchManifest()
  } catch {
    // offline — fall through to cache/seed
  }

  // 2. Check cache.
  const cached = await readCache(category)

  // 3. Manifest match → use cache.
  if (manifest && cached && manifest.categories.find((c) => c.name === category)?.sha256 === cached.sha256) {
    set((s) => ({ entries: { ...s.entries, [category]: indexById(cached.entries) } }))
    return
  }

  // 4. Manifest mismatch → fetch fresh.
  if (manifest) {
    try {
      const { entries } = await fetchCategory(category)
      const sha256 = manifest.categories.find((c) => c.name === category)?.sha256 ?? ''
      await writeCache(category, entries, sha256)
      set((s) => ({ entries: { ...s.entries, [category]: indexById(entries) } }))
      return
    } catch (err) {
      // Fall through to cache/seed
    }
  }

  // 5. Cache exists but no manifest → use cache.
  if (cached) {
    set((s) => ({ entries: { ...s.entries, [category]: indexById(cached.entries) } }))
    return
  }

  // 6. No cache → fall back to seed.
  const seed = await loadSeedCategory(category)
  set((s) => ({ entries: { ...s.entries, [category]: indexById(seed) } }))
}
```

### Acceptance

- Online launch: manifest fetch, cache check, per-category fetch where stale, all categories populated.
- Offline launch with cache: skip manifest fetch, use cache directly.
- Offline launch without cache: fall back to seed; user sees the "limited offline library" toast.
- vitest covers all 5 paths (fresh, cached, no-manifest, offline-with-cache, offline-without-cache).

---

## 🛠️ Sub-Phase D: Cache invalidation (36d)

Already covered by the manifest-checksum flow in 36c Step 12. This sub-phase adds:

### Step 13 — Background revalidation

After first render with cache or seed, the app schedules a background `loadCategory` for each category to pull fresh content. UI doesn't block. Users opening a new character builder might see content swap in if a category updated since their last launch.

### Step 14 — Per-category staleness UI

When a category is using cached-not-fresh data, the library page can show a "Cached as of <date>" timestamp on the category header. Not blocking; informational.

### Acceptance

- Background revalidation runs after first render; cache updates propagate.
- Staleness timestamps show on the library page.

---

## 🛠️ Sub-Phase E: Schema version mismatch (36e)

### Step 15 — Schema-version field in manifest

`manifest.schemaVersion: number`. App compares against its own `CURRENT_LIBRARY_SCHEMA_VERSION` constant. If Pi serves a newer schema version than the app supports, the per-category fetch may fail validation in `validateEntries(category, raw)` against the app's schemas.

### Step 16 — Per-category fallback to seed

When `validateEntries` throws for a category (Zod validation failure), `loadCategory`:

1. Logs the failure with `logger.warn`.
2. Falls back to the seed bundle's version of that category.
3. Sets a flag in `useLibraryStore.versionSkew[category] = { piVersion, appVersion }`.

### Step 17 — `LibraryVersionMismatchBanner.tsx`

When `versionSkew` has any entries, a dismissible banner appears at the top of the library page (and persists in the lobby/game header until dismissed for the session):

> ⚠ **Library version mismatch.** Your app's schema doesn't match the latest content from the Pi for: `spells`, `monsters`. Working with bundled content for these categories. Update the app to get the latest content.

### Acceptance

- App with schema v4 against Pi with schema v5: spells/monsters fall back to seed; banner appears; rest of library loads normally.
- Banner dismissible; reappears next launch if mismatch persists.

---

## 🛠️ Sub-Phase F: Homebrew sync via Pi (36f)

### Step 18 — `upsertHomebrew` routes to Pi

```typescript
// In useLibraryStore:
upsertHomebrew: async (category, entry) => {
  const validated = SCHEMA_REGISTRY[category].parse(entry)
  
  // 1. Write to Pi (requires JWT).
  await fetch(`${getBmoBaseUrl()}/api/library/homebrew/${campaignId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
    body: JSON.stringify({ category, entry: validated })
  })
  
  // 2. Write to local cache (for offline use).
  // 3. Update local store; Phase 31 library shard broadcasts to peers.
}
```

If offline: write to a pending-sync queue in `userData/library-cache/pending-homebrew.json`. Next online launch flushes the queue to Pi.

### Step 19 — Phase 31 library shard handles propagation

Phase 31's `library` shard (per Phase 31 reverse-map) subscribes to `useLibraryStore.entries` changes; emits `state:delta` to peers. Other clients in the campaign get the homebrew update live without round-tripping through Pi.

### Acceptance

- Player creates a homebrew spell: Pi receives it (verified via `GET /api/library/homebrew/<campaign>/spells`); local cache updated; peers in the campaign see the new spell via Phase 31 shard.
- Offline: spell saved locally; on reconnect, pushed to Pi.

---

## 🛠️ Sub-Phase G: Settings UI (36g)

### Step 20 — `LibrarySourcePanel.tsx`

New settings panel:

- **Library source:** radio: Bundled-only / Pi (with URL field) / Hybrid (Pi when reachable, bundled otherwise — recommended).
- **Pi URL:** text input (auto-filled from Phase 32 `bmoPiBaseUrl`).
- **JWT (for homebrew/plugin):** managed by Phase 32 settings; this panel shows the current status.
- **Cache management:** "Clear cache" button (forces full re-fetch on next launch), "Cache size" display.
- **Manual sync:** "Re-sync now" button — fires manifest + per-category fetches immediately.

### Acceptance

- Settings UI renders against mocked state; toggling source persists; cache management actions work.

---

## 🛠️ Sub-Phase H: Chunked download UX (36h)

### Step 21 — `LibraryDownloadProgress.tsx`

Modal or toast that appears on first online launch (or after "Clear cache"):

> Downloading library content
> ████████████░░░░  spells (504 entries, 1.2 MB)
> ✓ species (14)  ✓ classes (12)  ✓ conditions (15)  ⟳ spells …  · monsters · …

Downloads sequential with bounded parallelism of 3. Cancel-safe. Resumable.

### Step 22 — Online/offline state

`use-online-state.ts` hook subscribes to `window.addEventListener('online' | 'offline')`. App shows an offline indicator in the header (small icon, not intrusive). Re-sync triggers automatically when the app transitions offline→online.

### Acceptance

- First online launch: progress UI shows; full library downloads in <60s on home internet.
- Offline indicator works; transition online triggers background re-sync.

---

## 🛠️ Sub-Phase I: Tests + docs + sync script (36i)

### Step 23 — `sync-library-from-app.sh`

```bash
#!/usr/bin/env bash
# Initial bootstrap: copy public/data/5e/** from dnd-app into bmo/pi/data/library/official/
# Run once during Phase 36b deployment.

set -euo pipefail
SRC="${HOME}/home-lab/dnd-app/src/renderer/public/data/5e"
DST="${HOME}/home-lab/bmo/pi/data/library/official"

mkdir -p "$DST"
cp -r "$SRC/." "$DST/"

# Generate initial manifest
python3 "${HOME}/home-lab/bmo/pi/services/library_storage.py" --regenerate-manifest

echo "Library synced: $(find "$DST" -name '*.json' | wc -l) files"
```

### Step 24 — Vitest specs

- `remote-loader.test.ts` — mock fetch, cover all 5 loadCategory paths.
- `library-cache.test.ts` — round-trip cache read/write.
- `seed-bundle.test.ts` — seed loads validate.
- `library-version-mismatch.test.tsx` — banner renders on skew.
- `homebrew-pending-sync.test.ts` — offline queue flushes on reconnect.

### Step 25 — pytest specs (Pi side)

- `test_library_server.py` — manifest, per-category, ETag, 304, JWT-gated paths.

### Step 26 — Docs

- ADR in `docs/decisions/ADR-002-pi-hosted-library.md`.
- `bmo/docs/SERVICES.md` adds library_server entry.
- `dnd-app/README.md` gets a "Library source" section.
- `services/library/README.md` (Phase 15) adds a note about the remote-loader.

### Acceptance

- All new vitest + pytest specs pass.
- ADR committed.
- Sync script runs cleanly against a fresh Pi.

---

## 🛠️ Sub-Phase J: Cleanup + release (36j)

### Step 27 — Verify installer size drop

- Run `npm run build` + `electron-builder --dir`.
- Compare installer size before/after; document in release notes.
- Verify the seed slice is the only `public/data/5e/**` content in the packaged app.

### Step 28 — Release v4.0.0

Per `CLAUDE.md` release flow:

```bash
cat > /tmp/v4.0.0-notes.md <<'EOF'
**Phase 36 — Pi-hosted library + offline cache.**

Breaking change: library content moves from the app installer to the Pi.
The installer ships only a seed slice for offline first-run; the full library
fetches from the Pi on first online launch and caches locally for offline use.

Benefits:
- Smaller installer (~50% reduction expected)
- Live content updates (errata, balance fixes, new monsters) without app re-installs
- Homebrew syncs across all your campaign's players via Pi
- Offline mode works seamlessly with cached content
- Library version skew handled gracefully (banner + per-category seed fallback)

Setup:
- First launch on a network: full library downloads automatically (~30-60s on home internet)
- First launch offline: seed library renders enough for level-1 character creation
- Custom Pi URL: Settings → Library Source

Rollback: revert to a v3.x build; the cache directory at userData/library-cache/ becomes ignored,
and bundled content (if present) takes over.
EOF

node dnd-app/scripts/release/cut.mjs 4.0.0 --notes-file /tmp/v4.0.0-notes.md
```

---

## ⚠️ Constraints & Edge Cases

### First-run UX

- **Seed must be tested.** Run the seed-only test path before every release. Easy to forget when sweeping changes.
- **Seed schema match.** Seed entries validate through the same `SCHEMA_REGISTRY` as Pi-served content. Schema bumps require seed regeneration.

### Caching

- **Atomic writes.** All cache writes go through Phase 15's `atomic-write.ts` (Phase 28e.4 lint rule).
- **Cache corruption recovery.** If cached JSON fails to parse, treat as missing — fall back to fresh Pi fetch, then seed.
- **Cache size unbounded.** Categories grow over time as plugins / errata accumulate; bound at ~50MB per category with a "biggest categories" report in settings.

### Auth

- **Public-read for official content** is by design — letting strangers GET official content from your Pi has no privacy cost, and it removes the "I need to authenticate before I can render anything" problem on first launch.
- **JWT scope must include `library:write:homebrew:<campaign-id>`** for upsert paths. Phase 32 owns the token format.
- **Refresh token rotation** is Phase 32's job; library-side doesn't need its own auth lifecycle.

### Multi-Pi / forks

- **Settings field for Pi base URL.** Reuses Phase 32's `bmoPiBaseUrl`. No per-source secondary URL needed.
- **Cross-Pi homebrew is OUT of scope.** If you join a friend's game and they have their own Pi with their own homebrew, you can SEE their homebrew via their Pi (you point your `bmoPiBaseUrl` at their Pi for that session) but you don't sync your homebrew back to theirs.

### Bandwidth

- **Concurrent fetches bounded at 3.** Prevents pegging slow connections; gives the user enough parallelism on fast ones.
- **No mobile-data hint logic.** Electron doesn't expose connection-type cleanly; just download. User can pause via "Clear cache" + bundled-only mode.

### Schema skew

- **Per-category fallback, not whole-library.** A skew in one category (e.g., Pi has a new "ability" field on monsters that's required in the app's schema) doesn't blow up the rest of the library.
- **Banner is dismissible per-session.** Don't nag.

### Cache directory location

- `app.getPath('userData') + '/library-cache/'` per OS conventions.
- On Linux: `~/.config/dnd-vtt/library-cache/`.
- On Windows: `%APPDATA%/dnd-vtt/library-cache/`.
- On macOS: `~/Library/Application Support/dnd-vtt/library-cache/`.

### Pi outage

- Pi unreachable → fall back to cache (or seed if no cache).
- Stale cache + Pi-down → app keeps working; manifest-mismatch UI doesn't trigger because there's no manifest to compare against. User sees no degradation until they want fresh content.

---

## 🎯 Verification — end-to-end test plan

After **36a**: installer size drops by expected amount; fresh install with no network shows seed library; builder works at level 1 with seed.

After **36b**: `curl` against Pi endpoints returns expected shapes; ETag 304 path works; JWT-gated paths reject anonymous; pytest green.

After **36c**: app loads library from Pi; cache populates; offline relaunch uses cache.

After **36d**: manifest mismatch triggers re-fetch; matched manifest uses cache; background revalidation runs after first render.

After **36e**: synthetic schema-mismatch test triggers banner + seed fallback for that category; rest of library loads normally.

After **36f**: homebrew create → Pi has it → other client in same campaign sees it via Phase 31 shard. Offline create → reconnect → pushed to Pi.

After **36g**: settings panel toggles source, persists, clear-cache + re-sync actions work.

After **36h**: download progress UI shows; cancel + resume works; offline indicator updates on network change.

After **36i**: all new tests green; sync script bootstraps Pi cleanly.

After **36j**: installer size drop documented; v4.0.0 release shipped; release notes describe migration UX.

---

## 🧭 Execution order

1. **36a first** (seed bundle decisions block downstream choices).
2. **36b second** — Pi-side endpoints can be drafted independently of app-side work, ideally before 36c.
3. **36c + 36d** — app-side loader; depends on 36b being deployable for end-to-end tests.
4. **36e** — schema mismatch handling; depends on 36c being in place.
5. **36f** — homebrew sync; depends on Phase 31 library shard landing.
6. **36g + 36h** — UX layer; depends on 36c minimum.
7. **36i** — tests + docs throughout each sub-phase, finalized here.
8. **36j** — cleanup + release.

---

## 📜 Commit cadence

```
36a — feat(dnd-app): seed library bundle + electron-builder exclude
36b — feat(bmo): library_server.py — manifest + per-category + ETag + JWT
36c — feat(dnd-app): remote-loader.ts + library-cache.ts + loadCategory rewire
36d — feat(dnd-app): cache invalidation via manifest checksums + background revalidation
36e — feat(dnd-app): library version mismatch banner + per-category seed fallback
36f — feat(dnd-app): homebrew sync via Pi + Phase 31 library shard wiring
36g — feat(dnd-app): LibrarySourcePanel settings UI
36h — feat(dnd-app): LibraryDownloadProgress UX + online/offline detection
36i — test+docs: vitest + pytest specs + ADR-002 + sync-library-from-app.sh
36j — chore(release): v4.0.0 — Pi-hosted library
```

Each must pass:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
pytest bmo/pi/tests/   # for Pi-side sub-phases
```

One release: **v4.0.0** after 36j.

---

## 🔗 Plans superseded or modified by Phase 36

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 15 | `loadCategory(category)` source | Phase 36 swaps the source from `public/data/5e/**` (bundled) to Pi-fetch (with seed fallback). Architecture unchanged: `useLibraryEntry` hooks, schema validation, override discipline, boundary test all still apply. |
| Phase 15 A.7 (boundary test ALLOWLIST) | Add `services/library/remote-loader.ts` + `library-cache.ts` + `seed-bundle.ts` to the allowlist | They legitimately fetch / read raw library content (Pi + cache + seed); they're library-boundary files. |
| Phase 15 Sub-Phase H | Don't delete `public/data/5e/**` entirely | Keep the seed slice in the bundle. Update H's deletion list to reflect "delete non-seed content, retain `5e-seed/`." |
| Phase 25 H1 | Homebrew export / import | Reframe: Phase 36f's Pi-sync removes most of the "share homebrew between machines" use case. Export/import remains useful for one-off backups or sharing with users who don't run a Pi. Phase 25 H1 stays live work, smaller in importance. |
| Phase 31 | `library` shard | Phase 36f explicitly hooks `upsertHomebrew` → Phase 31 shard. Phase 31 reverse-map already references this; reinforce with Phase 36f's explicit call site. |
| Phase 32 | JWT auth surface | Phase 36b/f reuse Phase 32's JWT model for homebrew/plugin gating. No new auth infra. |
| Phase 33d (bundle-size CI guard) | Baseline | Bundle-size baseline gets recomputed after Phase 36a's seed-only shape. Phase 33d's check-bundle-size.mjs adapts naturally (it's a diff-against-baseline check). |
| Phase 34 | i18n strings for download UX + mismatch banner | Phase 36 adds new strings (download progress, mismatch banner, settings panel). They go through Phase 34's i18n if Phase 34 has landed; otherwise English-only as a Phase 34 backlog item. |
| Phase 35 | IPC schema reuse | Phase 36 doesn't add new IPC channels (the Pi fetch is over HTTP, not IPC). Phase 35 unaffected. |

---

## ⏱️ Estimated scope

12-15 working sessions. Sub-Phase B (Pi-side endpoints) and Sub-Phase C (app-side remote loader + cache) are the bulk. UX (Sub-Phases G + H) is smaller but high-visibility. Tests + docs (Sub-Phase I) run continuously.

---

## ✅ Final state after Phase 36

- Installer drops by ~50% (estimated).
- Players get live library updates from the Pi without re-installing.
- Homebrew syncs across all of a campaign's players via Pi + Phase 31 shard.
- Offline-first: cache + seed handle every disconnect scenario.
- Schema version mismatch fails gracefully with per-category fallback + banner.
- Settings panel lets users choose source + manage cache.
- Pi-side: new BMO blueprint, ~150 LOC + test coverage.
- Phase 15 architecture intact — only the loader's source changed.
