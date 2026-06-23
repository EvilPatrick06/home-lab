# User Accounts + Cloud Sync — Design Spec

> Status: **IMPLEMENTED — code complete + verified (tsc/lint/pytest/vitest green); pending deploy + cross-device E2E**
> Date: 2026-06-23
> Built: Phases A–E + F-hardening. Deferred (logged): binary/campaign-scoped sync domains (ISSUES-LOG-DNDAPP). Go-live (CF bypass, deploy, release, E2E, security-review): tracked as the remaining user/ops task.
> Domain: dnd-app (Electron VTT + browser VTT) + bmo (Pi Flask backend)

## Context

Today the dnd-app has a **per-campaign "Cloud Backup"**: it tars one campaign,
POSTs it to the Pi (`/api/rclone/backup`), and the Pi `rclone copyto`s it to a
single shared Google Drive folder (`gdrive:DND-VTT-Backups/<campaignId>/`).
Restore is manual, destructive, and there is **no concept of a user** — anyone
with the app (and the baked CF Access service token) can list/restore *any*
campaign. Auto-backup only fires when stale (14 days) and only covers the first
campaign.

We want to evolve this into **user accounts**: a person signs in once and their
*entire* set of data (campaigns, characters, homebrew, maps, settings, …)
auto-saves to the cloud and is available on any other device — the Electron
desktop app **or** the existing browser VTT (`/DungeonTableOnline/`). The rclone
→ Google Drive pipe is **reused as the durable backend**; "Cloud Backups"
becomes the storage layer behind a real "Cloud Account that auto-saves."

### Why this is feasible with little new infrastructure

- The **browser VTT already exists** (`dnd-app/src/web/`), is a full build of the
  same React renderer, persists to **IndexedDB** (`src/web/idb.ts`) via a
  `window.api` shim (`src/web/web-api.ts`), is served **same-origin** from Flask
  at `https://bmo.mybmoai.work/DungeonTableOnline/`, and **already calls the same
  cloud-sync endpoints**. Desktop and web share the renderer and the `window.api`
  contract → **a sync engine written once runs in both**.
- Flask is stateless but has a **persisted `SECRET_KEY`** (`app.py:182-202`) for
  signing, and **`PyJWT` / `oauthlib` / `requests-oauthlib` / `itsdangerous` are
  already in `requirements.txt`** → no new dependencies for OAuth + JWT.
- **SQLite is the established Pi persistence pattern** (`bmo/pi/data/*.db`, raw
  `sqlite3`, WAL) — accounts/sessions/manifest fit it directly.
- All dnd-app entities are already **UUID-keyed atomic-write JSON** → namespace /
  per-entity sync ready.

### Locked decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Web surface | Browser VTT (`/DungeonTableOnline/`) — already exists, Pi-served |
| Login method | **Discord OAuth2** |
| Account model | **Multiple users, server-enforced isolation** |
| Sync scope | **Everything, per-entity, last-writer-wins** |
| Topology | **Pi as hot hub + rclone mirror to Drive** |
| Login requirement | **Optional** — anonymous local-only stays the default |

## Architecture Overview

```
                    sign in (Discord OAuth2)
Electron app  ──┐    ┌──────────────────────────────┐
 (main proc)    │    │  BMO Flask (Pi, :5000)        │
                ├──► │  /api/auth/*   (OAuth, JWT)   │
Browser VTT   ──┘    │  /api/account/* (profile)    │
 (same-origin)       │  /api/sync/*   (manifest,    │
                     │                 push/pull)   │
                     │                              │
                     │  accounts.db (users,         │
                     │   sessions)                  │
                     │  data/sync/<uid>/ (blobs +   │
                     │   SQLite manifest)           │
                     └──────────────┬───────────────┘
                                    │ rclone sync (per user, debounced)
                                    ▼
                     gdrive:DND-VTT-Accounts/<discord_id>/
                       (durable backup / disaster recovery)
```

- **Identity**: Discord OAuth2 → Flask mints a signed **bearer JWT** (HS256 with
  the existing `SECRET_KEY`). Both clients carry the JWT; the server derives the
  user **only** from the verified token, never from a client-supplied path.
- **Sync hub**: clients diff a **per-entity manifest** against the Pi and
  push/pull only changed entities. The Pi stores each user's blobs + manifest on
  disk and `rclone sync`s the per-user folder to Drive for durability.
- **No CORS needed for v1**: the browser VTT is **same-origin** with the Pi;
  Electron sends a bearer header. (Cross-origin SSO for `dungeon-scholar` is a
  future extension, out of scope here.)
- **Anonymous mode preserved**: signed-out users keep working fully local
  (userData / IndexedDB) exactly as today.

## Data Model

### JWT claims (HS256, signed with Flask `SECRET_KEY`)

```
{ sub: <discord_id>, name: <username>, iat, exp, jti, tv: <token_version> }
```
Verified on every `/api/account/*` and `/api/sync/*` call. Revocation: `sessions`
row `revoked=1` (per `jti`) **or** bump `users.token_version` (revoke all).

### SQLite — `bmo/pi/data/accounts.db`

