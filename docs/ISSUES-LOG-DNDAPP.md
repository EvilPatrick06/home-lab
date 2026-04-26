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

> **Cleared 2026-04-25.** The prior backlog is archived in [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md) under *“[2026-04-25] dnd-app issues log clearance — full archive batch”* with per-item resolution (implemented vs. deferred to ongoing product/infra work). Use that file for history. Re-open a topic by adding a **new** dated entry here per [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

## Critical

*(none currently logged)*

---

## High

*(none currently logged — see `RESOLVED-ISSUES-DNDAPP.md` for [2026-04-25] hidden-info-leakage fix)*

---

## Medium

*(none currently logged)*

---

## Low

*(none currently logged — see `RESOLVED-ISSUES-DNDAPP.md` for [2026-04-25] conversation-prune / save-queue / atomic-write tmp / postinstall fixes)*

<!-- Historical entries below have been archived; left in place as a paper trail
     until the next clearance batch. -->

### [2026-04-25] `ConversationManager.messages` grows unbounded across a long campaign — disk + memory cost

- **Category:** debt, performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** AI conversation memory audit (Tier B deep dive)

**Description:** `src/main/ai/conversation-manager.ts`'s `addMessage()` pushes onto `this.messages: ConversationMessage[]` indefinitely. The summary system (`maybeSummarize`, line 177) ADDS entries to `this.summaries` when the recent-message count exceeds `MAX_RECENT_MESSAGES = 10`, but **never prunes** the underlying `this.messages` array — only the API call truncates via `getMessagesForApi`'s token-budget loop.

`serialize()` returns the full `messages` array, which `ai-conversation-storage.saveConversation` writes to `userData/ai-conversations/{campaignId}.json`. So both:
- **In-memory growth** — every campaign's `ConversationManager` holds every message ever sent until the app restarts.
- **On-disk growth** — the conversation file grows monotonically; a year of weekly play with 50 messages/session is ~2 600 messages × ~500 bytes = ~1.3 MB per campaign.

The API truncation is correct (the API call itself stays within token budget). The persistence is what grows.

**Reproduction:**
```ts
// In a long campaign, after N messages:
const cm = conversations.get(campaignId)
console.log('msg count:', cm.getMessageCount())  // grows linearly, never resets
```

**Proposed fix:**
- [ ] After `maybeSummarize` produces a summary covering messages [0..coversUpTo], drop those messages from `this.messages` and adjust subsequent `coversUpTo` indexes accordingly.
- [ ] OR: periodically rewrite the file as `summaries + recent (last N tail)` — keeps the rich history compressed but caps disk growth.
- [ ] Add a unit test that pushes 1 000 messages and asserts on-disk size stays under e.g. 100 KB.

**Related files:** `src/main/ai/conversation-manager.ts`, `src/main/storage/ai-conversation-storage.ts`

---

### [2026-04-25] Concurrent `saveCharacter(sameId)` races — auto-save vs manual save can lose data

- **Category:** bug, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** storage concurrent-write audit (Tier A deep dive)

**Description:** `src/main/storage/character-storage.ts:44-80` (`saveCharacter`) does:

1. Read existing file (if any)
2. Copy to `.versions/{id}/{id}_{ts}.json`
3. Prune to the latest 20 versions
4. `atomicWriteFile(path, JSON.stringify(character))`

Each step is `await`ed individually. Two concurrent calls with the same `id` (auto-save tick from `use-auto-save.ts:219` racing with a manual save click) can interleave:

```
A: read old, backup as t1
B: read old, backup as t2 (same content as t1, redundant version)
A: writeFile(new-A)
B: writeFile(new-B)   ← overwrites A's changes silently
```

`atomicWriteFile` itself is per-call atomic, but there's no per-id mutex around the whole save sequence. The IPC handler in `storage-handlers.ts:71` doesn't add one either.

**Impact:** In typical solo use, the auto-save interval (every few seconds) shouldn't overlap with a manual click — but it can. Result: the manual save's data wins or loses based on whichever finished its `atomicWriteFile` last, and the user's last edit may silently disappear. Two redundant version backups also accumulate.

**Reproduction:** trigger a manual `saveCharacter` callback and an auto-save tick within ~10ms of each other; observe that the character file ends up with one of the two states (not necessarily merged or the latest), and `.versions/` gets two near-identical entries.

**Proposed fix:**
- [ ] Add a `Map<id, Promise<void>>` "save queue" in `character-storage.ts`: each `saveCharacter(id)` awaits the previous promise for that id before starting. Same pattern for the other entity-keyed save modules (`campaign-storage`, `bastion-storage`, `homebrew-storage`, etc.).
- [ ] Add a unit test: dispatch 50 concurrent `saveCharacter(sameId, ...differentVersions)` and assert each version backup matches an actual prior state (no duplicates from the race window).

**Related files:** `src/main/storage/character-storage.ts:44-80`, `src/main/storage/campaign-storage.ts`, `src/main/storage/bastion-storage.ts`, `src/main/storage/homebrew-storage.ts`, `src/main/storage/game-state-storage.ts`, `src/renderer/src/hooks/use-auto-save.ts`

---

### [2026-04-25] Three "fire-and-forget" promise sites swallow errors silently

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** floating-promise / empty-catch audit

**Description:** Three sites kick off async work and silently drop errors, with no log to indicate failure. None are critical, but each is a debugging black hole when the underlying op fails:

| File | Line | Code | Impact when it fails |
|---|---|---|---|
| `src/main/ai/context-builder.ts` | 254 | `memMgr.saveCharacterContext(cacheEntries).catch(() => {})` | Cache miss next session; no visibility |
| `src/main/ai/conversation-manager.ts` | 198 | `try { ... await this.summarizeCallback(...) } catch { /* If summarization fails, continue without */ }` | Summary lost; messages never compress; growth issue above is worse |
| `src/main/storage/character-storage.ts` | 70 | `try { /* version-backup logic */ } catch { /* Non-fatal: versioning failure shouldn't block saving */ }` | Version history gap (no warning logged) |

`catch {}` blocks beyond these (3 total in the prod-code grep, all listed above) — there are zero other empty catches in `src/`.

**Proposed fix (minimum):** wrap each with `.catch((e) => logToFile('WARN', '[scope]', String(e)))`. Doesn't change behavior; just leaves a breadcrumb when the silent failure happens.

**Related files:** the three above.

---

### [2026-04-25] PDF.js worker `postinstall` script breaks silently on pdfjs-dist layout changes

- **Category:** config, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **During:** build/release audit

**Description:** `package.json:11` has an inline `node -e` postinstall:
```json
"postinstall": "electron-builder install-app-deps && node -e \"require('fs').cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','src/renderer/public/pdf.worker.min.mjs')\""
```

Two issues:
1. **Hardcoded path inside pdfjs-dist** — if pdfjs-dist v5 (latest 5.6.205, currently we're on 4.10.38) renames or relocates `build/pdf.worker.min.mjs`, the `cpSync` throws ENOENT and `npm install` exits non-zero. Tracking the dep upgrade can hit this silently.
2. **Inline `-e` is unmaintainable** — multi-line escapes via `\"...\"` are read-only-by-author. Future contributors can't easily add error context or Windows-vs-POSIX adjustments.

**Proposed fix:**
- [ ] Move the copy logic into `scripts/build/postinstall.mjs` with a try/catch that logs a clear "pdfjs-dist worker not found at path X — check version Y" error
- [ ] Reference `package.json` to compute the actual installed pdfjs version + build the resolved path dynamically
- [ ] Update `postinstall` to call `node scripts/build/postinstall.mjs`

**Related files:** `package.json:11`

---

*(see `RESOLVED-ISSUES-DNDAPP.md` for prior round's archived fixes)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
