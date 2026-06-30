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

### [2026-06-29] RAG chunk IDs diverge between TS and Python engines — chunk-builder.ts joins with NUL, not the documented space

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — static review of `src/main/ai/context`

**Description:**
`stableChunkId()` in `dnd-app/src/main/ai/context/chunk-builder.ts` must produce content-stable chunk IDs that match its Python twin `bmo/pi/services/rag_search.py` byte-for-byte. The file's own comment states the contract: "The Python twin (rag_search.py) uses the SAME recipe — space-joined, NOT NUL-joined; change both engines or neither," documenting `sha256([source, ...headingPath, content].join(SPACE))`. The actual code instead joins with a literal NUL byte: the source file contains a raw `0x00` character where a single space should be (`.update([source, ...headingPath, content].join(<NUL>))`). The Python twin (`rag_search.py:172`) does `hashlib.sha256(" ".join([source, *heading_path, content])...)` and its docstring says it "Mirrors dnd-app chunk-builder.ts stableChunkId EXACTLY." Because `"a<SPACE>b"` and `"a<NUL>b"` hash to different digests, the two engines compute **different** IDs for the same chunk content, silently violating the cross-engine invariant. This defeats PHASE-24 24A (content-stable chunk IDs) and PHASE-07 `contextChunkIds` provenance whenever a chunk crosses the Electron(TS) <-> Pi(Python) boundary: chunk-id provenance, de-dup, and cross-engine lookups will not match.

Secondary effect: the embedded NUL makes the `.ts` file register as **binary** to git/grep/diff (`grep` reports "binary file matches", diffs render unreadably), which hampers tooling and review.

**Reproduction (if bug):**
1. TS: `stableChunkId("doc", ["H1"], "body")` hashes the string `doc<NUL>H1<NUL>body`.
2. Py: `stable_chunk_id("doc", ["H1"], "body")` hashes the string `doc<SPACE>H1<SPACE>body`.
3. Observed: the two 16-hex prefixes differ -> different chunk IDs for identical content.

**Expected behavior (if bug):** Both engines join the parts with a single space (the documented recipe) and produce identical IDs.

**Hypothesis / root cause:** A literal NUL character was substituted for the space delimiter in `chunk-builder.ts` (present as of commit `2c306a13`, 2026-06-28, the `src/main/ai` subfolder regroup). The comment and the Python twin were left unchanged, so only the TS engine drifted off the agreed recipe.

**Proposed fix / improvement:**
- [ ] In `chunk-builder.ts`, change the join delimiter from the literal NUL back to a single space, removing the `0x00` byte and realigning with the comment + Python twin.
- [ ] Add a cross-engine fixture test asserting `stableChunkId` equals a known `stable_chunk_id` digest for the same input, so the two engines cannot silently drift again.
- [ ] Changing the delimiter changes every generated ID — verify whether persisted v2 indexes need a rebuild/migration. `applyStableIds` recomputes ids on load, so it is likely self-healing, but confirm.

**Blocked by:** none. (LOG-ONLY scan — app code not modified; the domain resolver applies the fix after approval.)

**Related files:** `dnd-app/src/main/ai/context/chunk-builder.ts` (`stableChunkId`, ~line 16), `bmo/pi/services/rag_search.py` (`stable_chunk_id`, ~line 172)

**Related entries:** Cross-engine consistency also affects the bmo RAG retrieval path, but the defect itself lives in the dnd-app TS file (logged here per `Domain: dnd-app`). A bmo-side reviewer should be aware the IDs will not match until this TS fix lands.

**Supplement [2026-06-29, dnd-errors]:** Confirmed the NUL byte is present (the join delimiter renders as `^@` / `0x00`) and that there are actually **THREE** copies of the recipe, only one of which drifted:
- `dnd-app/scripts/build/build-chunk-index.mjs:22` joins with a **space** (`.join(' ')`) — this generates the committed `resources/chunk-index.json` ids.
- `bmo/pi/services/rag_search.py:172` joins with a **space** (`" ".join(...)`); its docstring even claims it "Mirrors dnd-app chunk-builder.ts stableChunkId EXACTLY ... joined with a SINGLE SPACE."
- `dnd-app/src/main/ai/context/chunk-builder.ts` `stableChunkId` joins with **NUL** — the lone outlier.

So the committed-index ids and the Python ids agree with each other (both space); the **runtime TS engine alone** disagrees with both. This corrects the original entry's "applyStableIds ... is likely self-healing" note: `applyStableIds` (used by `flattenToChunks` and the v1->v2 load migration) recomputes ids with the **NUL** recipe, so on load it rewrites every committed (space-derived) id to the **wrong** NUL-derived value rather than healing toward the Python/index value — it makes the divergence active at runtime, not benign. Also note `chunk-builder.test.ts` only asserts `loaded.id === stableChunkId(...)` (the function compared against itself) and hardcodes no cross-engine digest, which is why CI stays green despite the drift — exactly the cross-engine fixture the original proposed-fix checklist calls for. The Python docstring should also be corrected once the TS side is fixed (it currently misdescribes the TS reality).

## Medium

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


## Low

### [2026-06-29] chunk-index build is non-deterministic — `createdAt: new Date().toISOString()` makes every regeneration a noise diff

- **Category:** debt, config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — ran `node scripts/build/build-chunk-index.mjs` against the committed index

**Description:**
`dnd-app/scripts/build/build-chunk-index.mjs:280` stamps the output with `createdAt: new Date().toISOString()`. Re-running `npm run build:index` on a clean checkout therefore produces a diff in the committed `dnd-app/resources/chunk-index.json` **even when no source content changed** — I verified all 5383 chunks (ids, content, headingPath, keywords, tokenEstimate) are byte-identical between the committed index and a fresh regeneration; the **only** difference is the `createdAt` timestamp (`2026-06-17T02:15:02.694Z` committed vs the regen wall-clock). Because the build embeds wall-clock time, the index is not reproducible and cannot be byte-verified against its sources. There is currently no CI freshness gate for the index (release.yml regenerates it but nothing diffs it), so this does not fail CI today — it is latent churn / a missed-verifiability gap, not an active break.

**Expected behavior:** Regenerating the index from unchanged sources yields a byte-identical file (deterministic build), so a future index-freshness `--check` gate becomes possible and regeneration never produces a spurious one-line diff.

**Hypothesis / root cause:** The generator records its own run time in the artifact instead of deriving the timestamp from content/source mtime (or omitting it) — the same non-determinism pattern that would defeat any reproducible-build or index-freshness check.

**Proposed fix / improvement:**
- [ ] Drop `createdAt`, or derive it deterministically (e.g. max source-file mtime, or a content hash) so unchanged sources regenerate byte-identically.
- [ ] Optionally add a `build:index -- --check` drift gate (mirroring `gen:ipc-surface --check` / `sync:doc-counts --check`) once the output is deterministic.

**Blocked by:** none. (LOG-ONLY scan — app code not modified.)

**Related files:** `dnd-app/scripts/build/build-chunk-index.mjs` (~line 280), `dnd-app/resources/chunk-index.json`
