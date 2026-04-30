# Dungeon Scholar — User Accounts & Cloud Save Sync

**Status:** Approved (design phase)
**Date:** 2026-04-29
**Owner:** Patrick (`EvilPatrick06`)
**Affected surface:** `dungeon-scholar/` SPA, plus a new Supabase project. `oracle-worker/` is unchanged.

---

## 1. Context & problem

`dungeon-scholar/` is a React + Vite study app deployed via GitHub Pages at `https://evilpatrick06.github.io/dungeon-scholar/`. Today it has **no persistence at all**: `playerState` lives only in `useState`, and refreshing the tab wipes everything. The only way users keep progress is the manual *Export* / *Import* JSON dance.

Users want to:
1. Not lose progress when they close the tab. (Pain felt by every user.)
2. Optionally have progress follow them across devices. (Pain felt by power users.)

This spec covers both.

## 2. Goals

- **Local-first, always-on persistence.** No login required. Progress survives refresh, browser restart, computer restart.
- **Optional cloud sync** via real user accounts. Login is GitHub OAuth only.
- **No silent data loss.** Any moment where local and cloud disagree must surface a chooser before either side overwrites the other.
- **Zero new server to maintain.** Auth + DB + RLS handled by Supabase. No new code in `oracle-worker`.
- **Backwards compatible.** Existing Export / Import / Reset flows continue to work unchanged.

## 3. Non-goals

- Real-time concurrent editing across devices.
- Cross-tab live sync within one browser (refresh required).
- Friends, leaderboards, shared tomes, social features.
- Email magic-link or email+password authentication.
- Server-side validation or sanitization of save blobs.
- Encryption at rest beyond what Supabase provides by default.
- A custom `/data-export` endpoint (the existing Export button already gives users their data).

## 4. Architecture overview

```
                         ┌──────────────────────────────────┐
                         │  Browser (GitHub Pages SPA)      │
                         │                                  │
                         │   React app                      │
                         │     │                            │
                         │     ├─ in-memory state           │
                         │     │     ▲     │ debounced      │
                         │     │     │     ▼                │
                         │     ├─ localStorage  ◀─ always   │
                         │     │     ▲                      │
                         │     │     │ on sign-in / sync    │
                         │     ▼     │                      │
                         │   @supabase/supabase-js          │
                         │     │     ▲                      │
                         └─────┼─────┼──────────────────────┘
                               │     │ HTTPS (auth + DB)
                               ▼     │
                         ┌──────────────────────────────────┐
                         │  Supabase project                │
                         │   • Auth (GitHub OAuth)          │
                         │   • Postgres `profiles`          │
                         │   • Postgres `saves` (RLS-gated) │
                         └──────────────────────────────────┘

                         ┌──────────────────────────────────┐
                         │  oracle-worker (Cloudflare)      │  ← unchanged
                         │   Groq proxy, no auth involvement│
                         └──────────────────────────────────┘
```

### Two-layer persistence

- **Local layer (always on, no login):** every `setPlayerState` is debounced ~500 ms and written to `localStorage` under one key (`dungeon-scholar:save:v1`). On app boot we hydrate from there before React's first paint.
- **Cloud layer (opt-in, login required):** when signed in, the same serialized state is debounced ~3 s and `upsert`'d into a Supabase `saves` row keyed by the user's `auth.uid()`. On sign-in we pull the cloud row; if it conflicts with local, we show a three-button chooser.

The Supabase JS SDK runs entirely in the browser. There is no new server. Auth tokens are minted by Supabase; RLS policies guarantee that the publishable (anon) key can only ever see/edit one user's own row.

## 5. Auth flow

