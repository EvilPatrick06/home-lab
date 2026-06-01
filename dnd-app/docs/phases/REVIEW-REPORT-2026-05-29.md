# dnd-app — open work

What still needs doing. NOT here: completed work (see commits + GitHub releases), "needs testing / QA / visual pass / write-a-test" items (the whole app is being tested anyway), and info/architecture notes. Scope: dnd-app + the dnd-app↔BMO protocol overlap.

---

## Code / debt

- **Proxy renderer registry fetches through the main process.** `registry-client.ts` fetches `/api/games*` straight from the LAN Pi, which forces `http:`/`ws:` scheme-sources into the document `connect-src`. Move the REST calls (announce/get/list/heartbeat/deregister) to main-process IPC like cloud-sync; then `connect-src` can drop `http:`/`ws:`. (The SSE `/api/games/stream` is the only awkward one — keep it renderer-side or poll.)
- **Inline style objects → Tailwind classes** (~60 files / ~116 occurrences). Many are genuinely dynamic (PixiJS sizing, drag offsets, runtime colors) and stay inline; convert the static ones.
- **`DmAction` full discriminated union.** Retire the `action-validator.ts` boundary cast — a ~22-file, protocol-shaped change; do it WITH BMO-side protocol coordination (`DmAction` is parsed from AI/LLM + BMO output).
- **~28 eager static-JSON imports → lazy `data-provider` loads.** Some intentionally pair an eager default with an async loader; do only if a bundle-size target is set.
- **`useAsyncData<T>` adoption** — ~39 ad-hoc loaders left to migrate incrementally.
- **Magic numbers → `app-constants.ts`** — file exists, only 2 importers; opportunistic (D&D rule constants shouldn't be hoisted).
- **Rolldown config** — migrate `build.rollupOptions.manualChunks` → `build.rolldownOptions.output.codeSplitting` (build only warns on the compat shim).
- **`throttle` util** — zero production call-sites; remove it or wire a first consumer.
- **20 circular import cycles** (dpdm, non-blocking) — chip away when already editing those files.
- **biome.json** — run `biome migrate` (schema pins 2.4.4 vs CLI 2.4.16) and drop the trailing `/**` on the `!!**/out/**`-style ignore globs (`useBiomeIgnoreFolder`).
- **knip** — add an ignore config for the ~229 keep-intentional exports so the dead-code check reads clean.

## a11y

- **Color-only state indicators** (`MainMenuPage`, `HigherLevelEquipment5e`, `RuleManager`, `TurnEventsTab`, `MacroBar`) — pair color with text/icon/aria.
- **Number-input `aria-label`s** — the a11y sweep mirrored sample-value placeholders, so some number inputs read `aria-label="30"`/`"0"`; give those explicit descriptive labels.

## Multiplayer

- **Registry `hosting_mode` passthrough.** The join transport uses the joiner's own on/off-LAN heuristic, not the host's declared mode, because `game_registry._serialize` drops `hosting_mode`. Wire it through (`_serialize` + announce payload + `RegistryGameEntry`) to fix the one residual mismatch: an on-LAN joiner browsing a cloud-hosted game.
- **Managed/baked TURN** (optional) — would restore true serverless off-LAN P2P for symmetric-NAT peers (currently off-LAN routes through the Pi relay instead).

## Cloud backup

- **Large-campaign cap.** The client archives the whole campaign incl. assets; works up to the `/backup` route's 512 MiB cap (`BMO_MAX_BACKUP_SIZE`), larger campaigns fail. Chunk the upload or cap-with-warning if it bites.
- **Restore list shows the campaign id, not a name** (no name stored in the backup). Write a small `meta.json` beside the archive if a friendly name is wanted.

## Bigger / undecided

- **Large public-dir asset offload.** BMO needs `GET /api/sounds/manifest` + `/api/sounds/file` (the client seam + `docs/ASSET-OFFLOAD.md` are ready) before any clip loads from the Pi; a ship-thin / download-on-demand installer is still undecided.
- **Electron EOL** — bump before E42's ~2026-10-20 EOL when `check:electron-eol` warns.
