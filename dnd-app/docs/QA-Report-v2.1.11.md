# D&D Virtual Tabletop — QA Report (v2.1.11)

**Build:** v2.1.11 (auto-updated from v2.1.3)
**Date:** 2026-05-16/17
**Scope:** re-test the prior v2.1.3 reds, then explore previously untested ground.

> Only Problems / Suggestions / Untested. Verified-fixed items are omitted by design — see commit history for what passed.

Bug reports captured by the in-app "Save Bug Report" button:
- `dnd-app/docs/fail2.txt` — Return-to-Lobby null deref (NEW)
- `dnd-app/docs/react-185-character-view.txt` — character view infinite loop (NEW, component stack included)

---

## Problems

### Still broken (CRITICAL)

**C-2 still crashes Return to Lobby — different error now.** Repro: My Campaigns → "Test" → Solo Play → top-right gear → Return to Lobby. The error message is no longer `Cannot read properties of null (reading 'remove')` (the v2.1.3 / v2.1.1 site that was patched in MapCanvas / combat-animations). It's now `Cannot read properties of null (reading 'next')`. Reads like a linked-list / iterator walk hitting a nulled node — PixiJS or another library is the most likely source. Saved as `dnd-app/docs/fail2.txt`. **Mitigation for users right now:** use the **End Session** button in the same gear menu — that path cleans up cleanly.

**NEW-1 still crashes the character view (React #185 infinite render loop).** Repro: Your Characters → click the saved "Test Hero" card. Error boundary fires with `Minified React error #185` (Maximum update depth exceeded). Component stack pinpoints **`SheetHeader5e`** as the failing component — likely a zustand selector returning a fresh object reference each call, retriggering `useSyncExternalStore`. The earlier ReadyButton fix (Gavin's commit) was the correct *pattern* but missed this site. Full bug report at `dnd-app/docs/react-185-character-view.txt`. Blocks: viewing characters, attaching to bastions, leveling up, editing — anything past the character list.

---

## Suggestions

UX / GUI:
- **Initiative Tracker** — clicking "+ Add" with an empty Name field creates a phantom blank-name Foe row that silently vanishes when Roll Initiative is pressed. Either disable + Add until Name is non-empty, or show inline validation.
- **In-session gear menu, Turn Mode** drifts. The Test campaign was set to "Initiative" turn mode in its overview, but after one combat round was rolled-then-ended, the gear menu's Turn Mode showed "Free". If that's a deliberate end-of-combat reset, fine — if not, DMs who picked Initiative will be surprised on the next encounter.
- **AoE Template modal** shows "Affected cells: 81" before placement. A live preview overlay on the map (faint outline at the proposed origin) would let the DM aim before committing.
- **Magic tab** has just two buttons (AoE Template, Custom Effect). Feels thin next to Combat and DM Tools, which both have rich sub-actions. Quick-cast from a prepared spell list, surge effects, and concentration tracking would be natural additions.
- **Treasure Generator at CR 0-4 / Individual** outputs only "12 GP" — accurate per the 2024 DMG table but unrewarding as a UX. Worth surfacing the table being rolled ("Individual Treasure: CR 0-4, you rolled 12 GP per the basic-coins entry") so the player understands why it's just coins.
- **Library → Recently Viewed** stays populated across sessions and includes items the user clicked accidentally. Add a "Clear" button on that row, or auto-prune entries not viewed for N days.
- **Campaign invite code** appears to rotate across re-opens (saw `UL7BZC` → `ZF3SZD` between QA sessions). If players bookmark or share the code, it'll break. If rotation is intentional (security), surface that in the UI ("Invite code regenerated — old links no longer work"). If unintentional, persist the code with the campaign.
- **In-session calendar** silently switched from Gregorian to Harptos between QA passes (likely the parallel agent set it). When campaign settings change mid-session, a small toast ("Calendar changed to Harptos — 1 Hammer, 1492") would help the DM notice.

Accessibility:
- **Reduced Motion** toggle in Settings was on through my testing, but 3D dice still bounced. Worth verifying that the toggle actually disables Three.js animation, not just CSS transitions.

Performance:
- Long-running session memory across multiple Solo Play enter / End Session cycles still not stress-tested — has been on the suggestion list since v2.0.0.

---

## Couldn't test

- **Any multiplayer flow** — no second machine in this environment. Join Game UI surface only.
- **Character editing / leveling up / sheet usage** — blocked by NEW-1; the sheet page crashes on open.
- **Bastion creation end-to-end** — needs an openable character (NEW-1 blocks it).
- **Most sidebar entry types** — only NPCs panel surface-tested. Allies, Enemies, Places, Bastions, Tables, Party Loot, Combat Log, Journal still untouched in this pass.
- **DM Tools beyond Treasure / Encounter / AoE** — Whisper, Light Source, Group Roll, Generate NPC, DM Screen, Roll Tables, Party Inventory, AI Triggers, AI Map Analysis, Sentient Item.
- **Map tab tools** — right-rail drawing icons, terrain placement, fog of war.
- **Discord integration** — listed in Settings, didn't engage.
- **Ollama AI integration** — Settings shows "Stopped" with GPU VRAM gauge; didn't start the service.
- **Cloud Backup full round-trip** — Pi unreachable.
- **D&D Beyond JSON import** — option visible, didn't exercise.
- **Plugins / Content Packs** — Settings shows the install slot; no test pack handy.
- **Theme audit beyond Settings + Builder + Library** — High Contrast confirmed legible in Settings, but VTT session in HC theme not exercised.
- **Browser DevTools / source-mapped React frames** — disabled in the production build. The component-stack info in `react-185-character-view.txt` is the best available; with DevTools enabled the SheetHeader5e culprit would be one click deeper.

---

## Test environment

Windows 11 Pro 26200 · primary display SV340ZE 3440×1440 (screenshots captured at 1568×636) · auto-updated v2.1.3 → v2.1.11 between sessions · same `Test` campaign carried over.
