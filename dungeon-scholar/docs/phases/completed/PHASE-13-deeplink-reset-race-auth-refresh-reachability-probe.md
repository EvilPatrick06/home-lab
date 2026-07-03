# PHASE-13 — Deep-link 08A cold-load reset race + Supabase refresh reachability pre-probe (load-noise round)

> Authored from [`QA-report-2026-06-29-5.md`](./QA/completed/QA-report-2026-06-29-5.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages SPA build `index-Dw_qfUwQ.js` — the post-integrator-merge `337fbbaf` redeploy carrying dungeon-scholar phases 07/08/09 — cross-checked `origin/master` `223fd832`, 2026-06-29). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Run-5's two remaining findings are both **Low**, both *follow-ups that verify a prior phase shipped but didn't fully close its target*, and each is small and self-contained. This phase bundles them (the established round-of-Lows pattern, cf. PHASE-11), one independent sub-phase each:

- **F1 (low, routing) — PHASE-08 08A's protective reset is defeated on its exact target (a bad-id deep link opened cold).** Opening `#/tome/<bad-id>/<gated-screen>` as a fresh load rests on `#/<gated-screen>` (rendered against the *existing* active tome) with **no** "not in thy library" toast, because `clearPendingTome()` canonicalizes the URL by reading the **stale** `screenRef.current` and rewrites `#/home` back to the gated screen before 08A's queued reset lands. Low practical impact (a valid active tome renders the gated screen fine; the null-tome worst case is still caught by the courseSet-gated guard), but 08A does not do what it documents.
- **F2 (low, load-noise) — the Supabase refresh storm is now bounded + self-terminating (PHASE-08E breaker confirmed working live) but still emits a bounded burst of uncaught `Failed to fetch` per load.** The breaker quarantines the stale token after the failure ceiling, but each `refreshSession()` lets GoTrue run its *internal* retry/back-off loop, and GoTrue logs every internal fetch failure to the console before our `catch` swallows the returned error. Net: ~8 spaced `TypeError: Failed to fetch` + 2 `AuthRetryableFetchError` per fresh load against the unreachable host — functionally harmless (local-first, breaker stops it) but visibly noisy. **This is the small load-noise follow-up PHASE-11 anticipated** ("if the storm persists after PHASE-08 ships live, open a small load-noise follow-up rather than reopening here").

Neither depends on the other; implement in any order. Both are `bug`/load-noise polish, fully specified below.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of PHASE-10/PHASE-12 (the light-theme pair) and of each other. By severity these Lows run after the Mediums.
- **F1 confirms-and-completes PHASE-08 08A** (the not-found deep-link reset). 08A *shipped* (the reset + toast code is present); F1 fixes the canonicalization race that undoes it on cold load. Re-confirm the 08A block by its `That tome is not in thy library` string before editing (rule 3).
- **F2 is a polish layer on the *now-verified-working* PHASE-08E breaker — it does NOT reopen PHASE-02 F1 or PHASE-08 08E.** PHASE-02 F1 (autoRefreshToken:false, signed-out loop killed — done) and PHASE-08 08E (validate-before-arm + failure-ceiling quarantine — done) are both confirmed live by this run (the storm now self-terminates, last error ~29s, no infinite loop). F2 adds **one** thing on top: a one-shot reachability check *before* the first `refreshSession()` so GoTrue never spins its internal retry burst against a host we already know is down. The breaker stays as the backstop.
- **F1 files** (`src/App.jsx`, `src/router/useHashRoute.js`) and **F2 files** (`src/hooks/useAuth.js`, `src/services/supabase.js`) do not overlap. `useHashRoute.js` has an existing test (`useHashRoute.test.jsx`); `useAuth` has `useAuth.test.jsx` + `useAuth.circuitBreaker.test.jsx`.

## Verified findings

All verification read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run before implementing (rule 3).

### F1 (low, routing/UX) — bad-id deep link does not reset to home on cold load (08A defeated by a replaceState/screenRef race)

**Status: confirmed in source. `clearPendingTome()` reads a stale `screenRef` and canonicalizes the URL back to the gated screen, clobbering 08A's `setScreen('home')`.**

The 08A not-found branch (`src/App.jsx`, the `pendingTomeId` effect) does the right things in the wrong order relative to the ref update:

```jsx
// App.jsx — pendingTomeId effect, 08A not-found branch (~723-742)
} else {
  // PHASE-08 08A: …reset to home so the screen falls through to the redirect…
  setScreen('home');                 // sets location.hash = '#/home' → QUEUES a hashchange (async)
  showNotif('That tome is not in thy library.', 'error');
}
clearPendingTome();                   // runs SYNCHRONOUSLY, before the queued hashchange
```

`clearPendingTome` (`src/router/useHashRoute.js:100-104`) canonicalizes off the **ref**, which still holds the deep-linked screen:

```js
const clearPendingTome = useCallback(() => {
  setPendingTomeId(null);
  // #/tome/<id>/<screen> → #/<screen>
  window.history.replaceState(null, '', formatHash(screenRef.current));   // screenRef.current === 'dungeon' (stale)
}, []);
```

Sequence on a cold `#/tome/<bad-id>/dungeon` load: mount parses → `screen='dungeon'`, `pendingTomeId='<bad-id>'`; `screenRef.current` becomes `'dungeon'` (post-render effect, `useHashRoute.js:63-65`). The 08A effect runs: `setScreen('home')` sets `location.hash='#/home'` (queues a hashchange) → then `clearPendingTome()` synchronously `replaceState`s the URL to `formatHash('dungeon')` = `#/dungeon` (because `screenRef.current` is still `'dungeon'` — the ref only advances after the *next* render commits). The queued `hashchange` then fires, reads the now-`#/dungeon` location, and `onHashChange` (`useHashRoute.js:80-90`) `setScreenState('dungeon')` — undoing 08A's home reset. End state: URL `#/dungeon`, screen `dungeon`, no reset, and the toast may be lost to the same re-render. Exactly the report's observation.

```bash
sed -n '/PHASE-08 08A/,/clearPendingTome/p' dungeon-scholar/src/App.jsx       # the not-found branch ordering
sed -n '100,104p' dungeon-scholar/src/router/useHashRoute.js                  # clearPendingTome reads screenRef.current
sed -n '80,98p'   dungeon-scholar/src/router/useHashRoute.js                  # onHashChange re-reads the (rewritten) hash
```

**Root cause:** `clearPendingTome` canonicalizes the URL from the *stale* `screenRef`, not from the screen 08A just reset to. Because `setScreen` drives the change through `location.hash`+`hashchange` (async) while `replaceState` is synchronous, the synchronous canonicalize wins the race and the deferred reset reads it back.

