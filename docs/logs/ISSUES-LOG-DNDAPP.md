# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dnd-app issues
> below as they appear.

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

### [2026-07-02] `BOOK_SAVE_BYTES` / `saveBookBytes` never validates the peer-supplied `bookId` — path-traversal write primitive that every sibling storage handler already guards against

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — reviewing the custom-book sync path added in `ce917e30` (2026-06-28)

**Description:**
The `BOOK_SAVE_BYTES` IPC handler (`src/main/ipc/storage-handlers.ts` ~L476) passes `bookId` straight into `saveBookBytes(bookId, title, ext, bytes)` with no validation, and `saveBookBytes` (`src/main/storage/book-storage.ts` L122) interpolates it directly into a filesystem path: `const destPath = join(booksDir, `${bookId}${cleanExt}`)`, then `atomicWriteFile(destPath, Buffer.from(bytes))`. `bookId` is **not** a locally-chosen UUID here — on the sync pull path it is the entity `id` taken from a remote peer's manifest (`src/renderer/src/services/sync/domains.ts` L539 `putEntity` → `window.api.books.saveBytes(e.id, …)`), so its value is attacker-influenced in a multiplayer session. A `bookId` such as `../../<something>` escapes `booksDir` and writes attacker-supplied bytes to an arbitrary location (constrained to a `.pdf` extension, since `saveBookBytes` rejects non-`.pdf` `ext`). Every comparable handler already guards this exact shape: `CAMPAIGN_RESTORE_VERSION` and `CHARACTER_RESTORE_VERSION` reject `/`, `\`, `..`, `\0` and require the extension; `BOOK_IMPORT` and `BOOK_READ_FILE` reject `..`/`\0`; character/campaign storage additionally `isValidUUID(id)` before building any path. The book id-keyed handlers (`BOOK_SAVE_BYTES`, and pre-existing `BOOK_SAVE_DATA`/`BOOK_LOAD_DATA` via `getBookDataPath`) are the outlier with no guard at all. `BOOK_SAVE_BYTES` is the newest and highest-risk of these because it (a) arrived with the 2026-06-28 sync feature, (b) takes its id from a network peer, and (c) writes raw bytes.

**Reproduction (if bug):**
1. In a synced/multiplayer session, have a peer advertise a `book-files` entity whose `id` is `../../evil` (type `custom`, any bytes).
2. The local pull calls `window.api.books.saveBytes('../../evil', title, '.pdf', bytes)` → `BOOK_SAVE_BYTES` → `saveBookBytes`.
3. Observed: `join(booksDir, '../../evil.pdf')` resolves outside `booksDir`; `atomicWriteFile` writes the peer's bytes there. No validation error is raised (contrast `CAMPAIGN_RESTORE_VERSION`, which throws `Invalid version file name` on `..`).

