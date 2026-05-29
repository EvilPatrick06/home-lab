# Changelog

All notable changes to the D&D Virtual Tabletop are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.2]

Bug-fix + hardening release. Closes the Critical/High/Medium audit backlog plus
user-reported issues.

- **Fixed:** crit damage with multiple dice now doubles every die group
  (`doubleDiceInFormula` was missing its regex `g` flag — Sneak Attack, Smite,
  multi-die magic weapons under-rolled).
- **Fixed:** encounter presets honour pre-positioned monster coordinates instead
  of re-scattering them via auto-placement.
- **Fixed:** `/sound ambient` chat command now syncs volume to players.
- **Fixed:** **Reset All Data** now actually wipes file-based saves
  (characters/campaigns/homebrew/library/…) via a new `WIPE_ALL_DATA` IPC, clears
  in-memory state, and wipes localStorage. (Reference PDFs in `core_books` are
  preserved.)
- **Added:** "Start Ollama" button in Settings when Ollama is installed but
  stopped; the stopped-state version badge no longer shows a meaningless
  `vunknown`.
- **Security:** BMO sync receiver hardened (loopback bind, body cap, rate limit,
  Zod payload validation, optional Bearer auth); IPC handlers run through a
  validated `withSchema` wrapper; permission-gate sweep replaces `role==='host'`
  literals with `hasPermission`.
- **Build:** Anthropic SDK 0.78 → 0.100.1; 13 renderer-only libraries moved to
  `devDependencies`; content-schema validator fixed and wired into CI.

## [2.2.1]

- **CI:** fixed the `dnd-app-ci.yml` "no skipped tests" grep walking into a
  binary PNG and failing every push.
- Consolidated the dnd-app phase plans into a single review report under
  `dnd-app/docs/phases/`.

## [2.2.0]

Feature release — Phases 14–29 landed since 2.1.39.

- **Packaging (Phase 14):** Ollama unbundled — Windows installer dropped from
  1.65 GiB to ~230 MB; first-run Ollama prompt + Settings install button;
  differential downloads re-enabled; silent/visible install bug fixed; parallel
  4-job release pipeline.
- **GUI/UX (Phase 18):** Lucide icon migration, font-size + touch-target sweep,
  z-index constants, local Cinzel font, screen-reader auto-detect.
- **Level-up (Phase 24):** subclass persistence, per-class hit dice, half-caster
  L1 slot fix, multiclass skills, spell swap, cantrip picker, feat validation.
- **Encounters (Phase 26):** smart token placement, "Place All & Start
  Initiative", encounter waves.
- **Audio (Phase 27):** dice sounds, custom-audio network sync, ambient playlist,
  fade-abort, live volume.
- **AI (Phase 28b):** Claude 4.x models, prompt caching, model-aware max_tokens.
- **Permissions (Phase 29):** data-driven role system + per-player overrides + UI.
- **Library (Phase 15):** library is the single source of truth for 5e content
  (dormant v4 migration framework).
- Plus the Phase 17–22 codebase hardening sweep (IPC error containment, security
  hardening, packaging path fixes, accessibility, CI pipeline, leak cleanup).

## [2.1.39]

Baseline release. Electron desktop VTT for D&D 5e: PixiJS map rendering,
cannon-es/Three.js 3D dice, peerjs multiplayer, optional BMO Pi voice/AI
integration, plugin system, and a 5e content library.

[2.2.2]: https://github.com/EvilPatrick06/home-lab/releases/tag/v2.2.2
[2.2.1]: https://github.com/EvilPatrick06/home-lab/releases/tag/v2.2.1
[2.2.0]: https://github.com/EvilPatrick06/home-lab/releases/tag/v2.2.0
[2.1.39]: https://github.com/EvilPatrick06/home-lab/releases/tag/v2.1.39
