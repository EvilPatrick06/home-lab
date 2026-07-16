# PHASE-14 — Sealed-export local-notes strip + occlusion-fallback answer reveal + QA-instructions doc sweep (round of Lows)

> Authored from [`QA-report-2026-07-02.md`](./QA/completed/QA-report-2026-07-02.md) (automated `scholar-qa-tester` **static verification pass — no browser available that run** — against the live GitHub-Pages build `index-Ce_Cu-Nc.js`, cross-checked `origin/master` `0b17da31`, 2026-07-02). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

The run found **no Critical/High** (static-only coverage — the browser bridge was down for the whole pass, so every finding is source-verified, not browser-verified). It confirmed all three of the prior report's open findings shipped in the live bundle, and filed **three new Lows + one Info**. The Info (phase-named test files at structural roots) was **already resolved on master** by `97138c8b` (the approved scholar debt/docs/test-org batch relocated the guard suites into `src/__guards__/` with descriptive names) — not re-authored; see PHASE-PROVENANCE. This phase bundles the three Lows (the established round-of-Lows pattern, cf. PHASE-11/PHASE-13), one independent sub-phase each:

- **F1 (low, security) — the sealed-tome export path skips `stripLocalOnlyTomeFields`, inconsistent with every other data exit.** The phase-11 resolver round added the local-only-field strip to the share code (`encodeTomeShareCode`), the import normalize (`normalizeTomeData`), and the plain `.json` export (`downloadTomeJson`) — but the **seal** path encrypts `tome.data` raw: `ShareTomeModal.jsx:89` calls `sealTome(tome.data, sealPass)`, and the strip inside `downloadTomeJson` then runs on the *envelope* (which has no `notes` key), not on the payload that was just encrypted. Any tome whose `data.notes` was injected via import **before** the strip landed can still exfiltrate those notes through a sealed export — and the unseal path (`App.jsx` `unlockSealedTome`) puts the decrypted object straight into memory without normalizing, so the recipient receives them too.
- **F2 (low, UX) — OcclusionCard's disallowed-image fallback never reveals the mask answers on flip but still asks the learner to self-grade.** The allowlist hardening correctly refuses to render a non-`data:image` source, but the mask layer is gated on the same `imageOk` flag — so on flip the region **answers** (`m.answer`, plain text, independent of the image) are never shown, while the footer still reads "✦ Revealed — rate thy recall" and FlashcardsMode still renders the four SRS rating buttons. Rating recall of answers that were never revealed silently skews that card's SRS scheduling.
- **F3 (low, docs) — QA `INSTRUCTIONS.md` §3.2 still instructs agents to log the README `/dungeon-scholar/` 404 URL as a finding — the README was already fixed.** `README.md:5` (and the Deploy section note) now point to `https://evilpatrick06.github.io/home-lab/`; the stale instruction primes every future QA run to re-file a fixed issue.

