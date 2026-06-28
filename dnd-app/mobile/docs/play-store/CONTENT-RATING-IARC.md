# Play Console — IARC Content-Rating Questionnaire answers

Draft answers for the IARC questionnaire in Play Console (Policy → App content →
Content ratings). Verify against the final build before submitting; Google/IARC
hold you to these. **Submission is gated on SRD-AUDIT-2026-06-25.md — do not
complete the rating until the IP blocker is resolved.**

Category selected at the start: **Game** (Reference/Role-playing). If listed as a
non-game utility, answer the equivalent "App" branch — the substantive answers
below are the same.

## Violence
- Does the app contain violence? **Yes — mild, fantasy, text-only.** The bundled
  rules reference combat (attack rolls, damage, monsters) as tabletop game
  mechanics. There is **no realistic violence, no blood/gore depiction, no
  graphic imagery** — references are textual rules content and stylized tokens.
- Realistic/graphic violence? **No.**
- Violence toward humans/animals depicted? **No** (abstract fantasy creatures,
  text and tokens only).

## Sexual content / nudity
- **None.**

## Language
- Profanity? **None** in app content. (Multiplayer chat is user-generated — see
  "Interactivity"; the questionnaire treats UGC separately.)

## Controlled substances
- References to alcohol/tobacco/drugs? **No** beyond incidental fantasy flavor
  (e.g. a tavern setting); no use is depicted or encouraged. Answer **No** unless
  Play's wording specifically captures fantasy alcohol references, in which case
  **mild/incidental, fantasy context**.

## Gambling
- Real-money gambling? **No.**
- Simulated gambling? **No.** Dice are core RPG mechanics, not casino/wagering
  simulation; there is no betting, no virtual currency staking.

## Fear / horror
- Some fantasy monster/undead themes (text + tokens). **Mild**, not realistic
  horror imagery.

## Interactivity (this drives much of the rating)
- Users can interact / communicate with other users? **Yes** — real-time
  multiplayer chat and shared game actions, peer-to-peer.
- Users can share their location with other users? **No.**
- Does the app share user-provided personal information with third parties?
  **No** (P2P only; see DATA-SAFETY.md).
- User-generated content shared between users? **Yes** (chat, shared character/map
  data). Moderation affordances: in-session kick/ban by the host; abuse contact
  via the support email. (Confirm these satisfy Play's UGC requirement.)
- Unrestricted access to the internet / built-in browser? **Yes** — the app
  renders its UI in a WebView and uses the internet for multiplayer and optional
  backends. Declare this; it can raise the rating.

## Digital purchases / ads
- In-app purchases? **No** (free app, no IAP).
- Advertising? **No ads, no ad SDKs.**

## Miscellaneous
- AI / user-generated/generative content? **Optional, off by default.** The AI
  Dungeon Master feature only runs if the user enables it and supplies their own
  model/API key. If shipped enabled by default in a future build, re-answer and
  review Play's generative-AI policy.

## Expected outcome
Likely **Teen (ESRB) / PEGI 12** territory, driven primarily by **user
interaction (unmoderated chat) + unrestricted internet**, with mild fantasy
violence as a secondary factor. The exact certificates are assigned by IARC from
the answers — record them in the Decision log of IP-CONTENT-REVIEW.md once
generated.