1. User clicks **Sign in with GitHub** in the Settings panel.
2. Supabase SDK redirects → `github.com/login/oauth/authorize`.
3. User approves → GitHub redirects back to `https://<project>.supabase.co/auth/v1/callback?code=...&state=...`.
4. Supabase verifies the code, then redirects back to the app at `https://evilpatrick06.github.io/dungeon-scholar/?code=...&state=...` (PKCE flow, query params — not the older implicit/hash flow).
5. The app's OAuth callback handler (§8.6) calls `supabase.auth.exchangeCodeForSession(...)` to exchange the code for a session JWT. SDK persists the session to its own `localStorage` key (separate from our save key) and notifies the app via `onAuthStateChange`.
6. On that event we (a) ensure a `profiles` row exists (upsert with GitHub login + avatar URL from `user_metadata`), (b) trigger the merge-moment chooser if local + cloud both have data, (c) start the debounced cloud-sync.

**One-time setup (dashboards, not code):**
- GitHub: Settings → Developer settings → OAuth Apps → New. Authorization callback URL = the Supabase project's `/auth/v1/callback`.
- Supabase: Authentication → Providers → GitHub → paste client ID + secret.
- Supabase: Authentication → URL Configuration → add `https://evilpatrick06.github.io/dungeon-scholar/` and `http://localhost:5173/` to Redirect URLs.
- Build-time secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` in a `.env.local` (gitignored). The publishable / anon key is safe in client code — RLS bounds its privileges.

## 6. Data model

```sql
-- 1. profiles: cosmetic info copied out of GitHub on first sign-in.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  github_login text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- 2. saves: one row per user. Holds the entire playerState as a single jsonb blob.
create table saves (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  schema_ver   int not null default 1
);

-- RLS: users can only see/write their own rows.
alter table profiles enable row level security;
alter table saves    enable row level security;

create policy "own profile" on profiles for all
  using (auth.uid() = id)        with check (auth.uid() = id);
create policy "own save"    on saves    for all
  using (auth.uid() = user_id)   with check (auth.uid() = user_id);
```

**Why one row per user, not a row per tome:** the save blob is small (kilobytes to ~100 KB worst case), atomic-write semantics are simpler, and per-tome merging produces "Frankenstein" save states that don't correspond to any moment the user actually experienced. Single blob, single timestamp, single source of truth.

`schema_ver` lets a future client detect older blobs and run a migration before mounting. Initial value `1`.

## 7. Sync state machine

The whole feature reduces to four moments.

### 7.1 Boot (every app load)

```
read localStorage → hydrate React state → render
   │
   ▼
ask Supabase: "is there a session?" (cached, no network if so)
   │
   ├─ no session  → guest mode, local-only forever
   └─ session exists → silently pull cloud row, then go to steady-state writes
```

User sees their last state immediately. Cloud catch-up happens after first paint.

### 7.2 Sign-in (user clicks "Sign in with GitHub")

```
OAuth redirect dance → app reloads with session
   │
   ▼
pull cloud `saves` row (may be empty)
   │
   ├─ cloud empty + local empty       → nothing to do
   ├─ cloud empty + local has data    → upload local → cloud (silent)
   ├─ cloud has data + local empty    → download cloud → local (silent)
   └─ cloud has data + local has data → MERGE CHOOSER (modal)
                                         ├─ "Use this device's progress"  → local wins, push to cloud
                                         ├─ "Use my cloud progress"        → cloud wins, replace local
                                         └─ "Cancel"                       → sign out, no changes
```

"Has data" check: blob is non-null AND any of `level > 1`, `library.length > 0`, or `totalXp > 0`. (DEFAULT_STATE shouldn't trigger the chooser.)

### 7.3 Steady-state writes (signed in)

```
React state changes (any setPlayerState)
   │
   ▼
debounce 500 ms ──► localStorage.setItem(...)
   │
   ▼
debounce 3 s ──► supabase.from('saves').upsert({user_id, data, updated_at: now(), schema_ver: 1})
   │
   ├─ ok            → silent, sync indicator → green
   ├─ network fail  → keep local copy, retry on next change or in 30 s; sync indicator → red
   └─ auth expired  → trigger silent token refresh; if it fails, surface "signed out"
```

Two debounces, not one: local is always-fresh (cheap), cloud batches (network-bound). `beforeunload` flushes both pending writers synchronously.

Backoff: 3 retries, 1 s / 4 s / 16 s, then quiet until the next state change or 30 s tick.

### 7.4 Sign-out

```
user clicks "Sign out"
   │
   ▼
