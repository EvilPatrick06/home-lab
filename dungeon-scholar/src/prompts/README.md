# `src/prompts/` — Oracle AI prompt templates

Per-vendor prompt modules for the Oracle "generate a tome" flow. Each vendor file
exports two symbols following one pattern:

- `*_PROMPT_META` — the picker metadata: `{ id, name, emoji, subtitle, examTargetPlaceholder, commonExams }`.
- `*_PROMPT` — the full prompt string, assembled from the shared building blocks
  in [`_shared.js`](./_shared.js) (`SHARED_HEADER`, `SHARED_SCHEMA`,
  `SHARED_STYLE_RULES`, `SHARED_FOOTER`).

`index.js` aggregates them into the ordered `ORG_PROMPTS` array
(`{ ...META, prompt }` per vendor) that the picker renders; `generic.js` is the
fallback for exams without a dedicated vendor prompt and is listed last.

## Vendors

`aws`, `cisco`, `cmmc`, `comptia`, `eccouncil`, `giac`, `google`, `isaca`,
`isc2`, `microsoft`, plus `generic` (fallback).

## Placement / adding a vendor

Add `<vendor>.js` exporting `<VENDOR>_PROMPT_META` + `<VENDOR>_PROMPT` (reuse the
`_shared.js` blocks — do not re-inline the shared schema/style), then register it
in `index.js` `ORG_PROMPTS`. `index.test.js` guards that every entry has the
required META fields; keep `generic` last.
