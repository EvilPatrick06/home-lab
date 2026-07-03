# PHASE-60 — Web-build Campaign Version History: window.api parity (dead restore UI)

> Authored from the 2026-06-29 WEB-build QA report (Dungeon Table Online, v2.7.0). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Fix the one **Medium** finding the 2026-06-29 v2.7.0 WEB pass established: the new v2.7.0 **Campaign Version History** restore panel is **non-functional on the web build** because the web `window.api` shim never implements `listCampaignVersions` / `restoreCampaignVersion`. The panel is rendered unconditionally on the Campaign Detail page, so on web it presents a permanently-failing affordance: opening it throws `TypeError: window.api.listCampaignVersions is not a function` (caught → "failed to load versions" toast, empty list), and Restore throws the same way (→ "restore failed" toast). This is a **web/Electron `window.api` parity gap** — the methods exist only in the Electron preload bridge + main IPC, and were not mirrored into the web shim when the feature (commit 451a9fd1) landed. Desktop is unaffected.

## Dependencies & cross-phase notes

- **No prerequisites.** This is a self-contained web-shim parity fix in `src/web/web-api.ts` (optionally `CampaignDetailPage.tsx` for the gate option). It may be freely reordered relative to the other 2026-06-29 v2.7.0 phases (61, 62).
- **Same finding class as the PHASE-45/46/47 web-portability sweep** (web `window.api` shim returning wrong/absent values for not-yet-bridged channels), but a *different* channel pair. PHASE-46 fixed the `registry.*` `{ok}`-contract violation; PHASE-47 fixed `saveEntity` returning the entity instead of `{success:true}`. This phase is the **campaign-version channel pair** — independent of those at the code level, same root pattern (the web shim under-implements a channel the renderer assumes exists).
- **The sibling character-version methods are already stubbed but with the WRONG envelope shape — note for the implementer.** `web-api.ts:226-227` defines `listCharacterVersions: () => Promise.resolve([])` and `restoreCharacterVersion: () => Promise.resolve(null)` — bare values, NOT the `{ success, data }` `StorageResult` envelope the call sites destructure. `CharacterSheet5ePage.tsx:278` does `if (result.success && result.data)`: against a bare `[]`, `[].success` is `undefined` → falsy → the character list silently shows "no versions" (degrades gracefully, no throw). `restoreCharacterVersion`'s bare `null` is worse: `null.success` would *throw* (caught → restore-failed toast). So the existing character stubs "work" only by accident on the read path. **Do not blind-copy their shape for the campaign methods** — return the proper `{ success, data }` envelope (see Fix direction) so the campaign panel degrades cleanly, and consider correcting the two character stubs in the same pass (optional, recorded under 60B).
- **There is no web-side version store to back a "real" implementation today.** Web `saveCampaign` routes to `saveEntity('campaigns', …)` (`web-api.ts:230`) → a single IndexedDB `put`; it writes **no** `.versions/` snapshots (the desktop `.versions/` backups come from `src/main/storage/campaign-storage.ts`, which the web build does not run). So an IndexedDB-backed version history would require *first* building web autosave/version snapshots — out of scope here. This phase's job is to stop the panel from being a dead, throwing affordance; the two viable low-touch fixes are (a) gate it off on web, or (b) graceful envelope stubs (empty history) mirroring the character path. Prefer (a).
- **i18n:** no new strings required (the existing `pages.campaignDetailPage.versionHistory.*` keys already exist for both locales). If the gate option (60A) hides the button on web, no key changes at all.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.7.0 / commit `2f9caeaf`).

### WEB-API-1 (medium) — Campaign Version History list + restore throw on web; web `window.api` shim missing `listCampaignVersions` / `restoreCampaignVersion`

**Status: confirmed in source — both methods are absent from the web shim; the renderer assumes they exist and calls them unconditionally.**

v2.7.0 adds a Campaign Version History panel rendered **unconditionally** from the Campaign Detail page:

- `src/renderer/src/pages/CampaignDetailPage.tsx:19` imports `CampaignVersionHistory`; `:331` renders `<CampaignVersionHistory campaignId={campaign.id} />` with **no `isWebBuild()` guard**.
- `src/renderer/src/pages/campaign-detail/CampaignVersionHistory.tsx:37` calls `await window.api.listCampaignVersions(campaignId)` and `:38` checks `if (result.success && result.data) setVersions(result.data)` — i.e. it expects the `{ success, data }` `StorageResult` envelope. `:49` calls `await window.api.restoreCampaignVersion(campaignId, fileName)` and `:50` checks `if (result.success && result.data)`. Both are wrapped in `try/catch`: the list catch (`:39-40`) raises `addToast(k('toastLoadFailed'), 'error')`; the restore catch (`:57-58`) and the else-branch (`:54-55`) raise `toastRestoreFailed`.

