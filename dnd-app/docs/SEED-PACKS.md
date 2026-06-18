# Seed packs (`.dndseed`) — format reference

> PHASE-37. A **seed pack** is a shareable, versioned "campaign seed": world lore, NPCs, adventure
> arcs, starter quests, encounter tables, tone instructions, and a prepared opening scene — everything
> needed to drop into a fresh (or existing) campaign and start playing, with **none** of the play-state
> a full `.dndcamp` snapshot carries (no players, maps, journal, invite code, AI keys, or saved game).

## At a glance

- **Extension:** `.dndseed` (JSON). Export/import goes through the standard entity-io envelope, but a
  **bare** (un-enveloped) pack JSON also imports — so packs can be hand-authored without the wrapper.
- **Apply semantics:** importing a pack **appends** to a campaign's existing collections (never
  replaces or dedupes) and re-IDs every imported entry. `toneInstructions` / `openingScene` are only
  set when the campaign's value is empty (seeding never clobbers an author's text).
- **Bundled packs:** three curated starters ship under `public/data/5e/seed-packs/` (`hollowmere`,
  `sunderspire-frontier`, `ivory-court`) and are browsable in the campaign wizard + apply modal.
- **Quests** live main-side (the PHASE-28 quest store), so they are seeded through a separate IPC, not
  written into the campaign file.

## Top-level shape

```jsonc
{
  "format": "dnd-vtt-seed-pack",   // REQUIRED, literal
  "formatVersion": 1,               // REQUIRED; a higher number ⇒ "made with a newer app version"
  "id": "hollowmere",               // REQUIRED, [a-z0-9-]+
  "name": "The Hollowmere",         // REQUIRED, ≤120
  "description": "…",               // ≤2000 (default "")
  "author": "…",                    // optional, ≤120
  "system": "dnd5e",                // default "dnd5e" (a mismatch warns but does not block)
  "levelRange": { "min": 1, "max": 4 },
  "tags": ["gothic", "mystery"],    // ≤12
  "toneInstructions": "…",          // ≤4000 — freeform narrator guidance (rendered into [CAMPAIGN DATA])
  "openingScene": {                 // a prepared first scene (shapes scene-prep)
    "title": "…",
    "readAloud": "…",               // REQUIRED if openingScene present, ≤4000 (narrated, never verbatim)
    "dmNotes": "…"                  // ≤2000, never shown to players
  },
  "lore":            [ /* SeedLore     */ ],  // ≤100
  "npcs":            [ /* SeedNpc      */ ],  // ≤100
  "adventures":      [ /* SeedAdventure*/ ],  // ≤20
  "quests":          [ /* SeedQuest    */ ],  // ≤25
  "encounterTables": [ /* SeedRollTable*/ ],  // ≤25
  "encounters":      [ /* SeedEncounter*/ ],  // ≤50
  "customRules":     [ /* SeedRule     */ ],  // ≤50
  "extensions":      { /* arbitrary; preserved through round-trips */ }
}
```

Unknown fields (top-level and per-entry) are **preserved** through an import→export round trip
(every section is a zod `looseObject`), so third-party tooling can extend packs safely.

## Section shapes

- **SeedLore** — `{ id, title, content, category: world|faction|location|item|other, isVisibleToPlayers?, keywords? }`.
  `keywords` map onto `LoreEntry.keywords` (PHASE-25 keyword-triggered lore injection); empty/absent ⇒ always injected.
- **SeedNpc** — `{ id, name, description?, location?, role?: ally|enemy|neutral|patron|shopkeeper, personality?, motivation?, statBlockId?, notes?, isVisible? }`.
  `isVisible` defaults to `role !== 'enemy'`. `statBlockId` (if set) must be a real monster id.
- **SeedAdventure** — the `AdventureEntry` narrative fields (`title` required; `levelTier/premise/hook/villain/setting/playerStakes/encounters/climax/resolution` optional, defaulted to `''` on apply).
- **SeedQuest** — `{ name, description?, objectives?: string[≤8], chapterQuest? }`. Seeded into the quest store (one `add` + one `add_objective` per objective).
- **SeedRollTable** — `{ id, name, diceFormula, entries: [{ min, max, text }] }`; every entry needs `min ≤ max`. Bundled tables use contiguous, gap-free bands covering the die.
- **SeedEncounter** — the `Encounter` core (`id, name, description, monsters: [{ monsterId, count }], difficulty, levelRange, totalXP`); `monsterId` must exist in the monster index.
- **SeedRule** — `{ id, name, description?, category: combat|exploration|social|rest|other }`.

## Authoring + using

- **Create one:** Campaign detail page → **Export Seed Pack** (extracts lore/NPCs/arcs/tables/tone/opening
  scene + non-completed quests; excludes all play-state + secrets).
- **Use one:** the campaign wizard's optional **Seed Pack** step (for a new campaign), or the detail
  page's **Apply Seed Pack** (merge into an existing campaign, per-section checkboxes).
- **Hand-author:** write the JSON above (bare, no envelope) and import it from either entry point.

## What a pack never contains

`aiDm` (and its API keys), `players`, `journal`, `maps`, `inviteCode`, `metrics`, `savedGameState`,
`permissions`, `calendar`, `customAudio` — excluded **by construction** in `extractSeedPackFromCampaign`,
so a shared pack can never leak a key or a save.
