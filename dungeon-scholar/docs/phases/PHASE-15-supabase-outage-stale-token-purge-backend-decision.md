# PHASE-15 — Supabase outage: pre-`getSession` stale-token gate, quarantine storage purge, and the cloud-sync backend decision

> Authored from [`QA-report-2026-07-15.md`](./QA/completed/QA-report-2026-07-15.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages build `index-BRt729T6.js` / `index-ZUXFOuDd.css`, cross-checked worktree base `e03664fa`; plan authored against `origin/master` `f2300ac8`, 2026-07-15). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

The report's High + Medium are two faces of one outage: the Supabase project host baked into the live bundle (`wivnzcbufpqdjwycampb.supabase.co`) **no longer resolves in DNS** (re-verified from bmo while authoring this plan: `getent hosts` → no answer), so cloud sync and GitHub sign-in are dead for every user of the deploy — and the app's own outage handling, hardened across PHASE-02 F1 / PHASE-08 08E / PHASE-13 F2, is **still defeated** on the one profile that matters most (a previously-signed-in user with a stale persisted token): every page load emits a ~30 s storm of ~20 console errors and the stale token is **never** removed, so the storm repeats identically on every subsequent load.

The Medium is fully diagnosable in source, and the root cause is precise: **PHASE-13's reachability pre-probe runs too late.** It is gated on `if (session)` *after* `getSession()` resolves — but with an *expired* persisted token, `getSession()` itself performs the refresh (GoTrue's `__loadSession` → `_callRefreshToken`), runs the entire internal retry burst against the dead host, and then resolves `session: null` *without removing the token from storage*. The `null` session routes useAuth down the signed-out `else` branch, so the probe never fires, `quarantine()` never runs (hence the report's "no quarantine warning"), and the token survives to storm again.

- **F1 (medium, bug) — app-side: gate `getSession()` behind the reachability probe when a persisted token exists, and purge the token from storage directly when the host is down.** Two sub-phases (15A the gate, 15B the quarantine purge-hardening); both are `bug` and auto-implementable per the autonomy policy.
- **F2 (high, config) — the backend itself: restore, re-provision, or retire the Supabase project.** Owner-decision territory (dashboard + repo-secrets actions the executer cannot take); 15C records the options and the board-gated ask. 15A/15B make the app well-behaved under *any* of the three outcomes and are worth shipping regardless — a paused free-tier project can recur.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of PHASE-14 (pending). 15A and 15B ship together naturally (same two files) but are separable; 15C is a decision item that can resolve before or after.
- **F1 completes the PHASE-02 → 08E → 13 arc; it does not reopen any of them.** PHASE-02 F1 (`autoRefreshToken: false`) and PHASE-08 08E (validate-before-arm + failure-ceiling quarantine) remain correct and untouched. PHASE-13 F2's probe (`probeSupabaseReachable`, `supabase.js:33`) is kept — 15A *hoists when it runs* (before `getSession()`, keyed on a persisted token existing) instead of after (keyed on a session GoTrue can no longer return). This is the same "don't hand a known-down host to GoTrue" intent, applied one call earlier to the call that actually triggers the storm.
- **The report's `signOut` hypothesis is confirmed in the vendored dep** (see F1 below): even when `quarantine()` *is* reached via other paths, `signOut({ scope: 'local' })` cannot be relied on to remove the key against a dead host. 15B fixes that independently of 15A.
- Files: 15A/15B touch `src/services/supabase.js` + `src/hooks/useAuth.js` (tests: `useAuth.circuitBreaker.test.jsx`, `useAuth.test.jsx`, `supabase.test.js`). 15C touches no app code (docs + owner actions only). No overlap with PHASE-14 or PHASE-16 files.

## Verified findings

All verification read-only against `origin/master` `f2300ac8` (worktree `auto/scholar-phase-maker`) and the vendored `@supabase/auth-js@2.108.2` / `@supabase/supabase-js` in the main checkout's `node_modules`. Re-run before implementing (rule 3).

### F1 (medium, bug) — expired persisted token + unreachable host: `getSession()` itself runs the retry storm before the PHASE-13 probe can fire, and nothing ever removes the token

**Status: confirmed in source, full chain.** The live behavior the report observed (~20 uncaught `TypeError: Failed to fetch` / `AuthRetryableFetchError` over ~29 s per load, stacks ending at `_refreshAccessToken` / `_callRefreshToken`, UI signed-out, **no** quarantine warning, token still in `localStorage` before and after, storm identical on reload) is exactly what the current source must do:

1. `useAuth.js:112-132` — the PHASE-13 probe is *inside* `getSession().then(...)`, gated on `if (session)`:
   ```js
   supabase.auth.getSession().then(async ({ data }) => {
     const session = data?.session ?? null;
     ...
     if (session) {
       const reachable = await probeSupabaseReachable();   // PHASE-13 F2 — never reached, see below
       ...
     } else {
       stopRefresh();                                      // ← the path actually taken
     }
   })
   ```
2. `getSession()` refreshes expired sessions internally, before returning. `GoTrueClient.js` (`auth-js@2.108.2`): `getSession` → `__loadSession` (`:2419/:2431`); the stored session is expired (`expires_at` 2026-05-19, far past `EXPIRY_MARGIN_MS`, `:2458-2459`) → `_callRefreshToken(currentSession.refresh_token)` (`:2486`) → `_refreshAccessToken` (`:3896`), whose `retryable()` loop retries `AuthRetryableFetchError` with `200·2^n` backoff for as long as the next attempt fits inside `AUTO_REFRESH_TICK_DURATION_MS = 30_000` (`constants.js:6`). Against a DNS-dead host that is ~8-9 network attempts in ~29 s — each one a browser-logged network failure plus the accompanying rejection noise ≈ the observed ~20 console errors. This all happens **inside the awaited `getSession()`**, before useAuth sees anything.
3. On final retryable failure, the session is *deliberately preserved*. `__loadSession` returns `{ data: { session: null }, error }` **without removing the storage key** (the "proactive-preserve" block, `:2488-2507`, only hands back the stored session if the access token is still in its real expiry window — here it isn't, so the caller gets `null`, but storage is untouched; removal only happens for *non-retryable* auth errors). So useAuth receives `session === null` → takes the `else { stopRefresh() }` branch → **no probe, no quarantine, no warn, no purge**. The token survives; next load repeats byte-identically.
4. The report's `signOut` hypothesis is also real (belt for 15B): `_signOut` → `_useSession` → `__loadSession` (`GoTrueClient.js`, `async _signOut`), i.e. `signOut({ scope: 'local' })` *first re-loads (and against an expired token, re-refreshes) the session*; with the host dead, `__loadSession` yields a `sessionError`, `_signOut` **returns early on it** and never reaches its remove-session step. So even where `quarantine()` does run, `signOut` can both kick off a *second* retry storm and still fail to clear the key.
5. The storage key is deterministic: the client is created without a custom `storageKey`, so supabase-js derives `sb-<project-ref>-auth-token` (`supabase-js dist/index.mjs:652`, `defaultStorageKey = 'sb-' + baseUrl.hostname.split('.')[0] + '-auth-token'`) — matching the report's observed `sb-wivnzcbufpqdjwycampb-auth-token`. PKCE also writes a sibling `...-auth-token-code-verifier` key during sign-in flows.

```bash
sed -n '112,133p' dungeon-scholar/src/hooks/useAuth.js                  # probe gated on session, inside .then
sed -n '26,45p'  dungeon-scholar/src/services/supabase.js               # PHASE-13 probe (kept, hoisted)
# vendored-dep confirmation (main checkout has node_modules):
grep -n '_callRefreshToken(currentSession.refresh_token)' dungeon-scholar/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js
grep -n 'AUTO_REFRESH_TICK_DURATION_MS' dungeon-scholar/node_modules/@supabase/auth-js/dist/main/lib/constants.js
grep -rn 'defaultStorageKey' dungeon-scholar/node_modules/@supabase/supabase-js/dist/index.mjs
```

**Root cause:** the reachability check is sequenced after the only call that needs it. `getSession()` is not a passive read — with an expired persisted token it is itself a refresh (with GoTrue's internal, console-logging retry loop), and its failure mode (`session: null`, storage preserved) is indistinguishable from "signed out" to the current `.then` branch. Nothing in the app ever removes the stale key, because the only removal paths (GoTrue's non-retryable-error path; `signOut`) are both unreachable/broken against a dead host.

**Suggested action (report's, confirmed correct):** detect the persisted token synchronously *before* `getSession()`; probe first; if unreachable, remove the `sb-*-auth-token` key(s) directly and skip `getSession()` entirely. Harden `quarantine()` to purge storage synchronously instead of relying on `signOut({ scope: 'local' })`.

### F2 (high, config) — the Supabase project host no longer resolves; cloud sync/sign-in dead for the entire deploy

**Status: re-confirmed while authoring** (`getent hosts wivnzcbufpqdjwycampb.supabase.co` from bmo → no answer), matching the report's browser (`TypeError: Failed to fetch` on `auth/v1/health`) and Pi (`curl: (6)`) checks. This is a server-side/config matter, not app code: Supabase pauses inactive free-tier projects and removes them from DNS; paused projects are restorable from the dashboard for a limited window, deleted ones are not (cloud `saves`/`profiles` rows lost). The URL/key are baked in at deploy time from the `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` GitHub Actions secrets (`.github/workflows/dungeon-scholar-deploy.yml:41-42`).

The app already has a correct zero-config posture to fall back to: with the secrets unset, `supabase.js:10-20` builds a `null` client, `isSupabaseConfigured()` is `false`, and `SignInButton.jsx:11` returns `null` — sign-in UI hidden, clean local-only build, no dead-host advertising. That path is shipped and tested today; 15C is purely the decision + owner actions.

## Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (vitest, happy-dom). `src/hooks/useAuth.circuitBreaker.test.jsx` mocks `../services/supabase.js` at module level — **any new export used by `useAuth.js` (e.g. the persisted-token check / purge helpers) must be added to that mock** (and to `useAuth.test.jsx`'s mock if touched), or the suite fails on import. `src/services/supabase.test.js` tests the service directly.
- **Storage:** happy-dom provides `localStorage`; guard all direct access in `try/catch` anyway (Safari private-mode semantics; the app's own save lives at `dungeon-scholar:save:v1` and must never be touched by the purge).
- **Lint / typecheck / build:** `npm run lint` (Biome), `npm run typecheck` (`tsc --noEmit`, keep 0), `npm run build` (`VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates test + build on push. Run installs in a worktree via `npm ci` (the main checkout's `node_modules` is prod-only — known issue, `ISSUES-LOG-DUNGEON-SCHOLAR.md` 2026-07-15).
- Vendored dep pins for the verified line numbers: `@supabase/auth-js@2.108.2`. If the lockfile bumps it, re-verify `__loadSession`/`_signOut` behavior before amending.

## Sub-phases

15A and 15B are `bug` (auto-implementable); 15C is `config` (board-gated owner decision). 15A/15B in either order (same files, ship together in one commit is fine); 15C independent.

### 15A — Persisted-token pre-gate: probe before `getSession()`, purge and stand down when the host is unreachable (F1)

**Objective:** a load with a stale persisted token against an unreachable host issues **no** `token?grant_type=refresh_token` traffic, emits exactly one handled `logWarn` (no ~20-error burst), **removes** the `sb-*-auth-token` key(s) so subsequent loads are storm-free signed-out loads, and drops the UI to signed-out/local-first. Signed-out loads (no token) and reachable-host loads are unchanged.

**Files:** `dungeon-scholar/src/services/supabase.js` (two new helpers); `dungeon-scholar/src/hooks/useAuth.js` (the effect body); `dungeon-scholar/src/services/supabase.test.js`, `dungeon-scholar/src/hooks/useAuth.circuitBreaker.test.jsx` (+ the module mock in `useAuth.test.jsx`) (extend).

**Steps:**
1. In `supabase.js`, add two small storage helpers next to `probeSupabaseReachable` (keep them export-adjacent so the env/url stays co-located). Match on the auth-token key *pattern*, not a hardcoded ref, so a future project rotation (15C) needs no code change; the prefix+substring match also catches the PKCE `-code-verifier` sibling:
   ```js
   // PHASE-15 15A: GoTrue's default persistSession key is `sb-<project-ref>-auth-token`
   // (+ a `-code-verifier` sibling during PKCE). Match the pattern, never the app's
   // own `dungeon-scholar:*` keys.
   const AUTH_TOKEN_KEY_RE = /^sb-.+-auth-token/;

   export function hasPersistedSession() {
     try {
       for (let i = 0; i < localStorage.length; i++) {
         if (AUTH_TOKEN_KEY_RE.test(localStorage.key(i))) return true;
       }
     } catch { /* storage unavailable → treat as signed out */ }
     return false;
   }

   export function purgePersistedAuthTokens() {
     try {
       const doomed = [];
       for (let i = 0; i < localStorage.length; i++) {
         const k = localStorage.key(i);
         if (AUTH_TOKEN_KEY_RE.test(k)) doomed.push(k);
       }
       for (const k of doomed) localStorage.removeItem(k);
       return doomed.length;
     } catch {
       return 0;
     }
   }
   ```
   (Collect-then-remove — never remove while indexing `localStorage.key(i)`.)
2. In `useAuth.js`, gate the *entire* `getSession()` chain behind the probe when (and only when) a persisted token exists. Before the current `supabase.auth.getSession()` call, inside an async IIFE or by making the effect body a named async fn:
   ```js
   // PHASE-15 15A: with an EXPIRED persisted token, getSession() itself refreshes
   // (GoTrue __loadSession → _callRefreshToken) and runs the internal retry burst
   // before resolving session:null WITHOUT clearing storage — so the PHASE-13
   // post-getSession probe never fires and the storm repeats every load. Probe
   // FIRST, keyed on the token existing; unreachable → purge + stand down without
   // ever calling getSession(). No token → skip the probe (zero added latency on
   // signed-out loads). Reachable → the existing path below is unchanged.
   if (hasPersistedSession()) {
     const reachable = await probeSupabaseReachable();
     if (!active) return;
     if (!reachable) {
       quarantine();          // 15B makes this purge storage synchronously
       setLoading(false);
       return;                // getSession() is never called this load
     }
   }
   ```
   Then remove the now-redundant PHASE-13 probe from the `if (session)` branch (`useAuth.js:120-129`) — with the gate above, a session-present resolution implies the probe already passed this load; the branch reverts to `armRefresh()` directly, and the 08E breaker remains the backstop for a host that dies between probe and refresh. Keep the `.catch` on `getSession()` as-is.
3. Do not change `MAX_REFRESH_FAILURES` / `REFRESH_RETRY_MS` / `armRefresh` / the `onAuthStateChange` quarantine echo-guard / `probeSupabaseReachable` itself.

**Verify (read-only, after editing):**
```bash
grep -n 'hasPersistedSession\|purgePersistedAuthTokens' dungeon-scholar/src/services/supabase.js dungeon-scholar/src/hooks/useAuth.js
sed -n '110,140p' dungeon-scholar/src/hooks/useAuth.js    # gate precedes getSession(); session-branch back to armRefresh()
```

**Tests:**
- `supabase.test.js`: `purgePersistedAuthTokens` removes `sb-wivnzcbufpqdjwycampb-auth-token` **and** `sb-x-auth-token-code-verifier`, leaves `dungeon-scholar:save:v1` and unrelated keys; `hasPersistedSession` true/false accordingly; both no-throw when storage access throws.
- `useAuth.circuitBreaker.test.jsx` (add `hasPersistedSession`/`purgePersistedAuthTokens` to the module mock): token-present + probe-false → `getSession` **never called**, quarantine ran (user null, ticker stopped, exactly one `logWarn`), purge called; token-present + probe-true → `getSession` called, existing 08E breaker scenarios byte-identical; token-absent → probe **not** called, `getSession` called (signed-out path unchanged).

**Acceptance:** with a stale token + unreachable host: zero `refreshSession`/`getSession` refresh traffic, one warn, token keys purged, UI signed-out, and a reload is a clean quiet signed-out load; reachable-host and signed-out loads unchanged; lint/typecheck/test/build clean.

### 15B — `quarantine()` purges storage synchronously; `signOut` demoted to best-effort cleanup (F1 belt)

**Objective:** every path into `quarantine()` (the 08E failure ceiling; 15A's unreachable gate; any future caller) actually removes the persisted token, without depending on `signOut({ scope: 'local' })` — which is confirmed (F1 point 4) to re-load/re-refresh the session first, storm again against a dead host, and return early without removing the key.

**Files:** `dungeon-scholar/src/hooks/useAuth.js` (`quarantine`, `:64-78`); `dungeon-scholar/src/hooks/useAuth.circuitBreaker.test.jsx` (extend).

**Steps:**
1. In `quarantine()`, purge **first, synchronously**, then keep the existing `signOut` as best-effort in-memory cleanup:
   ```js
   const quarantine = () => {
     if (!active) return;
     quarantined = true;
     stopRefresh();
     purgePersistedAuthTokens();   // PHASE-15 15B: direct, synchronous — signOut({scope:'local'})
                                   // re-loads (and re-refreshes) the session via _useSession first,
                                   // so against a dead host it storms again AND returns early
                                   // without ever removing the key. Storage truth first.
     try {
       supabase?.auth?.signOut?.({ scope: 'local' });   // best-effort in-memory state cleanup
     } catch { /* best effort */ }
     setUser(null);
     logWarn(/* unchanged */);
   };
   ```
   With the key already gone, `signOut`'s internal `__loadSession` finds no session (an `AuthSessionMissingError` path it explicitly tolerates) — no second storm.
2. Keep the single `logWarn` copy as-is (or extend the detail string with "stale token purged" — executor's judgment; one warn either way).

**Verify (read-only, after editing):** `sed -n '60,85p' dungeon-scholar/src/hooks/useAuth.js` — purge precedes `signOut`.

**Tests:** extend `useAuth.circuitBreaker.test.jsx`: drive the existing 08E ceiling path (probe-true, `refreshSession` failing) with a seeded fake `sb-*-auth-token` key → assert the key is gone after quarantine and `signOut` was called after the purge (call-order assertion or just both-called + key-gone); assert quarantine still emits exactly one warn.

**Acceptance:** quarantine removes the persisted token on every path even when `signOut` rejects/hangs; one warn; 08E ceiling behavior otherwise unchanged; suite green.

### 15C — Backend decision: restore, re-provision, or retire the Supabase project (F2 — board-gated, owner actions)

**Objective:** the deploy stops advertising a sign-in that cannot work. Three exits, all owner-side (Supabase dashboard / GitHub repo settings); the executer's only in-repo action is the board ask + docs note.

**Options (record the choice in `docs/supabase-setup.md` when made):**
1. **Restore/unpause** `wivnzcbufpqdjwycampb` from the Supabase dashboard (possible only if paused, not deleted). Zero repo changes; existing user rows and the GitHub OAuth app keep working. Check first — cheapest if available.
2. **Re-provision**: new project per the existing runbook [`docs/supabase-setup.md`](../supabase-setup.md) (schema + RLS + `alter publication supabase_realtime add table saves;` + GitHub OAuth callback `https://<new-ref>.supabase.co/auth/v1/callback`), then rotate the `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` repo secrets and redeploy. Old cloud rows are lost (local-first saves are unaffected; users re-sync on next sign-in). 15A's pattern-based purge handles the ref change with no code edit.
3. **Retire (interim or permanent)**: unset both secrets → next deploy builds the verified clean local-only mode (null client, sign-in UI hidden). Smallest honest state while deciding; reversible any time.

**Steps (executer):**
1. Post the decision ask to the status board per the autonomy policy (`config` — gated): the three options above, with the note that 15A/15B ship regardless and the live console/token damage is already contained by them.
2. Nothing else in-repo. Do **not** unset env handling, hide `SignInButton` harder, or hardcode any outcome in app code — the null-client path already covers option 3 and options 1/2 need no app change.

**Acceptance:** board item posted with the three options; `docs/supabase-setup.md` gains the outcome note once the owner decides (that edit may land in a later run). No app-code changes under 15C.

## Research notes

- The arc across phases, for the record: PHASE-02 F1 killed the *signed-out* init storm (`autoRefreshToken: false`); PHASE-08 08E bounded the *explicit* `refreshSession()` calls and added quarantine; PHASE-13 F2 stopped GoTrue's *internal* burst for the session-present-and-resolvable case. The uncovered square was always "token present but so stale GoTrue must refresh *inside* `getSession()`" — reachable only once the host had been dead long enough for every live session to expire, which is exactly what the project pause produced. 15A closes the square by keying the probe on the *stored artifact* (the token) rather than any GoTrue-mediated result.
- Purging on unreachable is safe for real signed-in users: the purge only fires when the host is DNS-dead at load, in which case the session was unusable anyway; if the backend later returns, the user signs in again (PKCE) and cloud rows re-sync. We deliberately do *not* purge on mere refresh failure against a *reachable* host (the 08E path keeps its semantics; a purge there is 15B's quarantine, which only runs after the failure ceiling).
- `getSession()`'s proactive-preserve (keeping storage on retryable failure) is *correct* upstream behavior for transient outages — the app-level judgment 15A adds is that a DNS-dead host at load time is not transient enough to pay ~30 s of console errors per load for, given local-first is the product's stated posture.
- 15C option 3 is verified shipped behavior, not new work: `supabase = null` when env unset (`supabase.js:10-20`), `isSupabaseConfigured()` false, `SignInButton` renders nothing (`SignInButton.jsx:11`), `useAuth` exits before any network (`useAuth.js:47-50`), cloud-sync call sites are `isSupabaseConfigured()`-guarded.

## Test plan

- **Unit (new/extended):** `supabase.test.js` (purge/has helpers: pattern coverage, app-key safety, storage-throw safety); `useAuth.circuitBreaker.test.jsx` (15A gate matrix: token+down → no `getSession`, purge, one warn; token+up → unchanged breaker scenarios; no-token → no probe; 15B: quarantine purges on the ceiling path, purge-before-signOut).
- **Gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) — CI parity.
- **Manual spot check (executor, live or local `npm run preview` with the dead-host env):** seed an expired `sb-wivnzcbufpqdjwycampb-auth-token` in localStorage → load → console shows one `[Dungeon Scholar]` warn, no fetch-error burst, key gone; reload → quiet signed-out load. Without the key → no probe request in the Network tab.

## Acceptance criteria

1. With a stale persisted token and an unreachable Supabase host, a page load issues no token-refresh traffic, logs exactly one handled warning, removes the `sb-*-auth-token` (+`-code-verifier`) keys, and renders signed-out/local-first; the next load is a clean signed-out load (storm cannot recur).
2. `quarantine()` removes the persisted token synchronously on every path, before and independent of `signOut({ scope: 'local' })`.
3. Signed-out loads add zero probe/network overhead; reachable-host signed-in loads keep today's arm/refresh/08E-breaker behavior byte-identically (existing breaker tests pass unmodified except for mock-surface additions).
4. The purge never touches `dungeon-scholar:*` (or any non-`sb-*-auth-token`) keys and never throws when storage is unavailable.
5. The 15C decision ask is posted to the board (config-gated); no app code changes under 15C.
6. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **Restoring/re-provisioning the Supabase project itself** — owner actions (15C options); not executable from the repo.
- **PHASE-02 F1 / PHASE-08 08E / PHASE-13 F2 internals** — not reopened. Breaker constants, `armRefresh`, the echo-guard, and `probeSupabaseReachable` are unchanged; 15A only re-sequences when the probe runs.
- **Suppressing GoTrue's internal logging / patching `@supabase/auth-js`** — rejected again (cf. PHASE-13 Out of scope); 15A makes the burst unreachable instead.
- **A user-visible "cloud sync offline" banner** — same standing UX call as PHASE-13; the single warn covers diagnostics. File separately if wanted.
- **Deleting the user's *cloud* rows or local save** — never. The purge is auth-token-only.
- **The report's "Could not test" surfaces** (destructive/mutating flows, OAuth round-trip, responsive matrix, PWA-offline, Oracle round-trip) — QA-environment blockers (no throwaway profile; Supabase down; window-resize inert), not app findings. The OAuth/sync matrix becomes testable again only after 15C resolves.
