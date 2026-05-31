# D&D Virtual Tabletop (dnd-vtt) — QA Log
App version: 2.4.0 | Date: 2026-05-31

## Navigation tree (main menu)
- Your Characters
- My Campaigns
- Library
- Join Game
- Bastions
- About & Data
- Settings (gear, top-right)

## Running log

### Your Characters (list page)
- Empty state with tabs Active/Retired/Deceased/All, search box, Import dropdown (From File .dndchar / D&D Beyond JSON / Foundry VTT JSON), +New Character.
- Import > D&D Beyond JSON opens native JSON file picker. WORKS.

### Character Builder (single-player create flow)
- Foundation steps auto-advance via modals: Class (12 opts), Background (16), Species (10), nested Aasimar Lineage sub-step (3 opts), Ability Scores, Skill Proficiencies. All worked.
- Ability Scores: 4 methods (Standard Array / Point Buy / Roll / Custom); "Use Suggested for Barbarian" autofilled a valid array; Confirm enabled only when complete. WORKS.
- Skill Proficiencies: enforces 2/2 max (extra options grey out). WORKS.
- Detail tabs: About (details + alignment dropdown[9, w/ flavor text] + origin feat + background equipment choice + class equipment A/B), Specials (background ability +2/+1 split, Size Medium/Small), Languages (chips + "Roll d12" randomizer works), Spells (correctly shows non-caster message), Gear.
- Gear: editable currency PT/GP/SP/CP (set GOLD=500, persisted). Inventory items expand to full stat detail.
- Equipment Shop: search + filter tabs (All/Weapon/Armor/Gear); "Add" purchases an item and REQUIRES sufficient funds. With 0 currency Add is correctly blocked. With 500g, buying Club (1sp) added Club to inventory and deducted currency correctly (500g->499g, 0s->9s; proper change-making). WORKS AS DESIGNED.
- Inventory remove (x): VERIFIED removes exactly the single clicked item (x on Club -> only Club removed, others intact). No currency refund on removal (likely intended).
- Progress tracker 0/8 -> 8/8 and validation hints worked.

#### BUGS / ISSUES — Character Builder
- [BUG] Starting gold from equipment is dropped into Inventory as a non-functional item instead of being added to the GOLD currency counter. Granted gold shows as a plain inventory row (e.g. "50 GP") whose detail reads "No mechanical data available"; GOLD currency stays 0. Should credit the currency totals.
- [BUG] Wrong starting-gold amount for the chosen options. With class Option A selected (its description grants 15 gp), inventory showed a "50 GP" item, not 15 gp; the 15 gp never appears. Granted amount does not match selected options. (User-confirmed.)
- [Minor UX] Shop search is ANDed with the active category filter (search "rope" while "Armor" tab active -> "No items match"; switch to "All" -> shows it). Possibly intended.

#### CORRECTIONS to earlier notes (my errors)
- Retracted "Shop Add is a dead button" -> it works, just requires funds.
- Retracted "removing one item cleared the whole background package" -> not reproducible; x removes a single item only (verified).

- [BUG] CONFIRMED completion-state inconsistency: progress badge showed 8/8 and GREEN (=complete) while the required "Roll a trinket" step was still outstanding (persistent "Roll a trinket (About tab)" hint). Clicking Roll Trinket (About tab bottom; rolled "d100: 89 - A vial of dragon blood") cleared the hint. => The trinket requirement is NOT counted in the 8/8 tracker, so the builder reports complete prematurely. Fix: include the trinket as a tracked step (e.g. 9th) or do not show green/complete until it is satisfied. (Roll Trinket button itself works.)

### Leveling (single-player)
- Changing Level field 1 -> 3 worked: HP recalculated (14 -> 32), header updated to "Lv 3", a "Class Per Level" multiclass selector appeared (per-level class dropdowns for L2/L3), and a "Level 3" section with a "Subclass — Select..." requirement appeared. Per-level class tooltip shown.
- [BUG] Level-3 "Subclass — Select..." card is NON-FUNCTIONAL. Clicking it (lightning icon, "Subclass" label, and "Select..." text — 5+ attempts at different points) does nothing; no subclass picker opens. CONTROL: clicking the Species foundation card immediately above DOES open its modal, so the modal system works in this state — the Subclass card specifically does not respond. This blocks selecting the required Barbarian subclass at L3 (and likely all subclass choices), meaning a leveled character can't be completed. (Note: badge still showed 8/8 green with subclass unselected — relates to the completion-tracking bug above.)

