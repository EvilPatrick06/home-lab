# `_archive_system_cleanup/` — local non-source bloat

**Purpose:** Hold regenerated or machine-local junk (old venv trees, cache dumps, huge logs). **Split from** `_archive/` — that bucket is for **tracked** code quarantine + audit trail in git.

**Git:** Contents under here are **ignored** (except this README). Do not commit 100MB+ venv copies.

**Restore:** Move directory back to its original path (see batch notes in git commit / summary).

## 2026-04-24

| Moved from | Reason |
|------------|--------|
| `bmo/pi/venv.broken.20260423/` | Broken backup venv (~288MB); not the active `bmo/pi/venv/`. **Removed from disk** after review to reclaim space (recoverable only if you still had a copy elsewhere). |
