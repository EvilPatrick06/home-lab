# `_archive/` — Quarantined Code

This directory holds files that were removed from active use but preserved for audit / recovery. **Not** the same as git history — these still exist on disk in the current tree.

**Non-source bloat** (old venvs, caches): `_archive_system_cleanup/` at repo root — gitignored except its README; not mixed with code archives here.

## Why not just delete?

- Fast recovery if something was removed by mistake
- Audit trail for "wait, where did X go?"
- Protects against accidental re-creation of deleted-but-needed utilities

## What's inside

Organized by cleanup batch:

```
_archive/
├── 2026-04-24-dead-code/     unused renderer components + duplicate MountModal + unwired plugin-runner (see README inside)
└── 2026-04-reorg/              cleanup done during monorepo restructure (2026-04-23)
    ├── root-junk/              old files that shouldn't have been at repo root
    │   ├── fan_control.py      duplicate of bmo/pi/hardware/fan_control.py (older version)
    │   ├── fix-imports.js      one-shot migration script (run once, done)
    │   ├── replace-keys.js     one-shot migration script (run once, done)
    │   ├── dxdiag.txt          Windows GPU diagnostic (not needed on Pi)
    │   ├── lint-{diag-lines,full,full-after-fix,latest}.txt   stale lint output
    │   └── test-results{,-latest}.txt                         stale test output
    │
    ├── scripts-junk/           scripts dir cleanup
    │   ├── complete_excel_skill_review.py    Windows-only (uses win32com)
    │   ├── tmp-refactor-atomic.ts            one-shot migration (done)
    │   ├── ultimate-audit-v2.ts              superseded by v3 then ultimate-audit.ts
    │   └── ultimate-audit-v3.ts              superseded by ultimate-audit.ts
    │
    ├── bmo-junk/               stray BMO files at wrong paths
    │   ├── bmo.js.stray        older dup of bmo/pi/web/static/js/bmo.js
    │   └── index.html.stray    older dup of bmo/pi/web/templates/index.html
    │
    ├── pi-deploy-old/          old scripts/pi-deploy/ (duplicate vtt_sync.py)
    │   ├── README.md
    │   ├── vtt_sync.py         byte-identical to bmo/pi/agents/vtt_sync.py
    │   └── (apply_patch.py was moved to bmo/pi/scripts/ instead of archived)
    │
    └── old-bmo-standalone/     stale Python files from preexisting /home/patrick/bmo/
        ├── app.py              Mar 19 copy (before OS migration)
        ├── agents/             Mar 19 copies
        ├── calendar_service.py, location_service.py, monitoring.py, weather_service.py
        ├── config/             old config skeleton
        ├── scripts/
        ├── static/, templates/ old UI
        ├── hey_bmo.onnx, hey_bmo.onnx.data  old wake model
        ├── e2e_test.sh, health_check.sh
        └── CLOUDFLARE_TUNNEL_SETUP.md      superseded by bmo/docs/ version
```

## Restoration

If you need to restore something from here:

```bash
# Move back to canonical location
git mv _archive/2026-04-reorg/<category>/<file> <destination>

# Commit with reasoning
git commit -m "chore: restore <file> from archive — <why>"
```

If it turns out an archive wasn't useful:

```bash
git rm -r _archive/2026-04-reorg/<category>
git commit -m "chore: permanently delete archived <category>"
```

## Age-out policy

- **< 30 days:** keep without review
- **30-180 days:** review once per cleanup cycle; delete if definitely unused
- **> 180 days:** candidate for permanent deletion (can still be recovered from git history)

Next review: 2026-10-23 (6 months from creation).

## Rules for adding new archives

1. Create a dated sub-directory: `_archive/YYYY-MM-<reason>/`
2. Organize by category if moving multiple kinds of files
3. Update this README with what's in the new archive + why
4. Git-move files (preserves history): `git mv <path> _archive/...`

## NOT archived (deleted outright)

Some things were deleted without archiving because they were never useful:

- `scripts/fedora-migration/` — 12 Windows→Fedora OS migration files (entire dir, useless on Pi post-migration)
- `Tests/knip-report.json`, `Tests/TestAudit.md` — audit output files (regenerable)
- `buildspec.yml`, `AWS_SETUP_GUIDE.md` — AWS-specific, not using AWS
- `__pycache__/*.pyc`, `.pytest_cache/` — always regenerated
- 6 `.bak` files under `bmo/pi/` — manual backups with timestamps, redundant with git

These are only retrievable via git history (pre-`f5d49cd` commit).
