# QA Report — D&D Virtual Tabletop (dnd-vtt)

**App version:** 2.4.0 · **Platform:** Windows (Electron 42 / Chromium 148) · **Date:** 2026-05-31
**Scope:** Exhaustive single-player pass — every reachable screen visited and effectively every button/control exercised at least once. Actual multiplayer host/join (with a second player) was not performed, but all multiplayer-adjacent screens were tested solo.

---

## Overall summary

The app is feature-rich and largely solid for single-player. Character creation, campaign creation (10-step wizard, preset & custom), the full campaign hub (CRUD, adventures, permissions, archive/delete), the solo virtual tabletop (dice, combat, magic/spell & monster references, maps, drawing, journal, tables), the host lobby, Join Game, About & Data, and the very large Settings page all work and generally handle validation/errors well.

**One critical issue: the Library feature crashes the whole app from every entry point.** The most important non-crash issues are in the **Character Builder economy/completion** and a couple of **navigation/UX problems** (lobby-leave 404, drawing-mode lock).

**Counts:** 1 critical crash · 3 confirmed functional bugs · 1 navigation bug · ~4 minor/UX · 1 probable-but-unconfirmed issue · plus 1 open question.

---

## Bugs & issues by screen

### [CRITICAL] Library — completely broken
- **Opening Library crashes the app** (React error #185 = "Maximum update depth exceeded" / infinite render loop) to the full-screen "Something went wrong" error boundary. Reproducible from the **main-menu Library tile**, the **Character Builder Library button**, and the **My Campaigns / campaign-hub Library buttons**. Component stack pinpoints `LibraryPage`.
  - Recovery: "Try Again" does NOT recover (re-crashes); only "Restart App" works.
  - Impact: the entire Library (browse/import/export monsters, creatures, NPCs) is inaccessible.
  - IMPORTANT NUANCE: the underlying bestiary/spell/rules DATA is fine — it loads and is searchable elsewhere (NPC "Link to Monster" search, in-game Monster Lookup = 379 creatures, Spell Reference = 395 spells). So the crash is in the Library PAGE/UI only, not the data layer.
  - Verbatim error:
    ```
    Error: Minified React error #185; visit https://react.dev/errors/185 ...
        at ... LibraryPage-BilhueWm.js:1:14570
    Component: at Ya (LibraryPage-BilhueWm.js:1:12878)  <-- LibraryPage
    Time: 2026-05-31T16:16:48.683Z
    Platform: ... dnd-vtt/2.4.0 Chrome/148.0.7778.180 Electron/42.3.0 ...
    ```

### [HIGH] Character Builder
- **Starting gold is dropped into Inventory as a non-functional item instead of being added to the GOLD currency.** Granted gold shows as a plain inventory row (e.g. "50 GP") whose detail reads "No mechanical data available"; the GOLD counter stays 0.
- **Wrong starting-gold amount for the chosen equipment options.** With class Option A selected (which per its own text grants 15 gp), inventory instead showed a "50 GP" item — the 15 gp never appears.
- **Completion tracker reports 8/8 (green = complete) while a required step is still outstanding.** Confirmed with the "Roll a trinket" step: the 8/8 badge read complete while the trinket was unrolled; rolling it cleared the hint. The trinket (and, at L3, the Subclass) requirements are not counted in the 8/8, so the builder reports "done" prematurely.
- **Level-3 "Subclass — Select…" card is non-functional.** Clicking it never opens a subclass picker (control test: the adjacent Species card opens its modal fine). Blocks choosing a required subclass at level 3.

### [NAVIGATION BUG] Host lobby
- **Leaving the host lobby lands on "Page Not Found" instead of the main menu.** The confirm dialog promises "disconnect and return to the main menu," but the app routes to a 404 ("The page you're looking for doesn't exist or has been moved") with a "Return to Menu" button. Recoverable.

### [PROBABLE / UNCONFIRMED] VTT drawing mode
- After selecting a Drawing tool, I could not find a way to **exit drawing mode** (Escape and clicking the active tool didn't deselect; no cursor/close affordance on the drawing toolbar), and while it was active the **top-right session controls (View dropdown, settings gear) and the Dice-Tray close did not respond**. I had to close & relaunch the app to recover (quick-resume restored state). Behaviour was somewhat inconsistent (Clear worked initially), so this needs a clean repro before being treated as definitive — flagging as a likely "no exit affordance + top-bar lock in draw mode" issue.

### [MINOR / UX]
- Shop search is AND-ed with the active category filter ("rope" + Armor tab = "No items match"; switch to All shows it).
- Join Game "Connect" gives no feedback when disabled (gated on Display Name; clicking with empty name does nothing).
- Character-builder draft doesn't restore the chosen icon after a crash/restart (skull preset reverted to the default letter).
- Join Game "Display Name" pre-filled with the host name ("Dungeon Master") rather than the Settings profile name ("QA Tester") — minor inconsistency.
- DM Roller's own "Roll History" panel stayed "No rolls yet" after a roll (result went to the global Dice Tray instead) — minor.

### [OPEN QUESTION]
- **No clear way to finalize/SAVE a character was found.** The builder persists only a resumable draft; the completed character never appeared in "Your Characters." This blocks downstream features needing a saved character (e.g., the Bastion owner dropdown is empty, so a bastion can't be created). Worth confirming the intended save path.

---

## What worked well (verified)

**Main menu** — all 6 tiles + Settings gear.

**Your Characters / Character Builder** — Import dropdown (3 formats, correct file pickers); tabs Active/Retired/Deceased/All; auto-advancing foundation modals (Class/Background/Species + nested lineage); ALL FOUR ability methods (Standard Array w/ "Use Suggested" autofill, Point Buy 27-pt pool, Roll + Re-roll, Custom editable); Skill 2/2 enforcement; detail tabs (About + alignment, Specials, Languages w/ Roll d12, Spells non-caster message, Gear); editable currency; inventory expand + single-item remove; Equipment Shop purchase with correct currency deduction/change-making; icon Letter/Preset/Upload; Guided toggle; leveling (HP recalc + per-level multiclass dropdowns w/ prerequisites); Trinket roll.

**My Campaigns** — full 10-step creation wizard (preset adventures w/ chapters/NPCs/maps AND custom path), AI-DM provider config with correct gating, calendar w/ live preview, built-in map library; Create succeeds; campaign list (active + archived) with Open/Export/Delete/Delete-All, Quick Resume, Unarchive; Import .dndcamp picker.

**Campaign hub** — Overview Edit, Map Edit/Add (grid type Square/Hex), NPC Show-Stat-Block / Edit / Add-from-scratch (bestiary "Link to Monster" search works), Custom Rules Add, **DMG 4-step Adventure builder** (Roll Random Seed, save), Permissions (62-permission editor per role + custom roles), Export (save dialog), Archive/Unarchive, Delete (inline confirm).

**Host lobby** — Choose Host Name → lobby (players, chat w/ slow-mode/files/auto-mod, character/color panel), Public↔Private toggle + invite code, lobby chat. (Leave → 404 bug noted above.)

**Solo Play (VTT)** — launches cleanly; Combat (Initiative tracker, Quick Conditions, Monster Lookup = 379-creature bestiary w/ full stat blocks); Magic (Spell Reference = full rules + 395 spells, plus AoE/Light/Summon/Effect tools); Dice & Rolls (Dice Roller, DM Roller, Hidden Dice w/ Reveal, Mob Calculator, Group Roll); Map (Edit Map, Jump/Travel calc, Falling Damage, Grid Settings); drawing tools (pen/line/rect/circle/text + sizes + 8 colors + Clear); sidebar (Characters/NPCs/Allies/Enemies/Places/Bastions/Tables[many rollable]/Party Loot/Combat Log/Journal w/ rich-text editor); map switching; live theme switch; chat `/roll`; End Session returns cleanly.

**Join Game** — search, system filter, sort (Newest/Name/Players), Hide-full, invite-code toggle with clean bad-code error.

**About & Data** — Check for Updates ("Up to date"), Export All Data (save dialog), Import Data (overwrite-warning confirm), feature list.

**Settings** (very large, all sections work and persist, no crashes) — Profile, Language, 4 Themes (apply app-wide), Audio, Microphone (live meter + push-to-talk bind), Accessibility (UI scale, colorblind modes, heading font, reduced motion, screen reader, tooltips), Grid, Dice Roller default, Notifications (per-event + Test), Auto-Save, Settings Import/Export + D&D Beyond Import, Content Packs & Plugins (Install from File), Registered Game Systems, Updates + auto-update prefs, Cloud Backup (rclone/Pi), Ollama AI (VRAM-aware model list w/ Install / Pull Custom), Discord integration, Multiplayer/WebRTC status, full rebindable Keybindings, Restore Default Settings (confirm + non-destructive reset).

---

## Not covered (and why)
- **Library contents** — crashes on open.
- **Actual multiplayer Host/Join** — needs a second player/live host.
- **AI model pull / large downloads** — avoided.
- **Real file imports & credential entry** (API keys) — confirmed pickers/flows open; didn't import real files or enter secrets (policy).
- A handful of controls identical to tested siblings (hub Maps/NPCs Export-All/Import, Magic AoE/Light/Summon, Map Jump/Travel/Grid, sidebar Allies/Enemies/Places/Combat Log) — same patterns as items already verified.
