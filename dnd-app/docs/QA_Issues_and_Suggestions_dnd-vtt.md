# D&D Virtual Tabletop (v2.4.0) — Issues & Suggestions

## BUGS

### Critical
- **Character Sheet page is completely frozen / unresponsive.** Opening any saved character's sheet (from Your Characters, or right after "Save Character") renders the sheet but NOTHING on it responds: Edit, Short Rest, Long Rest, Level Up, Print, the section collapse arrows, and even "Back" all do nothing — no dialog, no navigation, no state change. The page is hung; only an app restart recovers it. Verified on two separate characters. Because saving a character drops you onto this sheet, the sheet is effectively unusable. (Note: it does not throw the error-boundary; it silently hangs.)
- **Library crashes the entire app.** Opening Library throws React error #185 ("Maximum update depth exceeded" — infinite render loop) and hits the "Something went wrong" error boundary. Reproducible from the main-menu Library tile and the Library buttons in the builder / campaign hub. "Try Again" does not recover (re-crashes); only "Restart App" works. The whole Library is inaccessible. (Underlying data is fine — monsters/spells load in Monster Lookup and Spell Reference; the bug is the Library page UI.)

### Layout / overlapping & clipped controls (quality)
- **Builder: "Save Character" overlaps "Library".** When a build is complete, the green Save Character button in the top-right collides with the Library button (Library renders on top of it, hiding its label) — and because Library sits over Save, it's hard to click Save without hitting Library (which crashes).
- **Character Sheet: top toolbar overflows.** Edit / Short Rest / Long Rest / Re-Make Character / Level Up / Print / History + gear are crammed; "History" is clipped to "Histc" and collides with the settings gear.
- **VTT (in-game): top-right controls overlap.** The "Alerts" button, the "Reset View" icon, and the settings gear collide — Reset View renders over the Alerts label and is jammed against the gear.
- **VTT: bottom tab bar clips "Map".** The Combat / Magic / Dice & Rolls / Map tab strip is too narrow, so the "Map" tab is truncated. The numbered hotbar and the Share-Macros/collapse row are also cramped against the bottom edge of the map.

### Navigation
- **Leaving the host lobby goes to "Page Not Found."** The confirm dialog promises "disconnect and return to the main menu," but "Leave" routes to a 404 (recoverable via "Return to Menu").

### Character Builder
- **Completion badge (8/8) is misleading.** It shows green/"complete" while required steps remain (trinket roll, languages, and the L3 subclass aren't reflected in the count); actual completion is driven by separate validation hints instead. Save should be gated on all required choices.
- **Starting gold is mishandled / inconsistent.** Granted gold from equipment shows up as a plain inventory item (e.g. "50 GP", detail "No mechanical data available") rather than (or in addition to) the GOLD currency, and the amount doesn't match the chosen options (class Option A should give 15 gp; a "50 GP" item appeared). On the saved sheet, currency showed 15 gp AND a separate "50 GP" item.
- **Level-3 "Subclass — Select…" doesn't open a picker** (the adjacent Species card opens fine) — blocks selecting a required subclass at L3.
- **Sticky tooltip.** In the Languages tab, a language's hover tooltip (e.g. "Draconic — Script:…") gets stuck in the top-left corner and persists across later steps/screens until navigation; it doesn't dismiss on mouse-out.
- **Draft doesn't restore the chosen icon** after a crash/restart (reverts to the default letter).

### Characters list / editing
- **Editing a saved character is effectively blocked.** The card's pencil-style icon is actually **Export** (.dndchar), not Edit (confusing — pencil implies edit); there's no inline Edit on the card, and the only "Edit" lives on the Character Sheet, which is frozen. So a saved character can't be edited.

### Minor
- **Join Game "Connect" gives no feedback when disabled** (gated on Display Name; clicking with an empty name does nothing).
- **Join Game "Display Name" pre-fills with the host name** ("Dungeon Master") instead of the Settings profile name.
- **DM Roller's "Roll History" panel stays empty** after a roll (the result goes to the global Dice Tray instead).

---

## SUGGESTIONS / IDEAS

### Stability / robustness
- Wrap each route/page in its own error boundary so a broken page (Library) or a hung page (Character Sheet) can't take down or freeze the whole app; make "Try Again" actually remount the failed subtree.
- Diagnose the Character Sheet hang as a priority — it silently blocks the core "view my character" flow and the post-save destination.
- Extend the bug report (Copy/Save) to include the current route and last action for faster triage.

### Layout / responsive audit
- Do a pass for overlapping/clipped controls across window sizes: Save-vs-Library (builder), the Character Sheet toolbar (History/gear), the VTT top-right (Alerts/Reset View/gear), and the VTT bottom tab strip (Map). Likely flex/absolute-positioning or z-index issues; add wrapping/overflow handling and a visual-regression check.

### Character Builder / economy
- Credit granted gold to the currency totals (PT/GP/SP/CP) with correct per-option amounts; if a record is wanted, log it in notes rather than as a non-functional inventory item.
- Make the completion tracker count every required choice (trinket, languages, subclass, per-level features) and disable "Save Character" until all are satisfied; keep the "Incomplete (optional) details" warning for flavor fields.
- Add an inline **Edit** action on the character card (and use a clearer icon for Export, since a pencil reads as edit).
- Dismiss the language tooltip on mouse-out and anchor it to the hovered item.

### VTT usability
- Give drawing mode an explicit exit/cursor tool and ensure top-bar controls stay clickable while drawing.
- Echo calculator/table-roll results inline (toast/in-panel), not only into a chat/tray that may be hidden behind a modal.
- Let the DM Roller's Roll History reflect its own rolls.

### Polish
- Show tooltips/hints on disabled buttons (e.g., Join "Connect") explaining what's missing.
- Pre-fill Join Game's Display Name from the Settings profile name.
- Add confirm/undo for destructive bulk actions ("Delete All").