**Expected behavior (if bug):** `BOOK_SAVE_BYTES` (and ideally the whole book id-keyed family) validates `bookId` before it reaches a path join — reject `/`, `\`, `..`, `\0` (and preferably require `isValidUUID(bookId)`, matching character/campaign storage), throwing on a bad id exactly as the restore handlers do.

**Hypothesis / root cause:** `saveBookBytes` was added with the custom-book sync feature (`ce917e30`) modeled on `importBook`, but unlike the security-hardened restore/import handlers it never picked up the path-traversal guard. Book storage historically assumed `bookId` was a locally-generated UUID; the sync feature made it remote-supplied without adding the corresponding input validation. No unit test covers `saveBookBytes` (no `book-storage` test references it), so the gap went unnoticed.

**Proposed fix / improvement:**
- [ ] In `saveBookBytes` (and the `BOOK_SAVE_BYTES` handler), reject `bookId` containing `/`, `\`, `..`, or `\0` before any path join; prefer `isValidUUID(bookId)` to match `campaign-storage`/`character-storage`.
- [ ] Apply the same guard to the other id-keyed book paths (`getBookDataPath` → `BOOK_SAVE_DATA`/`BOOK_LOAD_DATA`) so the family is uniform.
- [ ] Add a `book-storage` unit test asserting a traversal `bookId` is rejected and a valid UUID writes inside `booksDir` (mirrors the restore-handler tests).

**Blocked by:** none. (LOG-ONLY scan — app code not modified.)

**Related files:** `dnd-app/src/main/storage/book-storage.ts` (saveBookBytes ~L122, getBookDataPath L47), `dnd-app/src/main/ipc/storage-handlers.ts` (BOOK_SAVE_BYTES ~L476), `dnd-app/src/renderer/src/services/sync/domains.ts` (book-files putEntity ~L539), `dnd-app/src/preload/index.ts` (books.saveBytes ~L654)

**Related entries:** ISSUES-LOG-DNDAPP [2026-06-29] "chunk-id NUL drift + credential at-rest/leak hardening" (same recent security-hardening pass that guarded the *restore* handlers but not the book-save family)

### [2026-06-29] dnd-app/mobile Dependabot npm-deps bump fails `npm ci` — package-lock.json out of sync with package.json

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Code (ci-failure-triage)
- **During:** hourly CI-failure triage — caught NEW failed runs 28361279932 + 28361282816

**Description:**
The grouped Dependabot branch `dependabot/npm_and_yarn/dnd-app/mobile/npm-deps-ac88f8a546` (HEAD `b6ef2973`) fails the **dnd-app mobile CI** workflow at the `setup-node-project` step. `npm ci` aborts because the committed `dnd-app/mobile/package-lock.json` does not match the bumped `package.json`: npm reports dozens of `Missing: ... from lock file` packages, e.g. `typescript@5.9.3`, `react-native-worklets@0.8.3`, and the `@babel/*@7.29.7` toolchain (`@babel/core`, `@babel/preset-typescript`, `@babel/helper-compilation-targets`, transform plugins, etc.). `npm ci` requires the lockfile and manifest to be perfectly in sync and will not write the lockfile, so it exits 1.

**Reproduction (if bug):**
1. Check out `dependabot/npm_and_yarn/dnd-app/mobile/npm-deps-ac88f8a546` (commit `b6ef2973`).
2. `cd dnd-app/mobile && npm ci`.
3. Observed: `npm error Missing: typescript@5.9.3 from lock file` (+ many more) → exit code 1; CI red on both run 28361279932 and 28361282816.

**Expected behavior (if bug):** Dependabot's group bump should update `package-lock.json` alongside `package.json` so `npm ci` installs cleanly and CI passes.

**Hypothesis / root cause:** Dependabot regenerated `dnd-app/mobile/package.json` for the grouped `npm-deps` update but the committed lockfile was not fully regenerated for the new transitive tree (the new `@babel/*@7.29.7` + `typescript@5.9.3` + `react-native-worklets@0.8.3` resolutions are absent from `package-lock.json`). Not a build/breaking-change failure — purely a lockfile-sync mismatch. Confined to the Dependabot branch; master is unaffected.

**Proposed fix / improvement:**
- [ ] `cd dnd-app/mobile && npm install` (NOT `npm ci`) on the Dependabot branch to regenerate `package-lock.json`, then commit the lockfile to the branch — or close the PR and let Dependabot recreate it with a synced lock.
- [ ] Confirm none of the grouped bumps (`typescript@5.9.3`, `react-native-worklets@0.8.3`, `@babel/*@7.29.7`) are major/breaking before merge; if a major bump is in the group, that part is a human decision (per AUTOMATED-AGENT-GIT-WORKFLOW Rule 3B).
- [ ] Re-run dnd-app mobile CI; merge via the integrator once green.

**Blocked by:** Owned by the integrator's Dependabot-PR review path (AUTOMATED-AGENT-GIT-WORKFLOW Rule 3B). ci-failure-triage did not commit to the Dependabot branch (not its branch; Dependabot may rebase/force-push it).

**Related files:** `dnd-app/mobile/package-lock.json`, `dnd-app/mobile/package.json`, `.github/actions/setup-node-project`

**Related entries:** CI runs https://github.com/EvilPatrick06/home-lab/actions/runs/28361279932 , https://github.com/EvilPatrick06/home-lab/actions/runs/28361282816

**Integrator review [2026-06-29, integrator]:** Reviewed under Rule 3B. Lockfile is *not* the real blocker — `cd dnd-app/mobile && npm install` regenerates `package-lock.json` cleanly (1210 pkgs, exit 0) and biome lint passes. After the regen, `tsc --noEmit` fails with **one** breaking error: `app.config.ts(27,3): error TS2353: 'splash' does not exist in type 'ExpoConfig'`. This grouped bump is a **full Expo SDK major upgrade** — `expo ~56.0.12`, `@expo/config-types ^56.0.6`, plus `typescript ~6.0.3` and `@babel/core ^8.0.1` (all majors). The `splash` failure is a real Expo-config migration (top-level `splash` was removed from `ExpoConfig`; it now lives under the `expo-splash-screen` config plugin). **Disposition: held for manual review** (major/breaking SDK upgrade = human decision, not a mechanical fix-forward). Branch left in place; not merged, not deleted. To adopt: regenerate the lockfile, migrate `app.config.ts` `splash` → `expo-splash-screen` plugin config, then re-run dnd-app mobile CI. Surfaced to Gavin via the board this run.

*(none currently logged)*

## Low

*(none currently logged)*