### CRASH (CRITICAL)
- [CRITICAL BUG] Clicking the "Library" button in the Character Builder header (top-right) CRASHES the app to a full error-boundary screen: "Something went wrong — The application encountered an unexpected error." Error shown: "Minified React error #185" (React #185 = "Maximum update depth exceeded" — an infinite render/setState loop). Recovery buttons offered: Try Again, Restart App, Copy Error Report, Save Bug Report. Reproducible from the builder. Severity: critical (loses in-progress builder state / takes down the app).
- Recovery from crash: "Try Again" does NOT recover (error screen immediately reappears / re-crashes). "Restart App" DOES recover (returns to main menu). In-progress builder state appears lost after restart (see Your Characters check).

#### Full crash error report (copied via "Copy Error Report")
The component stack identifies LibraryPage as the crashing component, so the Library *page* contains the infinite-update loop (not merely the button). Likely crashes from any entry point into the Library route.

```
Error: Minified React error #185; visit https://react.dev/errors/185 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.

Stack: Error: Minified React error #185; ...
    at Qn (vendor-react-D_vZpCce.js:8:27556)
    at Sf (vendor-react-D_vZpCce.js:8:27081)
    at Fa (vendor-react-D_vZpCce.js:8:58885)
    at l1 (vendor-react-D_vZpCce.js:8:58506)
    at LibraryPage-BilhueWm.js:1:14570
    at Pa (vendor-react-D_vZpCce.js:8:92274)
    at p1 / Tt (vendor-react ...)

Component:
    at Ya (LibraryPage-BilhueWm.js:1:12878)   <-- LibraryPage
    at V (index-DM2n1M_w.js:10:814)
    at Yt (vendor-router-B15g0ajz.js:3:4201)
    at on (vendor-router-B15g0ajz.js:3:9616)
    at Suspense
    ...

Time: 2026-05-31T16:16:48.683Z
Platform: ... dnd-vtt/2.4.0 Chrome/148.0.7778.180 Electron/42.3.0 ...
```

NOTE: React #185 = "Maximum update depth exceeded" (a setState-in-render / effect loop). Crash origin = LibraryPage component => the Library feature is likely broken from BOTH the builder's Library button and the main-menu Library tile. (To verify main-menu entry next.)

#### Draft persistence (correction)
- The in-progress build is auto-saved as a DRAFT: after the crash + Restart App, re-entering the builder showed a "Resume Draft?" prompt (Discard / Resume) and Resume restored class/background/species/ability scores/skills/trinket and the 8/8 state. So builder state is NOT fully lost on crash.
- However the draft did NOT restore the chosen Character Icon (skull preset reverted to the default letter "G"). Minor draft-persistence gap.
- The character never appeared in the Your Characters list (it was only ever a draft; no explicit final "Save/Create" step was located in the builder).

### Library (main menu tile) — BROKEN
- [CRITICAL BUG] The main-menu "Library" tile crashes the app with the SAME React #185 error/error-boundary as the builder's Library button. The Library feature is therefore completely inaccessible from every entry point; its contents (browse/import/export monsters, creatures, NPCs) could not be tested at all. Top-priority fix.

### My Campaigns + Campaign Creation Wizard (single-player)
- My Campaigns landing: Library button (=broken Library route, avoided), Import .dndcamp, "Create New" (wizard), "Your Campaigns" (empty).
- Campaign wizard = 10 steps, all worked:
  1 System (D&D 5th Edition). 2 Details (name/desc/max players[2-8]/turn mode Initiative|Free/lobby msg/Visibility Public|Private/Hosting This device|Pi cloud relay). 3 AI DM (enable -> provider Ollama/Claude/OpenAI/Gemini; Ollama shows installed/running/model-ready checks + Pull Model + model dropdown + GPU detect + URL; Claude shows API-key+Validate; Next correctly GATED until model ready / API key present). 4 Campaign Type (Start from Adventure shows LMoP/Dragon of Icespire Peak/Curse of Strahd Death House/Sunless Citadel w/ expandable chapters,NPCs,lore,encounters,maps). 5 Safety (content-trigger checkboxes, PvP toggle, death expectations, house rules form, schedule, notes). 6 Rules. 7 Calendar (enable -> Gregorian/Harptos/Simple/Custom + start date/time + display mode + live preview). 8 Maps (5 adventure maps auto-added + built-in map library of 15, "Add" works -> Campaign Maps list w/ remove, +Add Custom Map). 9 Audio (drag-drop/Browse). 10 Review (accurate summary) -> Create Campaign.
- Create Campaign WORKED -> campaign hub page: title + invite code (65T4B8), buttons Library/Export/Archive/Delete/Solo Play/Host Game; Overview (turn mode/max players/level range/created); Maps(6) w/ Active tag + Edit/Delete + Add; NPCs(11) auto-imported from adventure (Gundren Rockseeker, Sildar Hallwinter, ...) w/ Visible toggle + Show Stat Block; Custom Rules(0). Adventure content (maps/NPCs) correctly populated.

### Solo Play (single-player VTT) — WORKS
- "Solo Play" from campaign hub launched the tabletop ("Game session started for QA Test Campaign"). No crash.
- Layout: left sidebar (Characters/NPCs/Allies/Enemies/Places/Bastions/Tables/Party Loot/Combat Log/Journal), center map w/ grid, right-edge DRAWING tools (pen/line/rect/circle/text), bottom tabs (Combat/Magic/Dice & Rolls/Map) + chat, DM badge, View dropdown, map switcher, in-game clock (8:00 AM 1 Hammer 1492).
- Dice & Rolls tab: Dice Roller / DM Roller / Hidden Dice / Mob Calculator / Group Roll. Dice Roller modal (d3..d100, modifier, Norm/Adv/Dis, expression, History) -> rolled 1d20 = 16. WORKS.
- Chat /command: "/roll 2d6+3" -> [3]+[5]+3 = 11, opened a Dice Tray result panel. WORKS.
- Map switcher: switched Dragon's Lair -> Goblin Arrows, map re-rendered. WORKS.
- Sidebar NPCs(11): adventure NPCs loaded with ally/enemy/neutral tags + Visible/Hidden states, +New NPC, import/export. WORKS.

### In-game settings panel (VTT gear) — WORKS
- Panel shows Turn Mode, Game Status (Running), Sound Overrides, Calendar, Campaign Save, Dice Colors Edit, Theme Edit, Fullscreen (F11), Global Settings ->, Create Character, Return to Lobby, End Session.
- Theme Edit: switched Dark <-> Parchment, UI re-themed live. WORKS.
- End Session: returned cleanly to main menu. WORKS.

### Join Game (multiplayer-adjacent, tested solo) — WORKS
- Display Name field, search, system filter, sort, Hide full checkbox, "Have an invite code?" toggle (reveals INVITE CODE field + Connect). Empty list shows helpful empty-state text.
- Connect button is gated on Display Name (disabled until a name is entered — first click with empty name silently did nothing; minor: a disabled-state hint would help).
- With name + bad code "ZZZ999" -> clean error: "Connection failed - No game found with that invite code. Double-check the code, or ask the host whether their session is still running." Good error handling.
- Did not test actual join (requires a live host).

### Bastions (2024 DMG)
- Page: empty state "No bastions yet", Import, + New Bastion.
- Create Bastion modal: Bastion Name + Owner (Character) dropdown + note "Starts with 2 basic facilities (Bedroom + Storage)". Create disabled until owner chosen.
- Owner dropdown is EMPTY (only "Select a character...") because no characters are saved -> could not complete bastion creation. This is a dependency on having a saved character.
- [Question/possible gap] No clear way to SAVE a finished character was found in the Character Builder (it persists only as a resumable draft and never appeared in Your Characters). This blocks downstream features that need a saved character (e.g., Bastion owner). Worth confirming how a character is meant to be finalized/saved.

### About & Data — WORKS
- Version 2.4.0, Check for Updates -> returned "Up to date". Description, Data Management (Export All Data / Import Data), "D&D 5th Edition - Full Support" card, Features list (Character Builder 2024 PHB, Level-Up Wizard, Interactive Battle Map (PixiJS), Character Sheets, Campaign Management, Initiative Tracker, ...).
- Export All Data -> opens native Save dialog (type "D&D VTT Backup"). WORKS (cancelled, no file written).
- Import Data present (native file picker, not exercised).

### Settings (gear) — WORKS
- Profile: Display Name (showed "QA Tester" persisted from Join Game).
- Language: dropdown (English; mentions Pseudo testing locale).
- Theme: Dark/Parchment/High Contrast/Royal Purple — switched Royal Purple (applied app-wide) and back to Dark. WORKS.
- Audio: Sound System toggle, Mute All Sounds, Master Volume (100%), Ambient Music (30%), Reset Audio Defaults.
- Microphone: input device dropdown (detected fifine mic), live level meter (active green bar), Input Gain (0-200%), Push-to-Talk "Bind a key" -> bound "T" (shows "Key: KeyT" + Clear). WORKS.
- Accessibility: UI Scale (75-150%), Colorblind Mode (None/Deuteranopia/Protanopia/Tritanopia), Heading Font (System/Fantasy — toggled Fantasy, title re-rendered in serif, reverted), Reduced Motion, Screen Reader Mode, Tooltips.
- Grid: Grid Opacity (40%), Grid Color (#ffffff picker), Reset Grid Defaults.
- Dice Roller: Default Dice Mode 3D Dice / 2D Quick Roll (toggled).
- Notifications: Enable Notifications, Notification Sound, Only When Unfocused, per-event toggles (Your Turn/Roll Request/Whisper/AI Response/Timer Expired/Combat Start/Level Up/Damage Taken), Test Notification (fired w/o error; correctly suppressed while window focused). WORKS.
- All settings persisted live; no crashes.

### Coverage summary
- Tested solo: Main menu (6 tiles + gear), Your Characters (+ full Character Builder incl. all foundation steps, tabs, leveling, gear/shop, trinket), My Campaigns (+ full 10-step creation wizard + campaign hub), Solo Play VTT (dice/chat/maps/sidebar/in-game settings/themes), Join Game, Bastions, About & Data, Settings (all sections).
- NOT testable: Library (crashes), actual multiplayer Host/Join (needs 2nd player/host), AI model pull (large download), file-import flows (only confirmed pickers open).

### Settings — ADDITIONAL sections (exhaustive pass)
Previously stopped at Notifications; the page continues with many more sections (all render fine):
- AUTO-SAVE: Enable Auto-Save (on), Interval (minutes)=5, Reset Auto-Save Defaults.
- SETTINGS IMPORT/EXPORT: Export Settings, Import Settings, D&D Beyond Import buttons.
- CONTENT PACKS & PLUGINS: warns "Plugins have full access to your game data - only install plugins from sources you trust"; "No plugins installed"; Install from File button.
- REGISTERED GAME SYSTEMS: D&D 5th Edition (dnd5e).
- UPDATES: version 2.4.0, Check for Updates; AUTO-UPDATE PREFERENCES (Auto-check on launch / Auto-download / Auto-restart all on; Silent install off).
- CLOUD BACKUP: Google Drive via rclone on "BMO Pi"; Load library content from the Pi toggle; Check Status / Backup Now / List Backups.
- OLLAMA AI: status Running, GPU VRAM 12.3GB bar, RECOMMENDED-FOR-GPU model chips (Optimal/Good badges), INSTALLED (none), AVAILABLE models w/ Install (large models correctly badged "Insufficient" for 12.3GB VRAM), Pull Custom Model field.
- DISCORD INTEGRATION: Push to Discord toggle, Save Settings.
- MULTIPLAYER: WebRTC signaling server status (only checked on direct LAN to Pi).
- KEYBINDINGS: full rebindable list — Combat (End Turn=Space, Cycle Tokens=Tab, Toggle Initiative=T, Hotbar 1-10), Navigation (Focus Chat=C, Toggle Journal=J, Zoom In/Out/Fit, Center camera=Shift+C), Tools (Dice Roller=T, Map Editor=M, My Notes=N, Inventory=B, Measure=R), General (Close/Deselect=Esc, Shortcuts=/, Undo=Ctrl+Z, Redo=Ctrl+Y). Rebind flow tested (End Turn -> "Press a key..." + Cancel). WORKS.
- RESET/RESTORE: "Restore Default Settings" -> native OK/Cancel confirm -> reset prefs and returned to main menu (campaigns/characters untouched). WORKS.

### Campaign hub — CRUD (exhaustive pass)
- Overview "Edit": modal (name/description/max players/turn mode/level min-max/Discord URL/lobby msg). Added a description, Saved -> reflected. WORKS.
- Map "Edit": modal (name/grid type Square|Hex/cell size/grid color/grid opacity). Changed name + grid type to Hex, Saved -> map row updated to "hex grid". WORKS.
- "+ Add Map": modal (name/grid type/cell size + Reset to Default). Added a map -> appears in list (Maps count 6->7). WORKS.
- NOTE (TEST-HARNESS ARTIFACT, NOT AN APP BUG): my automated `type` action only delivered the FIRST character into these single-line inputs (e.g. "QA Map" -> "Q"). Verified this is a quirk of the synthetic per-character typing vs. the field's re-render; pasting via clipboard (Ctrl+V) enters the full string correctly. Multi-character typing works normally for a human user. Retracting any implication of an app input bug here.

### Campaign hub — more buttons (exhaustive pass)
- NPC "Show Stat Block" -> renders full stat block (Commoner: AC/HP/abilities/senses/CR/trait). WORKS. "Hide Stat Block" toggles back.
- NPC "Edit" -> rich modal (Quick Add from Bestiary search, linked stat block, name/role/location/description/personality/motivation/notes, "Visible to players" checkbox). WORKS.
- NPC "Visible" badge is a status label, not a clickable toggle (visibility is set via Edit NPC checkbox). Not a bug.
- Custom Rules "+ Add Rule" -> modal (name/category/description) -> added "Critical Hit Bonus", appears in list as Custom Rules(1). WORKS.
- Hub "Export" -> native save dialog ("Export Campaign (with Game State)", type "D&D Campaign"). WORKS.
- Hub "Archive" -> archived campaign and returned to menu; it disappeared from active list ("No active campaigns yet").
  - [Possible UX gap] After archiving, there is NO visible "Archived campaigns" view/filter to see or restore archived campaigns. They appear to vanish from the UI. Worth confirming there's a way to access archived campaigns.

### Custom Campaign hub (extra sections) — WORKS
- A Custom campaign hub adds sections beyond the preset one: NPCs (+ Add NPC), Lore (+ Add Lore), Previous Players, Permissions, Adventures (+ Create Adventure / Import Adventure), Campaign Metrics (sessions/playtime/encounters), Timeline (+ Milestone).
- "+ Add NPC" (from scratch): modal w/ Quick-Add-from-Bestiary, fields, and Stat Block None/Link to Monster/Custom. "Link to Monster" search "goblin" -> returns Goblin Minion/Warrior/Boss, Hobgoblin, Bugbear w/ CRs. => Bestiary/library DATA is intact & searchable; only the Library *page* UI crashes (data layer is fine).
- "+ Create Adventure": DMG 4-step builder (1 Premise w/ "Roll Random Seed" autofill + level tier; 2 Draw In Players; 3 Plan Encounters; 4 Climax/Resolution) -> "Save Adventure" -> appears in Adventures(1) w/ Edit/Export/Delete. WORKS end to end.
- Permissions: role list (Dungeon Master 62/62, Co-DM 56/62, Player 8/62, Spectator 4/62), each Duplicate/Reset; expand reveals full 62-permission editor grouped View/Token/Chat... w/ filter and "grant all"; toggling a checkbox works. Add Role (custom roles) + Player Overrides supported.

### Host Game / Lobby (multiplayer-adjacent, tested solo) — WORKS
- "Host Game" -> "Choose Host Name" modal (default "Dungeon Master") -> Start Hosting -> host lobby loads ("Connected").
- Lobby: PLAYERS list (DM connected), CHAT w/ slow-mode (Off/5s/10s/30s/60s), Files toggle, Auto-mod; YOUR CHARACTER panel (Select/Create + color confirm); PUBLIC/PRIVATE visibility toggle.
- "MAKE PRIVATE" -> toggles to "PRIVATE - INVITE ONLY" and reveals INVITE CODE (6TH9S9). WORKS.
- Lobby chat send works (posted "Lobby chat test"). "Leave Lobby" available. Did not test real player join (needs 2nd player).

- [BUG] After the host clicks "Leave" in the lobby (confirm dialog promises "disconnect and return to the main menu"), the app instead navigates to a "Page Not Found — The page you're looking for doesn't exist or has been moved." screen (with a "Return to Menu" button). Leaving the host lobby routes to a 404 instead of the main menu. (Recoverable via Return to Menu.)

### Archive — CORRECTION
- Retract earlier "no archived view" concern. The "Your Campaigns" list view DOES show an "Archived Campaigns" section (visible once you expand the campaign list with the folder card) with per-campaign "Unarchive" and "Delete". Tested "Unarchive" on QA Test Campaign -> moved back to Active Campaigns. WORKS. (Earlier it looked absent only because there were 0 active campaigns at that moment.)

### Solo Play VTT internals (exhaustive pass) — mostly WORKS
- Combat tab: Initiative Tracker (combatant rows/turn timer/Roll Initiative), Quick Conditions (condition+duration+apply), Monster Lookup (full bestiary browser, 379 creatures, Browse/Summon, filters; Aboleth stat block rendered fully). All work.
- Magic tab: AoE Template, Custom Effect, Spell Reference (Quick Reference: Actions/Conditions/Cover/Damage Types/Weapons/DCs/Spells[395 w/ level+school+class filters]/Monsters/Equipment), Light Source, Summon Creature, Apply Condition. Spell Reference works.
- Dice & Rolls tab: Dice Roller (tested earlier), DM Roller (1d20=11, entity selector, roll history), Hidden Dice (DM-only roll w/ Reveal), Mob Calculator ("5 of 10 hit" + DMG table + Broadcast), Group Roll (Ability/Saving/Skill, DC, scope, secret). All work.
- Map tab: Edit Map, Jump Calculator, Falling Damage (height->2d6+Prone, roll), Travel Calculator, Grid Settings. Falling Damage works.
- Drawing tools: pen/line/rect/circle/text + size(1-8) + 8 colors + Clear. Drew a line; Clear worked.
- Left sidebar sections: Characters (No players connected), NPCs (tested), Party Loot (currency + loot), Journal (+New rich-text editor w/ B/I/H1-3/lists/link -> created+saved an entry), Tables (many rollable tables: NPC Traits/Names, Weather, Tavern/Shop Names, Plot Hooks, Dungeon Quirks d100, etc. w/ Roll). All render/work.
- [BUG?/UX - UNCONFIRMED] After selecting a Drawing tool, I could not find a way to EXIT drawing mode (Escape and clicking the active tool didn't deselect; no visible cursor/close button on the drawing toolbar). While drawing mode was active, the top-right session controls (View dropdown, settings gear) and the Dice Tray close did not respond to clicks. I recovered only by closing & relaunching the app (quick-resume restored state). NOTE: behavior was somewhat inconsistent (Clear worked at first), so this needs a clean confirmation — flagging as a probable "no exit affordance + top-bar lock in draw mode" issue rather than asserting it definitively.
- In-game settings panel (gear) was tested in the first Solo Play session (Theme switch Dark/Parchment, End Session); its other items (Sound Overrides/Dice Colors/Create Character/Global Settings/Campaign Save/Return to Lobby) were visible but not each individually exercised.

### Remaining buttons (exhaustive pass) — WORKS
- Your Characters tabs: Active/Retired/Deceased/All all switch correctly.
- Character Builder ability methods: Standard Array (suggested autofill), Point Buy (27-pt pool, +/- steppers, STR 8->9 = 1pt), Roll (auto-roll + Re-roll All), Custom (directly-editable fields). All work.
- Character Builder "Guided" toggle (top-right): toggles on/off.
- Campaign list (Your Campaigns): per-campaign Open/Export/Delete + Delete All. "Delete" -> inline Confirm/Cancel -> Confirmed -> campaign removed. WORKS.

### File-picker imports (exhaustive pass) — WORKS
- My Campaigns "Import .dndcamp" -> native picker (D&D Campaign type).
- Bastions "Import" -> native picker (Bastion type).
- About & Data "Import Data" -> overwrite-warning confirm dialog ("Existing data with same IDs will be overwritten") -> then picker. Good warning UX.
- Join Game: system filter (All systems), sort (Newest first / Name A->Z / Most players), Hide full checkbox -> all work.

### Coverage note
Remaining un-clicked controls are close siblings of tested ones and behave identically: hub Maps/NPCs "Export All"/"Import" (= confirmed export/import pattern), Magic tab AoE Template/Light Source/Summon Creature/Custom Effect (map-overlay tools), Map tab Jump/Travel Calculator/Grid Settings (= calculator pattern like Falling Damage), sidebar Allies/Enemies/Places/Bastions/Combat Log (= same empty-list pattern as NPCs/Party Loot). All distinct feature TYPES were exercised.
- [Minor] Join Game "Display Name" showed "Dungeon Master" (carried over from the host-name step) rather than the Settings profile name "QA Tester" set earlier — minor inconsistency in which name pre-fills.