```sql
users(
  discord_id    TEXT PRIMARY KEY,
  username      TEXT, global_name TEXT, avatar TEXT, email TEXT,
  created_at    REAL, last_seen REAL,
  token_version INTEGER DEFAULT 1,
  quota_bytes   INTEGER DEFAULT 2147483648,   -- 2 GiB default
  used_bytes    INTEGER DEFAULT 0
);
sessions(
  jti TEXT PRIMARY KEY, user_id TEXT, issued_at REAL, expires_at REAL,
  revoked INTEGER DEFAULT 0, device_label TEXT
);
```

### SQLite manifest — `bmo/pi/data/sync/manifest.db` (or per-user table)

```sql
sync_objects(
  user_id TEXT, domain TEXT, entity_id TEXT,
  content_hash TEXT, version INTEGER, mtime REAL, size INTEGER,
  deleted INTEGER DEFAULT 0, deleted_at REAL,
  blob_rel TEXT,                       -- path under data/sync/<uid>/
  PRIMARY KEY (user_id, domain, entity_id)
);
```
Blobs live on disk at `data/sync/<discord_id>/<domain>/<entity_id>.<ext>`
(gzipped JSON, or raw bytes for `image-library`). Mirrored to Drive via a single
`rclone sync data/sync/<uid>/ gdrive:DND-VTT-Accounts/<uid>/`.

### Synced domains (the full "everything")

`campaigns`, `game-states`, `ai-conversations`, campaign **assets**
(`campaigns/<id>/`), `characters`, `homebrew/<category>`, `bastions`,
`custom-creatures`, `map-library`, `image-library` (binary), `shop-templates`,
`book-config` + `books/<id>-data`, `bans`, and **settings** (with device-local /
secret fields stripped: `turnServers`, `bmoApiKey`, discovered/override URLs,
`bmoSyncLanEnabled`).
**Excluded**: `logs/`, `sound-cache/` (re-fetched from Pi), plugin runtime state.

## Auth Flow (Discord OAuth2)

1. Register a Discord OAuth2 client (reuse the existing bot's Discord application
   — add a redirect URI + client secret — or a fresh app). New env in
   `bmo/.env.template`: `DISCORD_OAUTH_CLIENT_ID`, `DISCORD_OAUTH_CLIENT_SECRET`,
   `DISCORD_OAUTH_REDIRECT_URI=https://bmo.mybmoai.work/api/auth/discord/callback`.
2. `GET /api/auth/discord/start?return_to=<client>` (CF-Access **bypass**, public)
   → 302 to Discord authorize with a **signed `state`** (carries `return_to`,
   client kind, nonce; `itsdangerous`).
3. `GET /api/auth/discord/callback?code&state` (CF-Access **bypass**, public) →
   verify state, exchange `code` for a Discord token, fetch `/users/@me`, **upsert
   `users`**, mint the JWT, write a `sessions` row, then deliver the token to the
   validated `return_to` (allowlisted):
   - **Browser VTT** (same-origin): redirect to `/DungeonTableOnline/#token=<jwt>`;
     the SPA reads the fragment, stores it, strips the URL.
   - **Electron**: a tiny HTML bridge page **POSTs** the token to a one-shot
     loopback server (`http://127.0.0.1:<ephemeralPort>/cb`) the main process
     opened for this login (fragments aren't sent to servers, so use POST, not a
     `#`); main process stores it encrypted.
4. `POST /api/auth/logout` (bearer) → set `sessions.revoked=1`.
5. `GET /api/account/me` (bearer) → profile + quota/usage.

Token storage: **Electron** → encrypted via
`src/main/storage/safe-secret-storage.ts`, persisted in settings; **Browser** →
IndexedDB `kv` store key `account:session` (revocable). `return_to` is validated
against an allowlist (`/DungeonTableOnline/` origin + `127.0.0.1` loopback) to
prevent open-redirect token theft.

## Sync Flow

Endpoints (all bearer-gated; `user_id` = `jwt.sub`, CF-Access bypass at the edge):
- `GET  /api/sync/manifest` → `{ "<domain>/<id>": {hash,version,mtime,size,deleted} }`
- `GET  /api/sync/object?domain&id` → blob
- `POST /api/sync/object` (multipart: domain,id,version,mtime,hash,blob) → store +
  update manifest; **LWW**: accept if `incoming.version > stored.version`, else
  reject and return the winner. Enforce per-entity size + per-user quota.
- `DELETE /api/sync/object?domain&id` → tombstone (`deleted=1, deleted_at`).
- Post-push, **debounced** `rclone sync` of `data/sync/<uid>/` → Drive (reuses the
  existing rclone subprocess wrapper in `routes/rclone_api.py`).

Client engine (shared, `src/renderer/src/services/sync/`):
- **Dirty tracker**: storage-layer change events (`{domain, id}`) on every
  successful write/delete — Electron via the storage handlers / `save-queue`,
  browser via `idbSet`/`idbDel` in `web-api.ts`.
- **Local sync-state cache**: per-entity `{hash, version, syncedHash}` (a sidecar
  store / IndexedDB `kv`) so we know what changed and the local version.
