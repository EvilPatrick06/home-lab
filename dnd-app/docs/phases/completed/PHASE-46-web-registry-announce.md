# PHASE-46 — Web-build public-registry announce (null-deref → honest failure)

> Authored from the 2026-06-22 WEB-build QA report (Dungeon Table Online, v2.4.77). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Hosting a **Public** game from the web build connects the Cloud Relay fine but throws a JS null-deref ("Cannot read properties of null (reading 'ok')") and shows "PUBLIC — NOT LISTED (REGISTRY UNREACHABLE)" instead of either listing the game or failing gracefully. Root cause: the web shim's registry mutation methods resolve to **`null`** on any failure, but the renderer's announce path is typed/written to expect `{ ok: boolean; error? }` and does `if (result.ok)` / `setRegistryListed(result.ok)` on it — so a `null` result throws. This phase (1) makes the web shim honor the `{ ok }` contract (never return bare `null`), (2) hardens the renderer announce path against a null/invalid result so a failed announce becomes an honest "not listed — <reason>" instead of a crash, and (3) documents the auth-gate interaction that makes anonymous web hosts unable to announce under `BMO_API_KEY` hardening (a product/security decision to surface, not silently fix). PLANNING ONLY.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained: `dnd-app` renderer + the web shim; the Pi registry routes are read-only context here.
- **Cross-domain context:** the Pi side is `bmo/pi/app.py` registry routes (`/api/games` POST/PATCH/DELETE/heartbeat) — this phase does **not** change them, but cites their auth model.
- **Relationship to PHASE-44 (serving & deploy):** PHASE-44 F1 documents the `_PUBLIC_UNAUTH_PREFIXES` front-door exemption. `/api/games*` is **not** in that set, so under `BMO_API_KEY` hardening an anonymous browser cannot reach the announce route at all — see F3 below. Keep the two phases' auth reasoning consistent.
- **Test precedent:** `dnd-app/src/renderer/src/network/host-announce.test.ts` already tests result propagation; `LobbyPage.test.tsx` mocks `startHostAnnounce` returning `{ ok: true }`. Extend these for the null/failure cases.

## Verified findings

All verification was against the live tree (worktree `auto/phase-maker`).

### F1 (High) — Public web host throws "Cannot read properties of null (reading 'ok')"

**Status: confirmed; root cause confirmed in source. The QA report attributed the throw to `LobbyPage.tsx:266`; the actual throw originates one layer down in `host-announce.ts` (the `null` comes from the web shim) and surfaces via LobbyPage's `.catch`.** Trace:

1. **The web shim returns `null` on announce failure.** `src/web/web-api.ts:472-484`:
   ```ts
   registry: {
     announce: (payload, _b) => bmoFetchJson('/api/games', { method: 'POST', body: JSON.stringify(payload) }).catch(() => null),
     update:    (code, patch, _b) => bmoFetchJson(`/api/games/${code}`, { method: 'PATCH', … }).catch(() => null),
     heartbeat: (code, _b) => bmoFetchJson(`/api/games/${code}/heartbeat`, { method: 'POST' }).catch(() => null),
     deregister:(code, _b) => bmoFetchJson(`/api/games/${code}`, { method: 'DELETE' }).catch(() => null),
     list:      (clientId, _b) => bmoFetchJson(`/api/games…`).catch(() => ({ games: [] })),
     …
   }
   ```
   `bmoFetchJson` throws on a non-2xx (`if (!res.ok) throw new Error('BMO … → <status>')`, web-api.ts:29-33), so any failed announce (4xx/5xx/network) lands in `.catch(() => null)` and **resolves to `null`** — not a rejection.

2. **`announceGame` passes that null straight through.** `src/renderer/src/network/registry-client.ts:155-162` — `announceGame(...)` returns `window.api.registry.announce(payload, …)` typed `Promise<{ ok: boolean; error? }>`. In the web build the runtime value is `null`.

3. **`startHostAnnounce` does `if (result.ok)` on the null.** `src/renderer/src/network/host-announce.ts:60-72`:
   ```ts
   const result = await announceGame(payload).catch((err) => ({ ok: false, error: … }))
   if (result.ok) { stopHeartbeat = startHeartbeat(payload.invite_code) }
   else { announceResult = { ok: false, error: result.error } }
   ```
   The `.catch` only fires on a *rejection*; the shim **resolved** with `null`, so `result === null` and `if (result.ok)` throws `TypeError: Cannot read properties of null (reading 'ok')`. The async function rejects with that TypeError.

