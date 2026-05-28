# Bastion data rule

> Contributor rules for the Bastion domain (`stores/bastion-store/`, `pages/bastion/`,
> `pages/BastionPage.tsx`, `types/bastion.ts`). Landed as part of Phase 15 (Library as
> Single Source of Truth). Read before touching Bastion code.

## The invariant

Bastion records hold **references + runtime state**, never embedded library data.

A bastion stores facility *instances*. Each instance references its *definition*
(description, available orders, charm, costs, prerequisites, hireling count) by a
stable id — it never copies the definition's fields inline. Definitions are loaded
once into a single collection; every consumer reads the live definition through that
collection. One developer fix to a facility definition reaches every bastion that
references it, with no migration and no reload.

This is the Bastion-domain expression of the Phase 15 single-source-of-truth invariant
documented in `src/renderer/src/services/library/README.md`.

## How it works today

| Concept | Lives where | Example |
|---|---|---|
| Reference | `SpecialFacility.type: SpecialFacilityType` (a stable string id) | `'arcane-study'` |
| Definition (canonical data) | `SpecialFacilityDef` loaded into `useBastionStore.facilityDefs` via `load5eBastionFacilities()` | description, `orderOptions`, `charm`, `hirelingCount`, `prerequisite` |
| Runtime / instance state | Sibling fields on the instance | `enlarged`, `currentOrder`, `orderStartedAt`, `hirelingNames`, `creatures`, per-instance config (`gardenType`, `chosenTools`, …) |

Hydration is the lookup `facilityDefs.find((d) => d.type === facility.type)` (see
`pages/bastion/FacilityTabs.tsx`, `FacilityModals.tsx`, `BastionTurnModal.tsx`,
`stores/bastion-store/facility-slice.ts`). Because `facilityDefs` is the live loaded
collection, an edit to a definition is reflected the next time any consumer reads it.

## Rules

1. **Reference definitions by id.** A facility instance carries `type` (and any chosen
   sub-config such as `gardenType`/`trainerType`); it must not copy `description`,
   `orderOptions`, `charm`, `permanentBenefit`, or any other definition field onto the
   instance. Read those live from `facilityDefs`.
2. **Runtime state lives in sibling fields, never in the reference.** Current order,
   order start time, enlargement, assigned hirelings, menagerie creatures, treasury,
   turns, construction, charms — all are instance state on the `Bastion`/`SpecialFacility`
   record. Never fold runtime state into the definition lookup, and never mutate a
   definition to express per-instance state.
3. **Load definitions through the data provider, not raw JSON.** Use
   `load5eBastionFacilities()` / `load5eBastionEvents()` (`services/data-provider.ts`).
   Do not `import` or `fetch` `public/data/5e/bastions/**` from a Bastion component,
   page, or store slice. The library boundary test
   (`services/library/library-boundary.test.ts`) fails CI on raw `public/data` imports
   and `/data/5e/**` fetches outside the allowlist.
4. **Handle a missing definition gracefully.** `facilityDefs.find(...)` can return
   `undefined` (definitions not loaded yet, or a homebrew/plugin facility type that was
   removed). Render an explicit fallback; never crash and never substitute placeholder
   definition data.
5. **The boundary test must pass before merge.** Adding a new facility type, order, or
   data file does not exempt you from the rule — wire it through the data provider /
   library store like every other category.

## Where the UI lives

The Bastion UI is `pages/BastionPage.tsx` plus `pages/bastion/*` (overview, basic/special
facility tabs, defenders, turns/events, facility/turn/defense/treasury modals, create
modal). It is registered at route `/bastions` in `App.tsx`. There is no separate
`components/bastion/` directory — Bastion is a page-level feature, and all of its views
already hydrate definitions by id per the rules above.
