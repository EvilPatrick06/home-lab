# SRD / IP & Content-Policy Review (pre-publish gate)

The app bundles ~3,041 JSON files of tabletop RPG rules content. Before
publishing to Google Play, confirm the licensing and policy posture. **This is a
blocking checklist — do not publish until each item is resolved.**

## 1. Rules content licensing

> **Resolved by maintainer decision (2026-06-28, Gavin).** The maintainer is
> overwriting the bundled rules dataset with SRD-only content (SRD 5.1 / SRD 5.2
> under CC-BY-4.0), removing/replacing the non-SRD and Product-Identity material
> identified in [SRD-AUDIT-2026-06-25.md](./SRD-AUDIT-2026-06-25.md). Re-run the
> audit script in that doc after the overwrite to confirm source.book is SRD-only
> and the PI scan is empty.

- [x] Confirm every bundled rules file derives from openly licensed material
      (e.g. the **SRD 5.1 under CC-BY-4.0** / SRD 5.2 under CC-BY-4.0), not from
      copyrighted sourcebooks. *(Maintainer overwriting dataset to SRD-only.)*
- [x] Provide the required **CC-BY attribution** for SRD content (in-app About
      screen + store listing). Include the exact attribution string the license
      requires. *(Done — desktop About + mobile Settings + store listing; see
      [ATTRIBUTION.md](../../../ATTRIBUTION.md).)*
- [x] Remove or replace any Product Identity / trademarked names, monsters, or
      settings that are not covered by the open license. *(Maintainer handling in
      the overwrite.)*
- [x] Audit `src/renderer/public/data/**` for non-SRD homebrew/imported content
      that may not be redistributable. *(Audit complete — see SRD-AUDIT-2026-06-25.md.)*

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

- **2026-06-28 — Gavin (maintainer):** Section 1 marked resolved per maintainer
  decision. Maintainer is overwriting the bundled dataset with SRD-only content
  (the non-SRD/PI items flagged in SRD-AUDIT-2026-06-25.md are being removed/
  replaced in that overwrite). CC-BY-4.0 attribution completed across desktop,
  mobile, and store listing (ATTRIBUTION.md). Privacy policy live at
  https://bmo.mybmoai.work/DungeonTableOnline/privacy.html . Confirm the
  post-overwrite audit is clean before flipping the production track to live.
