# dnd-vtt — Fresh QA run (errors + ideas only at end)
Started: full restart, every page/button.

## Findings (raw)

## CONFIRMED ISSUES (PC / Character Sheet)
- [BUG - CRITICAL] Character Sheet page is COMPLETELY FROZEN / non-interactive. From Your Characters, clicking the saved character opens the sheet, but NOTHING on the page responds: Edit, Short Rest, Long Rest, Level Up (top bar) do nothing; the section collapse arrows (SKILLS ^) do nothing; even the 'Back' nav does nothing. No dialogs, no navigation, no state change anywhere. The page is hung — only recoverable by closing/relaunching the app. Verified across 6+ controls with user observing live. (Earlier I wrongly called Short Rest 'works' — it does not.)
- [QUALITY - layout overlap] Character Sheet top toolbar OVERFLOWS / overlaps. Buttons Edit / Short Rest / Long Rest / Re-Make Character / Level Up / Print / History + gear are crammed; "History" is truncated to "Histc" and collides with the settings gear at the right edge.

## PROCESS NOTE
- Going forward: state expected outcome before each click; verify the actual concrete change (dialog/nav/value); a focus/hover highlight is NOT success; "no observable change" = unresponsive finding, not a pass. Also actively check every screen for overlapping/clipped/crammed controls (quality issues even if not functional bugs).

## CONFIRMED ISSUES (Character Builder)
- [BUG/QUALITY - layout overlap] When the build is complete, the green "Save Character" button in the top-right header OVERLAPS / collides with the "Library" button — the Library pill renders on top of the green Save button, obscuring its label. Because Library sits over Save, it's hard to click Save without hitting Library (which crashes the app). Confirmed via zoom. (This is the "Save Character button overlaps" the user reported.)
- Build flow note: a completed Lv1 character requires Class, Background, Species (+lineage), Ability Scores, Skills, Specials (ability bonus + size), equipment choices (incl. Holy Symbol variant), alignment, trinket roll, AND 2 languages. The 8/8 badge does not clearly account for languages/trinket (validation hints drive completion instead).

## CONFIRMED (continued)
- [BUG - CRITICAL, confirmed universal] The Character Sheet hang is NOT character-specific. Built a brand-new character ("QA Save Test"), Save Character -> navigates straight to its sheet -> that sheet is ALSO fully frozen (SKILLS collapse arrow dead, Edit dead). So saving a character drops you onto a hung, unusable sheet every time. Verified on 2 separate characters + user watching.
- [BUG/QUALITY - sticky tooltip] In the Character Builder Languages tab, hovering a language shows a tooltip (e.g. "Draconic - Script:...") in the TOP-LEFT corner that stays stuck on screen across subsequent steps/screens until navigation; it doesn't dismiss on mouse-out.
- [POSITIVE/expected] "Save Character" -> "Incomplete Character Details" dialog correctly lists blank optional fields (Gender/Age/etc.) and offers Go Back / Save Anyway. (Works; the only issue is the button overlap making Save hard to click.)

## CONFIRMED ISSUES (Solo Play / VTT)
- [BUG/QUALITY - layout overlap] VTT top-right controls OVERLAP: the "Alerts" button, the "Reset View" icon, and the settings gear collide — the Reset View icon renders on top of the "Alerts" label and is jammed against the gear. (User-identified the 3 specific controls; confirmed via zoom. I initially/incorrectly called this 'a bit cramped' — it is an actual overlap.)
- [QUALITY - clipped tab] VTT bottom tab bar (Combat / Magic / Dice & Rolls / Map) is too narrow — the "Map" tab is clipped/truncated at the right edge by default.
- [QUALITY - cramped] The numbered hotbar (1-0) and the "Share Macros" / collapse-chevron row sit crammed against the bottom edge of the map view.
- [VERIFIED working] VTT bottom tabs DO respond (clicking "Dice & Rolls" changed the panel to Dice Roller/DM Roller/Hidden Dice/Mob Calculator/Group Roll) — i.e. the VTT is interactive, unlike the frozen Character Sheet.