4. **LobbyPage surfaces it as the error banner.** `src/renderer/src/pages/LobbyPage.tsx` announce effect: `startHostAnnounce({...}).then((result) => { … setRegistryListed(result.ok) … }).catch((err) => { … setRegistryListed(false); setRegistryAnnounceError(err.message) })`. The rejected TypeError hits the `.catch`, so the lobby shows "PUBLIC — NOT LISTED (REGISTRY UNREACHABLE)" + the message *"Cannot read properties of null (reading 'ok')"* — exactly the QA banner.

So the user-visible defect (the ugly null-deref string) is produced by the web shim returning `null` instead of an `{ ok:false, error }` object. Verification:

```bash
sed -n '29,33p;470,495p' dnd-app/src/web/web-api.ts
sed -n '155,165p' dnd-app/src/renderer/src/network/registry-client.ts
sed -n '40,80p' dnd-app/src/renderer/src/network/host-announce.ts
grep -n "setRegistryListed\|startHostAnnounce\|registryAnnounceError" dnd-app/src/renderer/src/pages/LobbyPage.tsx
```

### F2 (context) — why the announce POST fails in the web build

**Status: confirmed via the Pi route.** `GET /api/games` is anonymous and returns `200 {"games":[]}` same-origin (QA confirmed; route `bmo/pi/app.py:2683`). The mutation route `POST /api/games` (app.py:2690-2706) calls `_registry_authorized()` (app.py:2658-2667):

```python
def _registry_authorized() -> bool:
    if _bmo_client_is_trusted_localhost(): return True
    if not BMO_REGISTRY_API_KEY: return _bmo_bearer_authorized()
    presented = request.headers.get("X-Registry-Key", "").strip()
    return presented == BMO_REGISTRY_API_KEY
```

For a tunnelled anonymous browser (`_bmo_client_is_trusted_localhost()` is False — forwarding headers present): with no `BMO_API_KEY` set, `_bmo_bearer_authorized()` returns True → POST is authorized (announce should succeed). With `BMO_API_KEY` set, two layers reject it — the front-door gate 401s `/api/games` (it is **not** in `_PUBLIC_UNAUTH_PREFIXES`, PHASE-44 F1), and `_bmo_bearer_authorized()` would also fail (no Bearer). The QA hosted while `BMO_API_KEY` was being toggled that session (the Critical), so the announce POST 401'd → shim `.catch(() => null)` → the null-deref. **Regardless of the auth timing, the latent defect is that ANY announce failure (4xx/5xx/network) becomes a null-deref** — that is the in-scope fix (F1). The auth-gate question is F3.

### F3 (info / product decision) — anonymous web hosts cannot announce under `BMO_API_KEY` hardening

