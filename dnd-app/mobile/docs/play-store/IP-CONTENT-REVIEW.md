# SRD / IP & Content-Policy Review (pre-publish gate)

The app bundles ~3,041 JSON files of tabletop RPG rules content. Before
publishing to Google Play, confirm the licensing and policy posture. **This is a
blocking checklist — do not publish until each item is resolved.**

## 1. Rules content licensing

- [ ] Confirm every bundled rules file derives from openly licensed material
      (e.g. the **SRD 5.1 under CC-BY-4.0** / SRD 5.2 under CC-BY-4.0), not from
      copyrighted sourcebooks.
- [ ] Provide the required **CC-BY attribution** for SRD content (in-app About
      screen + store listing). Include the exact attribution string the license
      requires.
- [ ] Remove or replace any Product Identity / trademarked names, monsters, or
      settings that are not covered by the open license.
- [ ] Audit `src/renderer/public/data/**` for non-SRD homebrew/imported content
      that may not be redistributable.

## 2. Trademark & "not affiliated" posture

- [x] The store listing and About screen state the app is **fan-made and
      not affiliated with or endorsed by Wizards of the Coast / Hasbro**
      (in-app Settings + STORE-LISTING.md draft).
- [ ] Avoid implying official status in the app name, icon, or screenshots.
- [ ] Do not use the "D&D" logo or other protected marks in store assets.

## 3. Google Play policy surface

- [ ] **Impersonation / IP policy:** the listing must not suggest official
      endorsement.
- [ ] **User-generated content (multiplayer chat):** provide a way to report/
      block and a content policy (Play requires UGC moderation affordances).
      Confirm the in-session kick/ban + an abuse contact satisfy this.
- [ ] **AI-generated content:** if AI DM ships enabled, review Play's generative-AI
      policy (offensive-content safeguards, user reporting).
- [ ] **Account deletion:** Play's data-deletion policy is satisfied by on-device
      wipe + uninstall; document it in the listing's data-deletion URL.

## 4. Monetization

- [ ] If the app is free with no IAP, declare so. If any paid/donation flow is
      added later, it must use Google Play Billing where required.

## Decision log

Record the outcome (links to license texts, attribution strings used, any files
removed) here before flipping the production track from draft to live.