flush any pending cloud write
supabase.auth.signOut()
   │
   ▼
KEEP localStorage as-is (device-level save survives)
```

Explicitly *not* wiping local on sign-out. Local is the device's save, not the account's save. Future revisit point if shared-computer users complain.

### 7.5 Last-write-wins semantics

`saves.updated_at` updates on every write. When pulling cloud, we attach that timestamp to local state. A "stale device" coming online after a long offline period sees its own local state (newer device-side timestamp), pushes, and wins. If two devices are simultaneously editing while both online, the second writer wins by milliseconds — matches every casual app's expectation. Real-time concurrent editing is out of scope (§3).

## 8. UI surface

Six new things, all additive. Existing screens unchanged for guest users.

### 8.1 Sign-in button (Settings panel)

Lives alongside the existing Export / Import / Reset buttons. Signed-out copy:

```
[ 🔮 Sign in with GitHub to sync ]
Optional — your progress is already saved on this device.
```

The tagline is load-bearing — sign-in is an upgrade, not a gate.

### 8.2 Profile chip (top-right of main screen)

GitHub avatar (24 px) + `@username`. Click → opens Account panel. Sits next to the existing level / title display.

### 8.3 Account panel (modal)

- Avatar + GitHub username
- Sync status line: *"Synced 12 seconds ago"* / *"Saving…"* / *"Offline — will retry"*
- **Sign out** button
- **Delete cloud save** button — wipes the Supabase `saves` row, keeps local data, stays signed in. Confirmation modal first.
- **Delete account** button — wipes both `profiles` and `saves` rows for `auth.uid()`, signs out, preserves local data. Confirmation modal that requires typing the GitHub username to enable.

### 8.4 Merge chooser (modal, fires once per sign-in when both sides have data)

Two side-by-side cards summarizing each save:

```
┌─────────────────────────┐  ┌─────────────────────────┐
│  THIS DEVICE            │  │  YOUR CLOUD             │
│  Level 14  Apprentice   │  │  Level 21  Loremaster   │
│  3 tomes                │  │  2 tomes                │
│  287 cards reviewed     │  │  504 cards reviewed     │
│  Last save: 2 min ago   │  │  Last save: 6 hr ago    │
│                         │  │                         │
│  [ Use this device ]    │  │  [ Use cloud ]          │
└─────────────────────────┘  └─────────────────────────┘
                  [ Cancel sign-in ]
