# `src/services/` — service modules

`services/` holds framework-agnostic modules (no JSX) that the React tree calls
into: persistence, the study/exam engine, game systems, and platform glue. Files
sit at the flat root today; this doc records the **concern taxonomy** so new
modules land in the right conceptual group (and, if the folder is later split
into subdirectories, this is the intended grouping). Mirrors the placement-rule
precedent in [`../components/README.md`](../components/README.md).

## Concern groups

| Group | Purpose | Modules |
|---|---|---|
| **cloud / auth / persistence** | Local + remote save state, auth, sync, resume | `supabase.js`, `cloudSync.js`, `backfill.js`, `persistence.js`, `sessionResume.js` |
| **exam / SRS engine** | Scheduling, pacing, prediction, grading, study artifacts | `examPace.js`, `examPrediction.js`, `examSession.js`, `srs.js`, `forgettingCurve.js`, `weakDomain.js`, `oracleGrader.js`, `leech.js`, `occlusion.js`, `certificate.js`, `accuracyPalette.js` |
| **game systems** | In-world progression systems | `pets.js`, `spells.js`, `devotion.js` |
| **import / library** | Deck ingestion + bulk library operations | `deckImport.js`, `libraryBulk.js`, `importLimits.js` |
| **platform / UI infra** | Cross-cutting app infrastructure | `logger.js`, `notifications.js`, `i18n.js`, `tts.js`, `timerAnnounce.js`, `notesCrypto.js`, `richContent.js`, `sealedTome.js`, `pwaUpdate.js`, `shortcuts.js` |

## Placement rule

When adding a service module, decide which of the four groups it belongs to and
keep it consistent with the siblings above. Colocate its `*.test.js` next to it.
Pure game **data/logic** that is not a service (map generation, item tables,
tutorial steps) belongs in `src/game/`, not here; React components belong in
`src/components/` or `src/features/` per `components/README.md`.
