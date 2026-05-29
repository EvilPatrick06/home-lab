# Changelog

All notable changes to the D&D Virtual Tabletop are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Codebase hardening sweep (Phases 17–22): IPC error containment, security
  hardening (encrypted secrets, plugin integrity, upload magic-byte checks, AI
  file-scope), packaging path fixes, GUI/accessibility polish, CI pipeline, and
  leak cleanup. See `dnd-app/docs/phases/` for the per-phase breakdown.

## [2.1.39]

Baseline release. Electron desktop VTT for D&D 5e: PixiJS map rendering,
cannon-es/Three.js 3D dice, peerjs multiplayer, optional BMO Pi voice/AI
integration, plugin system, and a 5e content library.

[Unreleased]: https://github.com/EvilPatrick06/home-lab/compare/v2.1.39...HEAD
[2.1.39]: https://github.com/EvilPatrick06/home-lab/releases/tag/v2.1.39
