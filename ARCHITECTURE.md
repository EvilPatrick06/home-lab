# Architecture — home-lab monorepo

**Canonical protocol + diagrams:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Domain boundary (BMO ↔ DND)

| Domain | Path | Runtime |
|--------|------|---------|
| VTT (D&D app) | `dnd-app/` | Electron + React (DM/player machines) |
| Voice assistant | `bmo/pi/` | Python Flask (Pi 24/7) |

**Coupling:** HTTP only — VTT → BMO `:5000`, BMO callbacks → VTT `:5001`. **No** TypeScript `import` of `bmo/`, no Python import of `dnd-app/` sources. Shared contract = HTTP + manually mirrored shapes (see `dnd-app/src/shared/`, BMO clients).

**Configs:** Keep at domain roots (`dnd-app/*`, `bmo/*`). Full tree map: [`.cursorrules`](.cursorrules) (Repository Structure).

**Quarantine:** Dead/uncertain code → `_archive/<preserved-relative-path>/`. Non-source bloat (caches, old logs) → `_archive_system_cleanup/` only when separated from code archives (explain in commit/summary).

## Run / verify

```bash
cd dnd-app && npm test && npm run lint && npx tsc --noEmit
cd bmo/pi && ./venv/bin/python -m pytest
```