None depends on the others; implement in any order (F1 first by category — it's the security one).

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of each other and of PHASE-01..13.
- **F1 completes the phase-11-resolver local-notes strip sweep** (`stripLocalOnlyTomeFields`, added as "belt-and-suspenders" in `src/game/tome.js`). Three of the four data exits were covered; the seal path is the one remaining exit. This does **not** reopen PHASE-41 41C (the seal feature itself) — the envelope format, crypto, and gate flow are untouched; only the plaintext handed to `sealTome` changes.
- **F2 completes the resolver-round OcclusionCard allowlist hardening** (the `isAllowedOcclusionImage` render-boundary re-validation). The security behavior (never emit an `<img>` for a non-`data:image` source) is correct and stays; F2 only fixes the fallback's *learning* affordance. It does not touch `src/services/occlusion.js` validation or the SRS scheduler.
- **F3 is docs-only** (`docs/phases/QA/INSTRUCTIONS.md`), zero app surface. Note: the `scholar-qa-tester` **scheduled-task prompt** (lives outside this repo, in the owner's task definition) carries the same stale claim — flag for the owner; a phase executor cannot fix it from the repo (see Out of scope).
- **File disjointness:** F1 touches `src/features/library/ShareTomeModal.jsx` (+ its test); F2 touches `src/components/OcclusionCard.jsx` (+ its test, and possibly a hint-copy check in `FlashcardsMode.jsx`); F3 touches `docs/phases/QA/INSTRUCTIONS.md`. No overlap.

## Verified findings

All verification read-only against the live tree at `origin/master` (`228bd8a8`, worktree `auto/scholar-phase-maker`, 2026-07-15 — the findings survive the `97138c8b` debt batch that landed after the report). Re-run before implementing (rule 3).

### F1 (low, security) — sealed-tome export encrypts `tome.data` without `stripLocalOnlyTomeFields`

**Status: confirmed in source. The seal path is the one data exit that forwards an attacker-injected `data.notes`; the strip inside `downloadTomeJson` runs too late (on the envelope, not the plaintext).**

The strip helper and its three existing call sites (`src/game/tome.js`):

```js
// tome.js:16-24 — the allowlist guard ("belt-and-suspenders": drops `notes` and any
// future local-only field from any tome-data payload that is shared, exported, OR imported)
const LOCAL_ONLY_TOME_FIELDS = ['notes'];
export const stripLocalOnlyTomeFields = (data) => { … };

// tome.js:30 — share code:      JSON.stringify(stripLocalOnlyTomeFields(data))
// tome.js:175 — import:         normalizeTomeData → return stripLocalOnlyTomeFields(out)
// ShareTomeModal.jsx:24 — plain export: JSON.stringify(stripLocalOnlyTomeFields(tome.data), null, 2)
```

The seal path (`src/features/library/ShareTomeModal.jsx`, `handleSeal`):

```jsx
// ShareTomeModal.jsx:89-90
const envelope = await sealTome(tome.data, sealPass);        // ← RAW tome.data encrypted, notes and all
downloadTomeJson({ data: envelope }, { suffix: '-sealed' }); // strip runs on the envelope — no `notes` key there
```

`sealTome` (`src/services/sealedTome.js:117`) does `JSON.stringify(tomeData)` → AES-GCM — whatever is in `tomeData` rides inside the ciphertext. And the receiving side never strips either: the only production `unsealTome` call site is `App.jsx:948` (`unlockSealedTome`), which puts the decrypted object straight into `unsealedTomes` state — no `normalizeTomeData`, no strip.

**Exposure window (why this is real, not theoretical):** `tome.data.notes` normally never exists (Phase-40F notes live as a *sibling* of `data`), but the strip was added precisely because import (`normalizeTomeData` spreads all incoming fields) *used to* let an injected `data.notes` in. Any library entry imported before the strip landed can still carry one, and the sealed export is now the one remaining exit that (a) writes it to a file anyone with the passphrase can decrypt, and (b) delivers it decrypted into the recipient's session.

```bash
grep -n 'sealTome(tome.data' dungeon-scholar/src/features/library/ShareTomeModal.jsx   # :89
sed -n '16,24p;28,32p;173,176p' dungeon-scholar/src/game/tome.js                       # helper + 3 covered exits
grep -rn 'unsealTome' dungeon-scholar/src --include='*.js*' | grep -v test             # App.jsx:948 only — no strip
```

**Root cause:** `sealTome(tome.data, sealPass)` predates the strip helper and was not included in the phase-11-resolver call-site sweep; the strip that *is* on the path (`downloadTomeJson`) operates on the wrong object (the envelope).

**Suggested action (report's, plus one belt-and-suspenders layer):** primary — `sealTome(stripLocalOnlyTomeFields(tome.data), sealPass)` at `ShareTomeModal.jsx:89` (one-line change). Defense-in-depth — also strip at unseal (`unlockSealedTome`) so a *previously produced* contaminated sealed file can't deliver notes into a session either. Guard tests both ways.

### F2 (low, UX) — rejected occlusion image ⇒ answers never revealed, but self-grading still requested

**Status: confirmed in source. One `imageOk` flag gates the `<img>`, the mask overlays *and therefore the flipped answer text*, while the "rate thy recall" hint and the FlashcardsMode SRS buttons are unconditional.**

`src/components/OcclusionCard.jsx` (57 lines, whole component):

```jsx
const imageOk = isAllowedOcclusionImage(card?.image);   // :12 — render-boundary re-validation (correct, keep)
…
{imageOk ? ( <img …/> ) : (
  <div …>Image unavailable — occlusion images must be embedded (data:image) images.</div>   // :24-27
)}
{imageOk &&                                              // :29 — gates the WHOLE mask layer…
  masks.map((m, i) => ( … {flipped ? m.answer || '✓' : '?'} … ))}   // :45 — …including the flipped ANSWER text
…
{flipped ? '✦ Revealed — rate thy recall' : '~ Name each masked region, then flip ~'}   // :51 — unconditional
```

`src/features/study/FlashcardsMode.jsx` renders `<OcclusionCard>` for occlusion cards (`:361-362`) and, when flipped, always shows the four SRS rating buttons (`rate(SRS_RATINGS.again|hard|good|easy)`, `:400-424`) — occlusion cards ride the normal SRS path. So for a card with a rejected image the learner sees "Image unavailable", flips, sees *nothing revealed*, and is prompted (footer + buttons + the 1-4 keyboard shortcuts, `:213`) to grade recall — garbage-in for `scheduleCard`.

The masks themselves are plain text data validated independently of the image: `normalizeMasks(card?.masks)` (`occlusion.js`) runs regardless of `imageOk`, so `m.answer` strings are available in the fallback branch.

```bash
sed -n '1,57p'   dungeon-scholar/src/components/OcclusionCard.jsx
grep -n 'OcclusionCard\|SRS_RATINGS\.' dungeon-scholar/src/features/study/FlashcardsMode.jsx | head
grep -n 'it(' dungeon-scholar/src/components/OcclusionCard.test.jsx   # existing: rejected image → no <img>, no overlays
```

**Root cause:** the allowlist fix conflated "can't *position* masks over an image that isn't rendered" (true) with "can't show the answers at all" (false — answers are text, independent of the image).

**Suggested action (report's):** in the `!imageOk` branch, on flip, render the mask answers as a plain text list (`masks.map((m) => m.answer)`); make the footer hint conditional on `imageOk` so the unflipped fallback doesn't promise region-masking it can't deliver. Keep the SRS buttons (with answers now revealed as text, self-grading is meaningful again — and excluding cards from rating would need scheduler surgery that isn't warranted for a Low).

### F3 (low, docs) — QA `INSTRUCTIONS.md` §3.2 primes every run to re-file the already-fixed README URL

**Status: confirmed in source (this one *was* fully verifiable statically).**

`dungeon-scholar/docs/phases/QA/INSTRUCTIONS.md` §3 step 2 ("Open the live app"), the "Note (stale doc)" bullet:

> `dungeon-scholar/README.md` advertises the live URL as `https://EvilPatrick06.github.io/dungeon-scholar/`. That host **404s** … (This README/deploy mismatch is itself a legitimate finding — log it.)

But `dungeon-scholar/README.md:5` now reads `**Live site:** https://evilpatrick06.github.io/home-lab/`, and the Deploy section carries an explicit note reconciling the monorepo `/home-lab/` base with the fork-only `/dungeon-scholar/` default in `vite.config.js`. The instruction now tells every future QA agent to log a finding against text that no longer exists.

```bash
grep -n 'dungeon-scholar/' dungeon-scholar/docs/phases/QA/INSTRUCTIONS.md | grep -i 404
grep -n 'Live site' dungeon-scholar/README.md          # :5 → /home-lab/
grep -n 'home-lab/' dungeon-scholar/README.md | head   # Deploy-section reconciliation note present
```

**Root cause:** the README fix landed in a resolver round after INSTRUCTIONS.md was written; the instruction doc was not swept.

**Suggested action (report's):** invert the note to a verification step — "verify `README.md`'s advertised live URL still matches the deployed `/home-lab/` base (`VITE_BASE` in `dungeon-scholar-deploy.yml`); if a mismatch has *reappeared*, log it" — so the check stays useful without pre-filing a fixed issue.

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (`vitest run`, happy-dom + `@testing-library/react`; ~848 tests green as of `97138c8b`). Existing suites to extend: `src/features/library/ShareTomeModal.test.jsx` (has a full seal-and-download test at `it('seals and downloads a valid sealed envelope on a matching passphrase')` that already decodes the produced envelope — the natural place for the F1 guard) and `src/components/OcclusionCard.test.jsx` (has `it('skips the positioned mask overlays when the image is rejected')` — the natural neighbor for the F2 cases). `src/game/tome.test.js` and `src/services/sealedTome.test.js` also exist if a lower-level guard fits better.
- **Guard-test convention (post-`97138c8b`):** cross-cutting static guards live in `src/__guards__/*.guard.test.js` with descriptive names; unit tests stay colocated. F1/F2 guards are unit-level — colocate them.
- **Lint / typecheck / build:** `npm run lint` (Biome, pinned `@biomejs/biome@2.5.0` devDependency), `npm run typecheck` (`tsc --noEmit`, keep checkJs at 0), `npm run build` (`VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates lint + test + build on push, plus advisory bundle-size/coverage budgets.
- React 19, plain JSX, `type: "module"`, hash routing. `sealTome`/`unsealTome` use WebCrypto AES-GCM + PBKDF2 (600k iterations) — the F1 fix must not touch the envelope shape (`sealVersion`, `metadata`, `sealCounts`, `salt`/`iv`/`ct`), only the plaintext object passed in.

## Sub-phases

One per finding; each independently shippable, each leaves the tree green. Any order (14A first by category).

### 14A — Strip local-only fields before sealing (and after unsealing) (F1)

**Objective:** all four data exits (share code, import normalize, plain export, **seal**) apply `stripLocalOnlyTomeFields`; a legacy-contaminated sealed file also cannot deliver `data.notes` into a recipient's session.

**Files:** `dungeon-scholar/src/features/library/ShareTomeModal.jsx` (`handleSeal`); `dungeon-scholar/src/App.jsx` (`unlockSealedTome` — defense-in-depth); `dungeon-scholar/src/features/library/ShareTomeModal.test.jsx` (extend).

**Steps:**
1. `ShareTomeModal.jsx:89` — seal the stripped payload (the strip returns the same ref when clean, so the normal no-`notes` case is byte-identical):
   ```jsx
   const envelope = await sealTome(stripLocalOnlyTomeFields(tome.data), sealPass);
   ```
   (`stripLocalOnlyTomeFields` is already imported at the top of the file for `downloadTomeJson`.)
2. `App.jsx` `unlockSealedTome` — strip on the way out of the ciphertext too, so sealed files produced *before* this fix are also neutralized:
   ```js
   const tome = stripLocalOnlyTomeFields(await unsealTome(entry.data, passphrase));
   ```
   Import the helper alongside the existing `tome.js` imports. Do **not** route the unsealed object through full `normalizeTomeData` here — the sealed payload passed normalize at original import time, and re-normalizing decrypted content is out of scope for a Low (note the judgment call in the commit message if the executor disagrees).
3. Do not modify `sealTome`/`unsealTome` themselves (`services/sealedTome.js` stays a pure crypto module with no `game/` import — keeps the dependency direction clean).

**Verify (read-only, after editing):**
```bash
grep -n 'stripLocalOnlyTomeFields' dungeon-scholar/src/features/library/ShareTomeModal.jsx dungeon-scholar/src/App.jsx
grep -n 'sealTome(' dungeon-scholar/src/features/library/ShareTomeModal.jsx   # arg is the stripped payload
```

**Tests:** extend `ShareTomeModal.test.jsx` — seal a tome whose `data` carries an injected `notes` key; unseal the produced envelope in the test (helpers are exported from `sealedTome.js`) and assert the decrypted payload has **no** `notes` while `flashcards`/`quiz`/`metadata` survive. Add an `unlockSealedTome`-level (or `App.test.jsx`) case if the harness reaches it: a sealed envelope hand-built around a `notes`-bearing payload unseals into state without `notes`. Keep the existing seal tests green (already-sealed guard, weak-passphrase, mismatch).

**Acceptance:** sealed exports of a `notes`-contaminated library entry contain no `notes` inside the decrypted payload; unsealing a legacy contaminated file yields no `notes` in memory; envelope shape and all existing sealed-tome behavior unchanged; lint/typecheck/tests/build clean.

### 14B — Reveal mask answers as text when the occlusion image is rejected (F2)

**Objective:** a rejected-image occlusion card still teaches: flip reveals the region answers as a plain text list, the hint copy matches what the card can actually do, and self-grading is meaningful again. The security behavior (no `<img>` for non-`data:image` sources) is unchanged.

**Files:** `dungeon-scholar/src/components/OcclusionCard.jsx`; `dungeon-scholar/src/components/OcclusionCard.test.jsx` (extend). (`FlashcardsMode.jsx` needs no change — with answers revealed, the rating buttons are correct as-is.)

**Steps:**
1. In the `!imageOk` branch, alongside the existing "Image unavailable" notice, render the answers on flip (masks are already normalized independent of the image):
   ```jsx
   {!imageOk && flipped && masks.length > 0 && (
     <ul className="mt-2 text-sm text-left list-disc list-inside">
       {masks.map((m, i) => (
         <li key={i}>{m.answer || '—'}</li>
       ))}
     </ul>
   )}
   ```
   (Style to taste with the existing card palette; keep it inside the fallback `<div>`'s visual block so the notice + answers read as one unit.)
2. Make the footer hint honest in the fallback state — e.g.:
   ```jsx
   {imageOk
     ? (flipped ? '✦ Revealed — rate thy recall' : '~ Name each masked region, then flip ~')
     : (flipped ? '✦ Answers revealed as text — rate thy recall' : '~ Image unavailable — flip to reveal the answers as text ~')}
   ```
3. Keep `imageOk` gating the `<img>` and the *positioned* overlays exactly as today (the security fix stays byte-equivalent for the rejected-image unflipped state, minus copy).

**Verify (read-only, after editing):**
```bash
sed -n '1,80p' dungeon-scholar/src/components/OcclusionCard.jsx
grep -n 'imageOk' dungeon-scholar/src/components/OcclusionCard.jsx
```

**Tests:** extend `OcclusionCard.test.jsx` — (a) rejected image + `flipped` → each `m.answer` present in the DOM, still no `<img>`, still no positioned overlays; (b) rejected image + not flipped → no answer text leaks (recall integrity); (c) allowlisted image behavior unchanged (existing cases stay green).

**Acceptance:** with a non-`data:image` occlusion card, flip shows the mask answers as text and the hint copy matches; no `<img>` is ever emitted for a rejected source; unflipped state reveals no answers; SRS flow untouched; lint/typecheck/tests/build clean.

### 14C — Sweep the stale README-404 instruction out of QA `INSTRUCTIONS.md` (F3)

**Objective:** QA agents verify the README URL instead of being told to re-file a fixed issue.

**Files:** `dungeon-scholar/docs/phases/QA/INSTRUCTIONS.md` (§3 step 2, the "Note (stale doc)" bullet).

**Steps:**
1. Replace the bullet with an inverted verification step, e.g.:
   > **Note (verify, don't assume):** `dungeon-scholar/README.md` should advertise the live URL as `https://evilpatrick06.github.io/home-lab/` (the monorepo deploys under `/home-lab/` via `VITE_BASE=/home-lab/` in `dungeon-scholar-deploy.yml`; a fork renamed to `dungeon-scholar` gets the `/dungeon-scholar/` base instead — see the README's Deploy note). Verify the README still matches before testing; if a mismatch has reappeared, log it.
2. Scan the rest of INSTRUCTIONS.md for other references to the old claim while in the file (`grep -n 'dungeon-scholar/' … | grep -i 404`) — fix any stragglers in the same edit.
3. Docs-only: no tests. Markdown-lint by eye; the file is not in any CI gate.

**Acceptance:** INSTRUCTIONS.md no longer asserts the README is wrong; it instructs verification of the current correct state; no other stale README-404 references remain in the QA docs.

## Research notes

- **F1's fix point is the call site, not the crypto module.** Putting the strip inside `sealTome` would be the more regression-proof choice, but it imports `game/tome.js` into `services/sealedTome.js` — currently a dependency-free WebCrypto module whose tests run without the game layer. The call-site fix + a guard test that decrypts the real produced envelope gives equivalent protection without coupling. The unseal-side strip (step 2) is what actually closes the loop for *already-produced* contaminated files — without it, the one-line seal fix only protects exports made after it ships.
- **F1 severity stays Low:** the payload rides *encrypted* (only passphrase holders can read it), and the contamination prerequisite is an import that predates `15f27e5a`. But it's the lone inconsistent exit in an otherwise-complete sweep, and the fix is two lines + tests.
- **F2 deliberately keeps the card rateable.** The report offered "or exclude the card from rating" as an alternative; rejected — exclusion would need FlashcardsMode/scheduler special-casing (skip logic, deck-count implications) for a state that text-reveal fixes outright. With answers revealed as text the self-grade is honest, and the SRS path stays uniform. Per-region reveal fidelity is inherently lost without the image; that's acceptable — the card degrades to a basic front/back card.
- **F2's unflipped state must stay answer-free** — the fallback must not leak `m.answer` before the flip, or the card tests recall of nothing. Hence the explicit `flipped &&` gate and the test case (b).
- **F3:** the QA report also noted the `scholar-qa-tester` *scheduled-task prompt* repeats the stale claim. That prompt lives in the owner's task definition, not in the repo — a phase executor cannot patch it. Surface it to the owner (Out of scope) rather than pretending the repo edit fixes it.

## Test plan

- **Unit (new/extended):** `ShareTomeModal.test.jsx` (F1: injected `data.notes` sealed → decrypted envelope payload has no `notes`; normal seal path unchanged); an unseal-side strip assertion where the harness allows; `OcclusionCard.test.jsx` (F2: rejected+flipped → answers as text, no `<img>`, no overlays; rejected+unflipped → no answer leak; allowlisted behavior unchanged).
- **Build/lint/type gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) clean (CI parity).
- **Manual spot check (executor):** seal + download a tome with a hand-injected `data.notes` (devtools localStorage edit) → unseal the file offline and confirm no `notes`; author an occlusion card, hand-edit its `image` to an `https:` URL, study it → flip shows the answers as text and the four rating buttons behave; read the updated INSTRUCTIONS.md bullet end-to-end for coherence.
- **Note for the next QA run:** all three fixes are browser-verifiable; the authoring run's report was static-only (browser bridge down), so the next live pass should confirm F1/F2 behavior interactively.

## Acceptance criteria

1. All four tome-data exits apply `stripLocalOnlyTomeFields`; a sealed export of a `notes`-contaminated entry carries no `notes` in its decrypted payload, and unsealing a legacy contaminated file delivers no `notes` into memory. Envelope format and existing sealed-tome tests unchanged.
2. A rejected-image occlusion card reveals its mask answers as plain text on flip, with matching hint copy; it reveals nothing unflipped; it never emits an `<img>` for a non-`data:image` source; SRS rating flow is unchanged.
3. QA `INSTRUCTIONS.md` verifies (rather than asserts) the README live-URL state; no stale README-404 instruction remains.
4. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **The Info finding (phase-named test files at `src/`/`src/features/` roots)** — already resolved on master by `97138c8b` (guard suites relocated to `src/__guards__/` with descriptive names + README; `DungeonExplore.test.js` moved to `game/dungeonMap.test.js`). Verified gone from the current tree; nothing to plan.
- **The `scholar-qa-tester` scheduled-task prompt's copy of the stale README-404 claim** — lives outside the repo (owner's task definition); cannot be fixed by a phase executor. Owner action item: update the task prompt to match the 14C wording.
- **Re-normalizing (`normalizeTomeData`) unsealed payloads** — 14A strips local-only fields only; a full re-normalize of decrypted content is a bigger behavioral question (answer-key re-derivation, quiz normalization on data that already normalized at import) and isn't needed for this Low.
- **Excluding rejected-image occlusion cards from SRS rating** — rejected alternative (see Research notes); text-reveal restores grading validity without scheduler surgery.
- **Per-region-per-review masking / occlusion authoring changes** — pre-existing refinement note from the original occlusion feature; unrelated to the fallback fix.
- **The browser-bridge outage itself** (Claude-for-Chrome extension unreachable across `scholar-qa-tester` and `web-qa-tester` runs on 2026-07-02) — host/tooling matter for the owner, not an app phase. The QA report documents it; nothing to author.
