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

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
