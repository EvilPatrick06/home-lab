# dnd-app — open work

What still needs doing. NOT here: completed work (commits + GitHub releases), info/architecture notes, and things that are correct-by-design.

Everything actionable in the backlog has been worked through and shipped. What remains is one optional enhancement and one correct-by-design item:

- **Managed/baked TURN server** (optional). Users can add their own TURN via Settings → Multiplayer, and off-LAN games route through the Pi relay by default — so a baked managed TURN only matters for someone who wants *serverless* off-LAN P2P behind symmetric NAT with zero config. Carries cost + credential management.
- **1 remaining dpdm "cycle"** (`ai-service → context-builder → campaign-context → campaign-storage`) is a deliberate, documented dynamic `import('../ai/ai-service')` in campaign-storage (remove a deleted campaign's AI conversation). It's the correct runtime-safe escape hatch, not a static cycle — dpdm just counts the dynamic edge. Leave it.

> Done this cycle (commits/releases are the record): registry + 5e-library + sounds moved to main-process IPC (renderer makes no broad http/ws to the Pi; CSP dropped the broad scheme-sources); ship-thin installer with a download-on-demand sound cache; 19 of 20 circular cycles broken; hosting_mode passthrough; TURN settings UI exposed; cloud-backup (BMO /api/rclone + client upload/restore + oversize guard + named restore list); BMO /api/sounds; pseudo-locale removed (en+es); magic-numbers/biome/number-input-a11y cleanups.