These two methods exist **only** in the Electron path:

- Preload bridge: `src/preload/index.ts:40` `listCampaignVersions: (id) => ipcRenderer.invoke(IPC_CHANNELS.CAMPAIGN_VERSIONS, id)`, `:41` `restoreCampaignVersion`. Channels `CAMPAIGN_VERSIONS` / `CAMPAIGN_RESTORE_VERSION` are `src/shared/ipc-channels.ts:239-240`; backed by `src/main/storage/campaign-storage.ts:172` (`listCampaignVersions` returns `StorageResult<CampaignVersion[]>` = `{ success, data }`).

The **web** shim `src/web/web-api.ts` (installed by `src/web/install-web-api.ts` as `globalThis.api = createWebApi()`) does **not** define either method. Verified two ways: (1) grep of `web-api.ts` for both names returns only the *character* equivalents at `:226-227` and nothing for campaign; (2) the "Campaign storage" block (`web-api.ts:229-237`: `saveCampaign`/`loadCampaigns`/`loadCampaign`/`deleteCampaign`) has no version methods. Because the shim is assigned through an `unknown`-typed view of `globalThis` (`install-web-api.ts`), the missing methods are **not** caught by the renderer's `Window["api"]` type — they simply resolve to `undefined` at runtime, and there is no catch-all/Proxy in `web-api.ts`.

**Reproduction:**
1. Open the web build (`https://bmo.mybmoai.work/DungeonTableOnline/`), open or create a campaign, go to the Campaign Detail page.
2. Click the "Version History" button (always shown).
3. Observed (by code path): `window.api.listCampaignVersions` is `undefined` → calling it throws `TypeError: window.api.listCampaignVersions is not a function` → caught at `:39` → toast `toastLoadFailed` ("failed to load versions"), empty history. Restore throws the same way → caught at `:57` → `toastRestoreFailed`.

**Expected:** On web the Version History panel either functions (web shim implements list/restore) or is hidden behind `isWebBuild()` so a permanently-failing affordance is not shown.

**Root cause (file:line):** web/Electron `window.api` parity gap. The campaign-version methods were added to the Electron preload (`src/preload/index.ts:40-41`) + main IPC (`src/main/storage/campaign-storage.ts:172`, channels `src/shared/ipc-channels.ts:239-240`) by commit 451a9fd1, but **not** to `src/web/web-api.ts`. The call sites (`CampaignVersionHistory.tsx:37,49`) are ungated and assume the methods exist; the render is ungated (`CampaignDetailPage.tsx:331`). The character-version methods were stubbed earlier (`web-api.ts:226-227`); the campaign ones were missed.

Verification:

```bash
cd dnd-app
grep -n 'listCampaignVersions\|restoreCampaignVersion' src/web/web-api.ts        # NONE (only character at :226-227)
grep -n 'listCampaignVersions\|restoreCampaignVersion' src/preload/index.ts      # :40-41 (Electron only)
sed -n '33,60p' src/renderer/src/pages/campaign-detail/CampaignVersionHistory.tsx # {success,data} envelope expected
grep -n 'CampaignVersionHistory\|isWebBuild' src/renderer/src/pages/CampaignDetailPage.tsx # :19,:331 (ungated)
sed -n '224,238p' src/web/web-api.ts                                             # character stubs + Campaign storage block (no versions)
```

**Fix direction (pick ONE; (A) is the recommended default):**

- **(A) Gate the affordance off on web (recommended — no dead button).** Wrap the render at `CampaignDetailPage.tsx:331` in `!isWebBuild()` (import `isWebBuild` from `utils/platform.ts`, already used elsewhere in the renderer). The Version History panel simply does not appear on the web build until web-side versioning exists. Smallest change; no throwing affordance; no i18n churn. This matches the established web-portability pattern (PHASE-45 gated desktop-only affordances behind `isWebBuild()`).
- **(B) Graceful envelope stubs (keep the button, empty history).** Add to `createWebApi()` (in the "Campaign storage" block):
  - `listCampaignVersions: (_id: string) => Promise.resolve({ success: true, data: [] as unknown[] })`
  - `restoreCampaignVersion: (_id: string, _fileName: string) => Promise.resolve({ success: false })`
  Return the `{ success, data }` envelope the call sites destructure (NOT the bare `[]`/`null` shape the character stubs mistakenly use), so list shows an empty "no versions" state and restore fails cleanly (it has nothing to restore on web). Use this only if product wants the panel visible on web as a placeholder.
