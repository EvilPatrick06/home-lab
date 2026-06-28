# Attribution & Licensing — Dungeon Table Online

This file documents the third-party content attribution for the app. It is the
canonical source for the attribution strings shown in the UI and store listing.

## CC-BY-4.0 attribution (System Reference Document)

For content drawn from the SRD, the app displays the following attribution
(required by CC-BY-4.0 section 3a):

> This work includes material from the System Reference Document 5.2 ("SRD 5.2")
> by Wizards of the Coast LLC, available at <https://www.dndbeyond.com/srd>.
> The SRD 5.2 is licensed under the Creative Commons Attribution 4.0
> International License, available at
> <https://creativecommons.org/licenses/by/4.0/legalcode>.
>
> Material from the SRD 5.1 (where used) is likewise © Wizards of the Coast and
> licensed under CC-BY-4.0.
>
> This work has been modified from the original SRD (reformatted into structured
> data, abridged, and adapted for app use).

The "modified from the original" line satisfies CC-BY's requirement to indicate
that changes were made.

## Trademark / Fan Content notice

> Dungeon Table Online is unofficial Fan Content and is not affiliated with,
> endorsed, or sponsored by Wizards of the Coast. Dungeons & Dragons and D&D are
> trademarks of Wizards of the Coast LLC. © Wizards of the Coast LLC.

## Where attribution appears (coverage audit, 2026-06-28)

| Surface | Status |
|---|---|
| Desktop/web About page (`src/renderer/src/pages/AboutPage.tsx`) | Full CC-BY string + Fan Content Policy + trademark notice. ✓ |
| Mobile Settings screen (`mobile/src/screens/SettingsScreen.tsx`) | Updated to the full CC-BY string + trademark notice (was a one-line summary). ✓ |
| Play Store listing (`mobile/docs/play-store/STORE-LISTING.md`) | "not affiliated" + open-license note. ✓ |
| Public privacy page (`privacy.html`) | "not affiliated" footer. ✓ |
| i18n locale strings (`src/renderer/src/i18n/locales/*.json`) | `srdAttributionLabel`, `trademarkNotice`, `gameContentNotice` present (en, es). ✓ |

## IMPORTANT — what CC-BY-4.0 and Fan Content do and do not cover

CC-BY-4.0 only licenses the material **that is actually in the SRD** (SRD 5.1 /
SRD 5.2). It does **not** license:

- Text or stat blocks taken from the **full** copyrighted rulebooks (Player's
  Handbook, Dungeon Master's Guide, Monster Manual) that is **not** part of the
  SRD.
- **Product Identity** — creatures and IP that WotC deliberately excluded from
  the SRD (e.g. Beholder, Mind Flayer, Githyanki, Slaad, Modron, Yuan-ti). These
  are under **no** Creative Commons license, and the WotC Fan Content Policy does
  **not** grant the right to redistribute rules text or stat blocks.

Therefore attribution is **necessary but not sufficient** for a public release.
See **`mobile/docs/play-store/SRD-AUDIT-2026-06-25.md`** — that audit found the
bundled dataset is currently tagged to the full 2024/2025 core books and includes
Product-Identity stat blocks, which must be removed/replaced with SRD-only content
before publishing, regardless of attribution.
