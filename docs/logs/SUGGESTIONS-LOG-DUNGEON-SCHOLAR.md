# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-24] Leech detection — auto-flag (and optionally suspend) chronic-lapse cards

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the SRS + study-mode code

**Description:**
The FSRS-5 scheduler already records a per-card `lapses` counter (`services/srs.js` — incremented on every `Again`/rating-1 review), but nothing in the app ever *reads* it. A card the learner keeps forgetting just cycles back into the due queue indefinitely, burning review time on material that isn't sticking. Anki's "leech" mechanic is the standard answer: once a card crosses a lapse threshold (commonly 8), flag it as a leech so the learner (or tome author) can rewrite it, break it into smaller cards, add a mnemonic/hint, or temporarily suspend it from the queue. This is a high-leverage, learning-science-backed retention feature whose input data is *already being tracked* — only the consumer is missing.

**Proposed fix / improvement:**
- [ ] Add a pure helper (e.g. `services/leech.js` `isLeech(cardState, threshold=8)` + `listLeeches(cardProgress)`), unit-tested like the other SRS helpers.
- [ ] Surface leeches in Scholar's Ledger and/or the Mistake Vault ("N cards keep slipping away").
- [ ] Offer a per-card action: suspend from the due queue, or jump to edit it in TomeEditor.
- [ ] Make the threshold a constant (consistent with `weakDomain.js` / `examPrediction.js` exporting their tuning constants).

**Related files:** `src/services/srs.js`, `src/features/progression/ScholarsLedger.jsx`, `src/features/study/MistakeVault.jsx`, `src/game/tome.js`

### [2026-06-24] TomeEditor: live rendered preview for Markdown / Mermaid / code / LaTeX content

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the in-app tome authoring flow

**Description:**
`features/library/TomeEditor.jsx` is a plain set of `<textarea>` fields — it imports nothing from `components/RichContent.jsx`, so an author writing a question that uses the app's rich-content pipeline (Markdown, Mermaid diagrams, syntax-highlighted code blocks, KaTeX/LaTeX math — all supported at study time via `services/richContent.js` + `RichContent.jsx`) gets zero feedback on how it will render until they save the tome and open it in a study mode. That round-trip makes diagram- and code-heavy authoring painful and error-prone (a malformed Mermaid block or unbalanced `$…$` only shows up after leaving the editor). A side-by-side or toggled live preview that pipes the field's text through the same `RichContent` renderer the study modes use would close the loop and reuse code that already exists.

**Proposed fix / improvement:**
- [ ] Add a "Preview" toggle (or split pane) next to the question/answer textareas that renders the current text via `<RichContent>`.
- [ ] Reuse the existing renderer so preview == study-time rendering exactly (no second markdown path to drift).
- [ ] Optionally show inline parse warnings (bad Mermaid / unterminated code fence) before save.

**Related files:** `src/features/library/TomeEditor.jsx`, `src/components/RichContent.jsx`, `src/services/richContent.js`

# Low-severity polish / info

### [2026-06-24] Surface per-question item analysis — the declared `questionStats` field is a never-populated stub

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the tome progress schema

**Description:**
`game/tome.js` declares `questionStats: {}` in the tome-progress schema (line ~66), but a repo-wide grep shows it is **never written or read anywhere else in `src/`** — it is dead scaffolding. (Note: the resolved FSRS-5 entry in RESOLVED-ISSUES-DUNGEON-SCHOLAR.md states the app "already records per-card review outcomes (`questionStats`/`cardProgress`)" — that is only half true; `cardProgress` is recorded, `questionStats` is an empty stub.) Populating it would unlock genuinely useful **item analysis**: per-question attempt counts, accuracy, and average confidence. For the *learner*, a "hardest questions" view (lowest accuracy, or high-confidence-but-wrong = dangerous overconfidence, cross-referencing the existing `confidenceStats`). For the *tome author*, a flag for questions the population reliably misses — often a sign of a bad/ambiguous question or wrong key, not a hard topic. The plumbing point (`recordAnswer`) already exists.

**Proposed fix / improvement:**
- [ ] Decide whether to populate `questionStats` or remove the dead field (if removing, it is an issue-log debt entry instead).
- [ ] If populating: increment attempts/correct/confidence in the answer-recording path; add a small "hardest questions" panel in Scholar's Ledger.
- [ ] Correct the over-claim in the resolved FSRS entry when this is touched.

**Related files:** `src/game/tome.js`, `src/features/player/usePlayerActions.js`, `src/features/study/QuizMode.jsx`, `src/features/progression/ScholarsLedger.jsx`

### [2026-06-24] Optional per-card hint field with progressive reveal

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the flashcard/quiz content model

**Description:**
The tome content model has no learner-facing **hint** field (the only "hints" in the codebase are keyboard-hotkey legends in ExamMode/LabMode — unrelated). A common study-app affordance is an optional per-card hint the learner can choose to reveal before flipping/answering: it supports retrieval practice with scaffolding (a nudge beats giving up and revealing the full answer, which short-circuits the memory benefit) and pairs naturally with the leech idea above — a chronically-lapsed card is exactly where an author would add a mnemonic hint. Cost is small: an optional `hint` string on flashcard/quiz items, a "Show hint" affordance in the study modes, and an extra textarea in TomeEditor.

**Proposed fix / improvement:**
- [ ] Add optional `hint` to the flashcard/quiz item shape in `game/tome.js` (back-compatible; absent = no hint button).
- [ ] Render a "Show hint" reveal in FlashcardsMode/QuizMode (collapsed by default; track reveals if desired).
- [ ] Add the field to TomeEditor (ties in with the live-preview idea).

**Related files:** `src/game/tome.js`, `src/features/study/FlashcardsMode.jsx`, `src/features/study/QuizMode.jsx`, `src/features/library/TomeEditor.jsx`

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