**Status: observation; flag for a human decision (do not silently widen the gate).** Because `/api/games*` is not in the public-unauth exemption set, enabling `BMO_API_KEY` makes the public registry announce/heartbeat/deregister unreachable for anonymous browser hosts (the read-only `GET /api/games` is also gated then, except the SSE stream's `?api_key=` path). So under hardening, a Public web-hosted game legitimately cannot be listed. Options for the owner: (a) accept it — Public web hosting requires an unhardened deployment, and the UI must fail gracefully (F1 makes it honest); (b) if Public web hosting should work under hardening, add a narrowly-scoped exemption / a host credential for the registry mutation routes. This is a security/product call (PHASE-43 / INSTRUCTIONS rule 9 case (b)) — surface it, don't decide it here. The graceful-failure fix (F1) is correct under either choice.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + `npx vitest run src/renderer/src/network/host-announce.test.ts` and `…/pages/LobbyPage.test.tsx`. CI runs the full gate on push.

### 46A — Web shim registry methods honor the `{ ok }` contract (root-cause fix)

**Objective:** the web shim never returns bare `null` from a registry mutation; a failure is a typed `{ ok:false, error }` (and `list` keeps its `{ games: [] }` fallback).

**Files:** `dnd-app/src/web/web-api.ts`.

**Steps:**

1. Change `registry.announce` / `update` / `heartbeat` / `deregister` `.catch(() => null)` to `.catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))`, matching the desktop IPC contract (`{ ok: boolean; error? }`). For `announce`, also normalize the success shape: the Pi returns `{ ok: true, game: <code> }` (201) — ensure the resolved value has `ok: true` (map if the raw body differs).
2. Keep `list`'s `.catch(() => ({ games: [] }))` (its contract is `{ games }`, consumed by `registry-client.listGames` which checks `result.ok` — verify and align: `listGames` does `if (!result.ok) throw` at registry-client.ts:194, so `list` must also return `{ ok, games }` or `listGames` must tolerate the `{ games }` shape; reconcile so a web list never throws).
3. Confirm the `subscribe`/`unsubscribe` stubs already return `ok` (they do — web-api.ts) and need no change.

**Acceptance:** `tsc -p tsconfig.web.json` clean; a forced announce failure in the web shim resolves to `{ ok:false, error }` (not null); `listGames()` in the web build never throws.

### 46B — Harden the renderer announce path against a null/invalid result (defence in depth)

**Objective:** even if a transport ever yields a null/garbage result, the lobby shows an honest "not listed — <reason>", never a thrown null-deref.

**Files:** `dnd-app/src/renderer/src/network/host-announce.ts`, `dnd-app/src/renderer/src/pages/LobbyPage.tsx`, plus `host-announce.test.ts` / `LobbyPage.test.tsx`.

**Steps:**

1. In `startHostAnnounce` (host-announce.ts:60-72), coerce the announce result defensively: treat a non-object / missing-`ok` result as `{ ok: false, error: 'registry unreachable' }` before the `if (result.ok)` check (e.g. `const r = result && typeof result === 'object' && 'ok' in result ? result : { ok: false, error: 'registry unreachable' }`). Same guard for `updateGame`/`heartbeatGame` consumers if they read `.ok`.
2. In LobbyPage's announce effect, guard `setRegistryListed(result?.ok ?? false)` and set a clean `registryAnnounceError` (not a raw TypeError string) when announce fails. The existing `.catch` stays as a backstop.
3. Tests: `startHostAnnounce` resolves to `{ ok:false, error }` (never throws) when `announceGame` resolves `null` or `undefined`; LobbyPage renders the "not listed" banner with a human-readable reason, not "Cannot read properties of null".

**Acceptance:** vitest green; simulated null announce → honest "not listed" state, no thrown null-deref; private games still report `ok:true`; LAN publish path unaffected.

### 46C — Document the hardening/announce interaction (F3)

**Objective:** the auth-gate decision is recorded for the owner, not silently changed.

**Files:** a short note in this plan's Completed section + (if the owner wants Public web hosting under hardening) a follow-up logged per `docs/LOG-INSTRUCTIONS.md` (`docs/BMO-SUGGESTIONS-LOG.md` / `docs/SUGGESTIONS-LOG-DNDAPP.md`). **No app/Pi code change in this phase** — this is the rule-9 case (b) decision surface.

**Steps:**

1. Record F3 (anonymous web hosts cannot announce under `BMO_API_KEY`) with the exact route/gate citations.
2. If/when the owner decides Public web hosting should work under hardening, scope the exemption/credential as a separate phase (cross-refs PHASE-44 F1's exemption-set lockstep + PHASE-43 hardening triage).

**Acceptance:** the decision and its two options are written down with citations; no behaviour changed here.

## Completed

- 46A — DONE (2026-06-23) (`src/web/web-api.ts`) — registry `announce`/`update`/`heartbeat`/`deregister` now `.catch((e) => ({ ok:false, error }))` instead of `.catch(() => null)`, matching the desktop `{ ok }` contract (the Pi already returns `{ ok:true, … }` on success, so success passes through). `list` now wraps the Pi's bare `{ games }` into `{ ok:true, games }` (and degrades to `{ ok:true, games: [] }` on failure) so `registry-client.listGames`'s `if (!result.ok) throw` never fires in the web build. Also fixed the list query param `clientId` → `client_id` (the Pi reads `client_id`) as part of the same reconciliation.
- 46B — DONE (2026-06-23) (`src/renderer/src/network/host-announce.ts`, `src/renderer/src/pages/LobbyPage.tsx`, `host-announce.test.ts`) — `startHostAnnounce` coerces any non-`{ ok }` announce result (null/undefined/garbage) into `{ ok:false, error:'registry unreachable' }` BEFORE the `if (result.ok)` check, so the old null-deref ("Cannot read properties of null (reading 'ok')") can't recur. LobbyPage guards `setRegistryListed(!!result?.ok)` + a clean `registryAnnounceError` ("registry unreachable") instead of a raw TypeError. New tests: announce result of `null`/`undefined` → honest failure, never throws.
- 46B tests — `src/web/web-registry.test.ts` (new, 4 cases) — proves the shim never returns null: announce → `{ ok:false, error }` on a 401, passes through `{ ok:true }` on 201, `list` → `{ ok:true, games }` on success and `{ ok:true, games: [] }` on 500, heartbeat/deregister → `{ ok:false }` on 404.
- 46C — DONE (2026-06-23) (doc-only; F3 logged to `docs/SUGGESTIONS-LOG-DNDAPP.md`) — recorded the `BMO_API_KEY`-hardening ↔ anonymous-web-announce interaction with exact route/gate citations and the two owner options (accept / scope an exemption). NO app/Pi code change — this is the rule-9 case (b) decision surface; the F1 graceful-failure fix is correct under either choice.

_Implemented 2026-06-23 from WEB-QA-report-2026-06-22._