- **Scheduler**: debounce dirty keys (~8 s idle, ~60 s max), plus **pull-merge on
  launch**, on window focus, and every ~5 min.
- **LWW apply**: newer `version` wins per entity; ties broken by `mtime` then
  device id. The overwritten copy is preserved (Electron: the existing 20-version
  backups; browser: a conflict copy in IndexedDB). Tombstones delete locally and
  are GC'd after N days. (Safe to be aggressive — app is in testing, no real data.)

## Security

- Server **always** derives `user_id` from the verified JWT — never from a path or
  body field. Cross-user reads/writes are impossible by construction.
- `/api/auth/*` is internet-exposed (CF-Access bypass so login can start): signed
  `state`, `return_to` allowlist, **rate-limited**, short-lived `code` exchange.
- `/api/account/*` and `/api/sync/*` are CF-Access **bypass at the edge** (so the
  browser, which holds no CF creds, can reach them) but **gated by our JWT** — the
  JWT is the real authorization boundary.
- Per-entity size guard + per-user byte quota (default 2 GiB) on push.
- Legacy `/api/rclone/*` (service-token, shared bucket) keeps working during
  migration, then is deprecated.

## Implementation Plan (phased, each CI-gated & shippable)

**Phase A — Auth backend.** Register Discord OAuth2 app; add env to
`.env.template`. New `bmo/pi/routes/auth_api.py`, `bmo/pi/services/accounts.py`
(SQLite users/sessions), `bmo/pi/services/jwt_util.py` (mint/verify). Add
`/api/auth` to `_PUBLIC_UNAUTH_PREFIXES` (`app.py:226-232`) and a CF-Access bypass
policy (`scripts/apply-access-config.sh`). pytest: token mint/verify, state
signing, ownership, revocation. *(bmo/pi/tests/test_auth.py)*

**Phase B — Client session.** Add `ACCOUNT_*` channels to
`src/shared/ipc-channels.ts`; `window.api.account` in `src/preload/index.ts`
(Electron, loopback capture + encrypted token) and `src/web/web-api.ts` (browser,
fragment capture + IndexedDB token). Login/logout UI + signed-in indicator
(repurpose `components/settings/CloudBackupSection.tsx` → an **Account & Sync**
panel). No data movement yet — just identity.

**Phase C — Sync backend.** New `bmo/pi/routes/sync_api.py` (manifest, object
get/put/delete), `sync_objects` SQLite + on-disk blob store, JWT-derived
ownership, quota, and the **debounced per-user `rclone sync`** to
`gdrive:DND-VTT-Accounts/<uid>/` (reusing the rclone subprocess wrapper). Add
`/api/sync` + `/api/account` to CF-Access bypass. pytest: push/pull, LWW,
ownership isolation, quota, tombstones. *(bmo/pi/tests/test_sync.py)*

**Phase D — Client sync engine.** New `src/renderer/src/services/sync/` (dirty
tracker, manifest diff, scheduler, LWW apply, deletions, local sync-state cache).
Wire storage change events on both platforms (Electron storage handlers /
`save-queue`/`atomic-write`; browser `idb`/`web-api`). Replace the
auto-backup-on-launch block in `src/renderer/src/App.tsx` with **pull-merge on
launch**. vitest: diff, LWW tie-breaks, scheduler debounce, tombstone GC.

**Phase E — Migration & cutover.** First-login **claim** (push all local entities
when the remote prefix is empty; otherwise normal pull-merge). One-time "Import
legacy backup" to pull old `DND-VTT-Backups/<cid>` campaigns into the account.
Deprecate the old per-campaign backup button; retain `autoBackupOnLaunch` /
`lastBackupTime` only for the signed-out legacy path. Update
`docs/ARCHITECTURE.md`, `bmo/docs/SERVICES.md`, `dnd-app/README.md`.

**Phase F — Hardening & E2E.** Auth rate-limits, `return_to` allowlist,
revocation/logout end-to-end, `/security-review` pass. Cross-device manual E2E:
sign in on browser → create a campaign → sign in on Electron → it appears; edit on
each → LWW resolves; `rclone ls` confirms the per-user Drive prefix; confirm a
second user **cannot** read the first user's prefix.

## Verification

- **Backend**: `cd bmo/pi && pytest tests/test_auth.py tests/test_sync.py`.
- **Client units**: `cd dnd-app && npm test` (sync engine), `npm run lint`,
  `tsc --noEmit` (web + node configs).
- **Browser E2E**: `npm run build:web` → deploy to Pi `/DungeonTableOnline/` (or
  `npm run dev:web` with `VITE_BMO_BASE=https://bmo.mybmoai.work`), then exercise
  the cross-device + isolation scenario above.
- **Desktop E2E**: launch Electron, sign in via the loopback flow, confirm sync
  against the same account used by the browser.

## Out of Scope / Future

- `dungeon-scholar` SSO (reuse the same JWT; `oracle-worker` validates it).
- Bring-your-own Google Drive (per-user rclone remotes via Google OAuth).
- Real-time push (WebSocket/SSE) instead of poll-on-launch/focus/interval.
- End-to-end encryption of synced blobs (server-blind storage).
