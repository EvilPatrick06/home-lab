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

### [2026-06-24] Import external study-deck formats (Anki .apkg / Quizlet / CSV) into tomes

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
Today the only ways to get content into the app are: hand-write/author a tome, paste/file-pick a `TOME-V1:` share code, or import the bundled starter decks (`src/data/starterDecks.js`). All inbound paths assume the app's own JSON schema (`encodeTomeShareCode`/`decodeTomeShareCode` + `normalizeTomeData` in `src/game/tome.js`). The huge existing corpus of study content already lives in Anki `.apkg`, Quizlet exports, and plain CSV/TSV — none of which can be brought in without manual retyping. A small client-side converter (file-pick → parse → map fields to flashcards/quiz, then route through the existing import path) would dramatically lower the content barrier and complement the resolved "bundle more starter tomes" + "in-app authoring" work rather than duplicate it (those create content; this *imports* existing content). CSV is trivial (header→field mapping); Quizlet's tab/newline export is nearly as easy; `.apkg` is a zipped SQLite DB so it needs sql.js or a lightweight reader and is the stretch goal.

**Hypothesis / root cause:** N/A — additive feature, not a defect.

**Proposed fix / improvement:**
- [ ] Add a "Import from CSV/Quizlet" modal alongside `ImportCodeModal`/`PasteTomeModal` with a column→field mapping step.
- [ ] Parse CSV/TSV + Quizlet tab-export into `{flashcards, quiz}` and feed through `normalizeTomeData` → existing import flow.
- [ ] (Stretch) `.apkg` reader via sql.js to extract notes/fields; map basic note types to flashcards.

**Related files:** `src/game/tome.js`, `src/features/library/ImportCodeModal.jsx`, `src/features/library/PasteTomeModal.jsx`, `src/data/starterDecks.js`

**Related entries:** distinct from the resolved "PWA Web Share Target to import a tome JSON" (that is a *transport* for the app's own JSON, not a format converter).

### [2026-06-24] Upgrade the SRS scheduler to full FSRS-5 with per-user parameter optimization

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`src/services/srs.js` self-describes as "FSRS-inspired (not literal FSRS-5 with 17+ weights — a simpler model)". That is a reasonable, dependency-free choice, but for long-horizon cert prep the difference is real: full FSRS-5 fits its weight vector to the *individual learner's* review history (via the published optimizer) and consistently beats fixed-parameter heuristics on retention-per-review. Because the app already records per-card review outcomes (`questionStats`/`cardProgress` in tome progress) it has the training data an optimizer needs. A future enhancement: ship the canonical FSRS-5 default weights, and optionally run the optimizer client-side over the user's own log to personalize scheduling. Honest severity: low — the current model works and this is an accuracy refinement, not a fix.

**Hypothesis / root cause:** N/A — deliberate simplification documented in `srs.js`.

**Proposed fix / improvement:**
- [ ] Adopt FSRS-5 default weights + the full stability/difficulty update equations behind the existing `srs.js` API.
- [ ] (Stretch) Optional "optimize my schedule" action that fits weights from the user's recorded review history.

**Related files:** `src/services/srs.js`, `src/services/forgettingCurve.js`

### [2026-06-24] Image-occlusion flashcards for diagram-heavy material

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`src/components/RichContent.jsx` already renders inline images (the `n.type === 'image'` branch) alongside Mermaid diagrams and code blocks, so cards can *show* a network topology, an OSI stack, an AWS architecture, etc. What's missing is the single most effective way to *study* such images: image occlusion — masking one or more labeled regions and asking the learner to recall what's hidden. This is a staple of medical/IT exam prep (Anki's Image Occlusion add-on is one of its most popular). Given that diagram-heavy cert content (subnetting layouts, port maps, trust boundaries) is squarely in this app's wheelhouse, an occlusion card type would be a high-value, on-brand learning enhancement. Honest severity: low — net-new study mode, not a gap in existing function.

**Hypothesis / root cause:** N/A — additive feature.

**Proposed fix / improvement:**
- [ ] Define an `occlusion` card type: image + array of rectangular mask regions (each with the answer text).
- [ ] Author UI to draw/place masks over an uploaded image; render one masked region per review with reveal-on-flip.
- [ ] Route through the existing SRS/quiz scoring so occlusion cards earn progress like any other.

**Related files:** `src/components/RichContent.jsx`, `src/features/study/FlashcardsMode.jsx`, `src/services/richContent.js`


# Low-severity polish / info

### [2026-06-24] Library bulk / multi-select actions (export, delete, tag many tomes at once)

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`LibraryScreen.jsx` now has search and virtualization (per resolved entries), so a large library scales for *finding* one tome. It still has no way to act on *several* tomes at once — every operation (export, delete, edit metadata) is one tome at a time. A user curating a sizeable shelf (the virtualization work was driven by a 120-tome QA scenario) has no "select all matching → export" or "select 5 → delete" affordance. A lightweight multi-select mode (checkbox per row + a bulk action bar: export-as-bundle, delete, add a shared tag/category) would meaningfully cut the click cost of housekeeping. Honest severity: low — pure quality-of-life; everything is already achievable one-by-one.

**Hypothesis / root cause:** N/A — the library was built around single-tome interactions; bulk selection was never added.

**Proposed fix / improvement:**
- [ ] Add a "Select" toggle that shows a checkbox per library row.
- [ ] Surface a bulk-action bar (export selected, delete selected, tag selected) when ≥1 is checked.
- [ ] Reuse the existing export/delete/metadata paths per selected id.

**Related files:** `src/features/library/LibraryScreen.jsx`, `src/features/library/MetadataEditModal.jsx`

### [2026-06-24] Exportable / shareable tome-completion certificate ("diploma")

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
The app has a rich progression/identity layer — titles (`game/titles.js`), achievements (`game/achievements.js`), the Scholar's Ledger, the Ascension screen — but all of it stays *inside* the app. There is no artifact a learner can take *out* to mark finishing a tome or hitting mastery. An on-theme, generated "Certificate of Completion / diploma" (canvas → PNG, or print-to-PDF via the browser) when a tome reaches a mastery threshold would give a satisfying capstone and a shareable proof-of-study, leaning into the existing D&D framing (an illuminated scroll naming the scholar, the tome, the date, and the title earned). Honest severity: low — celebratory/motivational, not functional.

**Hypothesis / root cause:** N/A — additive feature.

**Proposed fix / improvement:**
- [ ] Detect a per-tome "mastery" milestone (e.g. all cards past an SRS interval / exam passed).
- [ ] Render a styled certificate (scholar name from profile, tome title, date, earned title) to canvas → downloadable PNG + print stylesheet for PDF.
- [ ] Offer it from the tome screen / achievements modal when the milestone is reached.

**Related files:** `src/game/titles.js`, `src/game/achievements.js`, `src/features/progression/ScholarsLedger.jsx`, `src/features/progression/AscensionScreen.jsx`


# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