**Suggested action (report's):** let `clearPendingTome` accept an explicit target screen and have 08A pass `'home'`, so the canonicalizing `replaceState` uses the post-reset screen instead of the stale ref. (Equivalent alternative: sequence the reset so canonicalization runs after the ref advances — the explicit-arg fix is smaller and race-free.)

### F2 (low, load-noise) — Supabase refresh still emits a bounded `Failed to fetch` burst before the breaker trips

**Status: confirmed in source. The 08E breaker bounds *our* `refreshSession()` calls, but each call lets GoTrue's internal retry loop log fetch failures to the console before our `catch`.**

`src/services/supabase.js` creates the client with `autoRefreshToken: false` (PHASE-02 F1), so a signed-out load is silent. With a *present* (stale) session, `src/hooks/useAuth.js` drives the refresh explicitly: `getSession()` → `armRefresh()`, which calls `supabase.auth.refreshSession()` up to `MAX_REFRESH_FAILURES` (3) times `REFRESH_RETRY_MS` (300ms) apart, then `quarantine()`:

```js
// useAuth.js — armRefresh (84-110): validate before arming the ticker
for (let attempt = 1; attempt <= MAX_REFRESH_FAILURES; attempt++) {
  try {
    const { error } = (await supabase.auth.refreshSession()) || {};   // GoTrue runs its OWN internal retry/back-off here
    if (!error) { startRefresh(); return; }
    networkFailure = true;
  } catch { networkFailure = true; }
  …
}
quarantine();   // local sign-out + stopRefresh() + ONE logWarn
```

The breaker works (the run confirmed it self-terminates) — but `supabase.auth.refreshSession()` internally is GoTrue's `_callRefreshToken`/`_refreshAccessToken`, which retries on `AuthRetryableFetchError` with its own back-off (the observed 1s,1s,1s,2s,4s,7s,13s spacing) and **logs each internal fetch failure to the console** before resolving/rejecting back to us. Our `catch` cleanly converts the *outcome* into one `logWarn`, but it cannot suppress GoTrue's *internal* per-retry logging. So a bounded burst still reaches the console on every fresh load against the unreachable host. The host is unreachable because the free-tier project (`wivnzcbufpqdjwycampb.supabase.co`) is paused/deleted — every attempt is a hard network failure.

```bash
sed -n '42,152p' dungeon-scholar/src/hooks/useAuth.js          # getSession → armRefresh → quarantine
sed -n '1,24p'   dungeon-scholar/src/services/supabase.js      # client opts (autoRefreshToken:false) + url/key
ls dungeon-scholar/src/hooks/useAuth*.test.jsx                 # useAuth.test.jsx + useAuth.circuitBreaker.test.jsx
```

**Root cause:** we let GoTrue attempt a refresh (and run its internal, console-logging retry loop) *before* we know the host is reachable. The breaker reacts to failures after they have already been logged by the third-party client.

**Suggested action (report's, primary):** a one-shot reachability HEAD probe before arming the refresh ticker — if the host is unreachable, quarantine immediately (one `logWarn`, local-first) and never call `refreshSession()`, so GoTrue's internal retry burst never starts. (Alternatives the report lists — suppressing GoTrue's logging, or a single "cloud sync offline" line — are harder/less surgical; the probe is the lowest-risk and is specified below.)

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (`vitest run`, happy-dom + `@testing-library/react`). `src/router/useHashRoute.test.jsx` exists — extend it for F1. `src/hooks/useAuth.circuitBreaker.test.jsx` exists (the 08E breaker test) — extend it for F2 (mock the probe `fetch` to reject → assert `refreshSession` is **not** called and `quarantine` runs with one warn; mock it to resolve → assert the existing arm path is unchanged).
- **Lint / typecheck / build:** `npm run lint` (Biome), `npm run typecheck` (`tsc --noEmit`, checkJs 0 — keep clean), `npm run build` (`VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates test + build on push.
- React 19, hash routing (`#/<screen>`), `type: "module"`, plain JSX. The Supabase URL is `import.meta.env.VITE_SUPABASE_URL` (`supabase.js:4`); the client is `null` when env is unset (`isSupabaseConfigured()` guards every path).

## Sub-phases

One per finding; each independently shippable, both leave the tree green. Either order.

### 13A — Canonicalize 08A's reset off the intended target, not the stale ref (F1)

**Objective:** a cold-loaded `#/tome/<bad-id>/<gated-screen>` lands on `#/home` with the "not in thy library" toast (08A's documented behavior), with no regression to valid `#/tome/<id>/<screen>` deep-link consumption.

**Files:** `dungeon-scholar/src/router/useHashRoute.js` (`clearPendingTome`); `dungeon-scholar/src/App.jsx` (08A not-found branch); `dungeon-scholar/src/router/useHashRoute.test.jsx` (extend).

**Steps:**
1. Give `clearPendingTome` an optional explicit target so it canonicalizes off the caller's intent rather than the (possibly stale) ref:
   ```js
   const clearPendingTome = useCallback((targetScreen) => {
     setPendingTomeId(null);
     const target = targetScreen ?? screenRef.current;   // explicit wins; default preserves today's behavior
     window.history.replaceState(null, '', formatHash(target));
   }, []);
   ```
   The default branch keeps the *valid* deep-link path byte-identical (`#/tome/<id>/shop` → consumed → `#/shop` via `screenRef`).
2. In `App.jsx`'s 08A not-found branch, pass the reset target so the canonicalize agrees with `setScreen('home')`:
   ```js
   } else {
     setScreen('home');
     showNotif('That tome is not in thy library.', 'error');
     clearPendingTome('home');   // canonicalize to #/home, not the stale '#/dungeon'
     return;                     // (if the effect structure allows; else gate the trailing clearPendingTome() so it isn't double-called)
   }
   // found branch keeps clearPendingTome();  (screenRef = the deep-linked screen — correct)
   ```
   Ensure `clearPendingTome` is called exactly once per effect run (move it into both branches, or keep the single trailing call but pass `'home'` from a captured variable in the not-found case). With `replaceState` now writing `#/home`, the queued `hashchange` reads `#/home` and `onHashChange` settles `screen='home'` — the reset holds.
3. Confirm the valid-tome path is untouched: `#/tome/<valid-id>/shop` still activates the tome and lands on `#/shop` (found branch, default `clearPendingTome()`).

**Verify (read-only, after editing):**
```bash
grep -n 'clearPendingTome' dungeon-scholar/src/App.jsx dungeon-scholar/src/router/useHashRoute.js
sed -n '100,106p' dungeon-scholar/src/router/useHashRoute.js
```

**Tests:** extend `useHashRoute.test.jsx` — assert `clearPendingTome('home')` rewrites the hash to `#/home` regardless of `screenRef`; assert `clearPendingTome()` (no arg) still canonicalizes off the current screen (valid-tome path unchanged). An App-level test (or the existing routing test harness) for the cold `#/tome/<bad-id>/dungeon` → `#/home` + toast is ideal if the harness supports it; otherwise document the manual check.

**Acceptance:** cold-loaded bad-id deep link to a gated screen → `#/home` + "not in thy library" toast; valid deep-link consumption unchanged; routing tests pass; lint/typecheck/build clean.

### 13B — One-shot reachability pre-probe before arming the Supabase refresh (F2)

**Objective:** on a load with a present (stale) session against an unreachable host, the app quarantines immediately (one `logWarn`, local-first) **without** triggering GoTrue's internal refresh-retry console burst; when the host *is* reachable, the existing `armRefresh` path is unchanged.

**Files:** `dungeon-scholar/src/hooks/useAuth.js` (`armRefresh` / the `getSession().then` branch); optionally `dungeon-scholar/src/services/supabase.js` (export a `probeSupabaseReachable()` helper + the URL); `dungeon-scholar/src/hooks/useAuth.circuitBreaker.test.jsx` (extend).

**Steps:**
1. Add a small, self-contained reachability helper (in `supabase.js`, next to the URL, so the env var stays co-located). It must (a) be a single request, (b) time out fast, (c) **never** itself log — wrap in `try/catch` so a failure is a boolean, not a console error:
   ```js
   // supabase.js
   export async function probeSupabaseReachable(timeoutMs = 3000) {
     if (!url) return false;
     const ctrl = new AbortController();
     const t = setTimeout(() => ctrl.abort(), timeoutMs);
     try {
       // no-cors: we only need reach/no-reach, not the body/status; an opaque
       // resolve === reachable, a throw (network/abort) === unreachable.
       await fetch(`${url}/auth/v1/health`, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
       return true;
     } catch {
       return false;            // swallowed — no console.error, unlike GoTrue's internal retries
     } finally {
       clearTimeout(t);
     }
   }
   ```
   (A single caught `fetch` produces at most one Network-tab entry and **zero** `console.error`, versus GoTrue's ~8-retry logging burst. If `/auth/v1/health` proves unreliable under `no-cors`, fall back to a HEAD on `url` root — record the choice.)
2. In `useAuth.js`, gate `armRefresh` behind the probe so we don't hand a known-down host to GoTrue. Inside the `getSession().then` branch, only when a `session` is present:
   ```js
   if (session) {
     const reachable = await probeSupabaseReachable();
     if (!active || quarantined) return;
     if (reachable) armRefresh();
     else quarantine();          // host down → one warn, local-first, no GoTrue retry burst
   } else { stopRefresh(); }
   ```
   Keep `armRefresh` and the `quarantine()` failure-ceiling exactly as today — they remain the backstop if the host is reachable at probe time but fails the real refresh. (Import `probeSupabaseReachable` alongside `isSupabaseConfigured`, `supabase`.)
3. Do not change `MAX_REFRESH_FAILURES` / `REFRESH_RETRY_MS` / the `onAuthStateChange` quarantine echo-guard — the breaker is verified working and stays as-is.

**Verify (read-only, after editing):**
```bash
grep -n 'probeSupabaseReachable' dungeon-scholar/src/hooks/useAuth.js dungeon-scholar/src/services/supabase.js
sed -n '110,124p' dungeon-scholar/src/hooks/useAuth.js     # getSession branch now probes before arming
```

**Tests:** extend `useAuth.circuitBreaker.test.jsx` — mock `probeSupabaseReachable` (or the underlying `fetch`) to reject/false with a present session → assert `supabase.auth.refreshSession` is **not** called and `quarantine` ran (user null, one `logWarn`, ticker stopped); mock it to resolve/true → assert the existing `armRefresh` behavior is unchanged (refresh attempted, breaker still trips after the ceiling on persistent failure). Assert a signed-out load still never probes (the `!session` path).

**Acceptance:** with a present session + unreachable host, no `refreshSession()` is issued and exactly one `logWarn` is emitted (no per-retry console burst); with a reachable host the prior arm/refresh/breaker behavior is intact; lint/typecheck/build clean.

## Research notes

- **F1** is purely a synchronous-vs-async ordering bug: `setScreen` mutates `location.hash` (async `hashchange`) while `clearPendingTome` `replaceState`s synchronously off a ref that hasn't advanced. The explicit-target fix removes the dependence on ref timing entirely; it is strictly smaller and safer than re-sequencing the effect. The null-active-tome worst case (08A's stated reason for existing) is *also* covered today by the downstream `COURSE_SET_GATED` guard (App.jsx, the second effect) — F1 restores 08A's documented surface behavior (home + toast) without relying on that fallback.
- **F2** deliberately does not touch the verified 08E breaker — it adds a cheaper, earlier exit for the common "host is simply down" case so the third-party client never gets the chance to log. The probe's own request is wrapped so it contributes no console noise; the breaker remains the correctness backstop for the (rarer) reachable-but-failing case. This is precisely the "small load-noise follow-up" PHASE-11's Out-of-scope note said to open if the storm persisted after PHASE-08 shipped live — which this run confirms it did (bounded, but present).
- Both are intentionally Low and surgical: F1 changes one callback signature + one call site; F2 adds one helper + one guarded `await`. Neither alters data, persistence, or the dark-theme/UI surface.

## Test plan

- **Unit (new/extended):** `useHashRoute.test.jsx` (F1: explicit-target canonicalize + default unchanged); `useAuth.circuitBreaker.test.jsx` (F2: probe-fail → no refresh + quarantine; probe-ok → existing behavior; signed-out → no probe).
- **Build/lint/type gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) clean (CI parity).
- **Manual spot check (executor):** cold-load `#/tome/does-not-exist-123/dungeon` → address bar `#/home`, Home rendered, "That tome is not in thy library" toast; valid `#/tome/<id>/shop` → tome active, `#/shop`. Signed-in against the (currently unreachable) host → at most one "cloud sync unreachable" warn in the console, no `Failed to fetch` burst; app fully usable local-first.

## Acceptance criteria

1. A cold-loaded bad-id deep link to a gated screen resets to `#/home` with the "not in thy library" toast; valid `#/tome/<id>/<screen>` deep-link consumption is unchanged; routing tests pass.
2. `clearPendingTome` accepts an explicit target screen and canonicalizes off it; the no-arg default preserves today's screenRef-based behavior.
3. On a load with a present session against an unreachable host, no `refreshSession()` is issued and the console shows one handled warn instead of a `Failed to fetch` retry burst; the PHASE-08E breaker is unchanged and remains the backstop for the reachable-but-failing case.
4. The reachability probe is a single, fast-timeout, fully-caught request that emits no `console.error` of its own.
5. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **PHASE-08E circuit breaker / PHASE-02 F1** — not reopened. Both are confirmed working live (the storm self-terminates); F2 only adds an earlier reachability exit on top. Do not change `MAX_REFRESH_FAILURES`, `REFRESH_RETRY_MS`, the quarantine, or `autoRefreshToken:false`.
- **Suppressing GoTrue's internal logging / patching `@supabase/gotrue-js`** — the report lists it as an alternative; rejected as higher-risk (vendoring/monkey-patching a bundled dep) versus the reachability pre-probe, which avoids triggering the logging in the first place.
- **Surfacing a user-visible "cloud sync offline" banner** — a UX addition beyond load-noise; if wanted, file separately. The one `logWarn` already covers the diagnostic need.
- **The 08A null-active-tome branch** (report "Could not fully verify") — already covered by the `COURSE_SET_GATED` guard (App.jsx second effect); 13A restores 08A's surface behavior for the valid-tome path and does not regress the null path. No separate work.
- **Light-theme / contrast work** (report §7) — PHASE-12. Not duplicated here.