- **(C) Real IndexedDB-backed implementation (largest; out of scope unless web versioning is wanted now).** Requires first writing web-side version snapshots on `saveCampaign` (there are none today). Defer to a dedicated feature phase; not warranted to clear this Medium.

**Affected components:** `src/web/web-api.ts` (the missing methods), and/or `src/renderer/src/pages/CampaignDetailPage.tsx:331` (the gate), `src/renderer/src/utils/platform.ts` (existing `isWebBuild`). Reference only: `src/renderer/src/pages/campaign-detail/CampaignVersionHistory.tsx`, `src/preload/index.ts:40-41`, `src/main/storage/campaign-storage.ts`.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` (the web shim + renderer are web-target) and `npx tsc --noEmit -p tsconfig.node.json` if `web-api.ts` types touch shared decls; plus the affected vitest file if one exists for the web shim. CI runs the authoritative full gate on push. The effect is implementer-verified on the deployed web build (`https://bmo.mybmoai.work/DungeonTableOnline/`): open a campaign → Version History → confirm no `TypeError` toast.

### 60A — Resolve the dead Campaign Version History affordance on web (WEB-API-1)

**Objective:** the Campaign Version History panel no longer throws on the web build.

**Files:** `src/renderer/src/pages/CampaignDetailPage.tsx` (gate option A) **or** `src/web/web-api.ts` (stub option B); `src/renderer/src/utils/platform.ts` (existing `isWebBuild`, gate option).

**Steps:**

1. Choose the fix per "Fix direction" — **default (A):** import `isWebBuild` into `CampaignDetailPage.tsx` and render `{!isWebBuild() && <CampaignVersionHistory campaignId={campaign.id} />}` at `:331`. **Alternative (B):** add the two envelope-returning stubs to the "Campaign storage" block of `createWebApi()` in `web-api.ts`.
2. Leave the Electron path untouched (desktop continues to use the real preload/main implementation).

**Acceptance:** `tsc -p tsconfig.web.json` clean; on the deployed web build, opening a campaign's Version History shows either nothing (A) or an empty "no versions" panel with no error toast (B); desktop Version History still lists + restores. Implementer-verified live (no `window.api.listCampaignVersions is not a function` in the console).

### 60B — (optional) Correct the character-version stub envelope shape

**Objective:** bring the existing character-version web stubs onto the same `{ success, data }` envelope the call sites expect, removing the latent `null.success` throw on web restore.

**Files:** `src/web/web-api.ts:226-227`.

**Steps:**

1. Change `listCharacterVersions` to `() => Promise.resolve({ success: true, data: [] as unknown[] })` and `restoreCharacterVersion` to `(_id, _fileName) => Promise.resolve({ success: false })`, matching `CharacterSheet5ePage.tsx:278,511`.

**Acceptance:** `tsc -p tsconfig.web.json` clean; on web, the character Version History panel shows an empty state and Restore fails cleanly with no uncaught/caught-`TypeError`. Desktop unchanged. (Skip this sub-phase if the implementer prefers to keep 60 minimal; it is a latent-only, non-reproduced cleanup.)

## Completed

> _Implemented 2026-07-03 on branch `auto/dnd-phases-5862`._
>
> - **60A (option A)** — gated the render: `CampaignDetailPage.tsx` now imports `isWebBuild`
>   from `utils/platform.ts` and renders `{!isWebBuild() && <CampaignVersionHistory .../>}`
>   (was ungated). The panel no longer appears on web, so there is no permanently-failing
>   affordance. Desktop still renders + uses the real Electron preload/main implementation.
> - **60A (option B, belt-and-suspenders) + 60B** — also added envelope-returning stubs to
>   `createWebApi()` in `src/web/web-api.ts`: `listCampaignVersions`/`restoreCampaignVersion`
>   now exist (return `{ success: true, data: [] }` / `{ success: false }`), and the pre-existing
>   character-version stubs (`listCharacterVersions`/`restoreCharacterVersion`) were corrected
>   from the bare `[]`/`null` shape to the same `{ success, data }` envelope the call sites
>   destructure — removing the latent `null.success` throw on web character restore. So even if
>   any code reaches these methods, it gets a clean empty-history / restore-unavailable result
>   instead of `TypeError: window.api.listCampaignVersions is not a function`.
> - Verified via gate: `tsc -p tsconfig.web.json` clean, `tsc -p tsconfig.node.json` clean,
>   biome clean, `CampaignVersionHistory` vitest green (mocks window.api; unaffected). Live web
>   (open campaign → no error toast) verification left for QA.