```

Each button's tooltip explicitly states "the other side will be replaced." No jargon.

### 8.5 Sync status indicator (passive)

Dot next to the profile chip:
- Green = synced
- Amber pulse = saving
- Red = error (click for tooltip: "Offline — will retry" / "Signed out — please sign in again")

Visible only when signed in. Idle state is unobtrusive.

### 8.6 OAuth callback handler

Not user-visible. A `useEffect` on `App` mount inspects the URL for OAuth params, calls `supabase.auth.exchangeCodeForSession(...)` if present, then strips the params with `history.replaceState`. One-time effect.

## 9. Edge cases & error handling

| Scenario | Behavior |
|---|---|
| Offline at sign-in | OAuth fails fast (toast, no state change). Cached session still boots from local; sync indicator shows "Offline — will retry" until network returns. |
| Token expires mid-session | SDK auto-refreshes silently. If refresh fails, banner: "Signed out — sign in again to resume sync." Falls back to local-only. No data loss. |
| Cloud write fails repeatedly | 3 retries with exponential backoff (1 s / 4 s / 16 s). Then red dot + "Offline — will retry." Local writes never block on cloud. |
| Two tabs, same account | Both share session via Supabase's `localStorage`. Race writes; `upsert` is atomic; last-by-ms wins. Cross-tab live sync NOT in scope — refresh second tab. |
| Save row exceeds row size | `jsonb` holds megabytes happily. Free-tier 500 MB DB is the real ceiling (~5,000 power users). Fine. |
| Tutorial / daily-quest state | Lives inside `playerState`, syncs with everything else. Daily quest dates use device-local time; brief stale-quest after time-zone-crossing sync is acceptable. |
| Schema migration later | `saves.schema_ver` lets a future client detect older blobs and migrate before mounting. Start at `v1`. |
| User revokes GitHub OAuth app | Next token refresh fails → "signed out" banner → local-only mode. They can re-sign-in to reauthorize. |
| `DEFAULT_STATE` triggering merge chooser | Guarded by the "has data" check (§7.2): blob non-null AND `level > 1` OR `library.length > 0` OR `totalXp > 0`. |

## 10. Security posture

- **Publishable (anon) key** is shipped in the bundled JS. Safe — it has no privileges beyond what RLS allows.
- **RLS policies** (`auth.uid() = user_id`) are the *only* thing keeping users out of each other's saves. Tested explicitly (§11).
- **GitHub OAuth client secret** lives only in the Supabase dashboard. Never committed.
- **Allowed redirect URLs** pinned to `evilpatrick06.github.io/dungeon-scholar/` and `localhost:5173/`. Stops OAuth-redirect-stealing.
- **`oracle-worker`** continues using its own origin allowlist independently. No coupling.
- **No PII collected** beyond what GitHub OAuth gives us (login, avatar URL, optionally email — we only store login + avatar).

## 11. Testing approach

### 11.1 Unit (Vitest, headless, in CI)

- `localStorage` hydrate/dehydrate round-trip preserves state.
- Debounce timing: rapid `setPlayerState` calls collapse to one local write and one cloud write.
- Merge logic: each of the four sign-in scenarios (empty/empty, empty/local, cloud/empty, cloud/local) takes the right branch.
- "Has data" guard: `DEFAULT_STATE` returns false; states with `level > 1` OR `library.length > 0` OR `totalXp > 0` return true.
- Schema-version migration stub runs when a future-newer or current blob is loaded.
- OAuth callback handler strips URL params after exchange.

### 11.2 Integration (manual, against a real free-tier Supabase project)

- Full GitHub OAuth round-trip from `localhost:5173`.
- Full GitHub OAuth round-trip from the deployed Pages site.
- Sign in with mismatched local/cloud → chooser appears. Each branch produces the expected end state.
- Two browsers signed in as the same user → second device pulls the first's progress on boot.
- **RLS bypass attempt:** in browser console, attempt `supabase.from('saves').select().neq('user_id', myUid)` and `update` on another user_id. Both must return zero rows / fail silently. *This single test is what proves the security model.*
- Delete cloud save → row gone, local survives, can re-sync from local.
- Delete account → both rows gone, signed out, local survives.
- Token expiry simulation (revoke from GitHub Settings → Applications) → next refresh fails → signed-out banner appears.

## 12. Implementation order (rough)

1. Create Supabase project, run schema SQL, configure GitHub OAuth provider.
2. Add `@supabase/supabase-js` dependency. Create `src/services/supabase.js` (client + helpers).
3. Add localStorage layer (hydrate-on-boot, debounced save). **Ship this independently — solves goal #1 even if cloud work stops here.**
4. Add OAuth callback handler + sign-in button.
5. Add cloud pull on sign-in + merge chooser modal.
6. Add steady-state cloud sync (debounced upsert + retry/backoff + sync indicator).
7. Add Account panel (sign-out, delete cloud save, delete account).
8. Tests (unit + manual integration checklist).
9. Update `dungeon-scholar/README.md` with the env-var setup and the dashboard checklist.

Step 3 is a natural shippable checkpoint — even if the cloud work stalls, users keep their progress on refresh.

## 13. Open questions / future work

- **Wipe local on sign-out?** Currently keeping it (§7.4). Revisit if shared-computer users complain.
- **Cross-tab live sync?** Out of scope today; doable later via `BroadcastChannel` if anyone asks.
- **Magic-link fallback** for non-GitHub users? Single config flip + a small UI addition. Defer until a real user asks.
- **Public profiles / leaderboards?** The `profiles` table already gives us a foothold if we ever want this.
