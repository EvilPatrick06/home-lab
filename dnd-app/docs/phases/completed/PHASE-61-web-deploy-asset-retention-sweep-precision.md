# PHASE-61 — Web deploy asset retention: reference-aware prune (mtime-sweep precision)

> Authored from the 2026-06-29 WEB-build QA report (Dungeon Table Online, v2.7.0). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Address the **low / debt** deploy-infra finding from the 2026-06-29 v2.7.0 WEB pass — "deployed `assets/` accumulates every prior build's hashed chunks (additive deploy, never purged)" — **after correcting two stale premises in the report** (verify-don't-rebuild). The QA pass was a static + deployed-artifact run that inspected the live serve directory but did **not** read the deploy workflow or the service-worker source, so it over-stated the risk. In reality:

1. The deploy **already prunes** old hashed assets on a bounded 24h retention window (`.github/workflows/dnd-web-deploy.yml`), so the directory does **not** grow unbounded — the 6–8 copies the QA observed are the *expected* contents of a 24h window across ~8 deploys, not a leak.
2. The service worker **does not precache hashed chunks** (`src/renderer/public/sw.js` precaches only the app shell + manifest; hashed assets are fetched cache-first on demand, immutable-by-hash, under a per-version cache namespace evicted on `activate`), so the report's "the more serious latent risk" — a precache pinning a stale chunk hash → version-skew errors — **does not apply** to this SW.

What remains is a **single narrow correctness edge** in the otherwise-sound retention sweep: the prune is purely **mtime-based** (`find … -mmin +RETENTION -delete`), so it is *reference-blind*. It deletes any asset older than the grace window regardless of whether the current `index.html` still references it. The current build's chunks are normally safe (a fresh build stamps fresh mtimes that rsync carries to the Pi), but a chunk that is **byte-identical across many builds** can have its Pi-side mtime age past the window and be deleted while still referenced — a low-probability but real way to 404 a live chunk. This phase records the corrections and (optionally) hardens the prune to be reference-aware. **Low severity; the default disposition is "document the corrections + adopt the small prune-precision hardening."**

## Dependencies & cross-phase notes

- **Direct lineage to PHASE-44 (web-build serving & deploy resilience).** PHASE-44's High finding was the *opposite* failure mode: an aggressive `rsync --delete` removed old hashed chunks an in-flight SPA still imported → `Failed to fetch dynamically imported module` → hard crash. PHASE-44's remedy (retain old chunks; add bounded retention; catch chunk-load failures) **has shipped** — `dnd-web-deploy.yml` now does `rsync -az` (no `--delete`) + a bounded `find -mmin +1440 -delete` sweep (24h grace). So this phase must **not** re-introduce `--delete` or anything that shortens the grace window below a play session's next-lazy-navigation gap — that would regress PHASE-44. The hardening here keeps the grace window and only makes the *prune predicate* reference-aware (keep referenced files even if old; keep last-N generations), which is strictly safer than the current age-only predicate.
- **No app-source change.** The fix surface is the **deploy workflow** (`.github/workflows/dnd-web-deploy.yml`) and possibly a small deploy helper script — infra, not renderer/main. The cheap check is workflow lint / a dry-run of the prune logic, not `tsc`/`vitest`.
- **Independent of PHASE-60/62** (the other two 2026-06-29 v2.7.0 phases) — different surface (CI/deploy vs renderer/i18n). Freely reorderable.
- **Owner-decision flavor (like PHASE-59 WEB-STORAGE-1).** If the owner is comfortable with the age-only sweep's tiny edge-case risk, the corrections alone (documenting that retention + SW are already correct) close the finding and the hardening is optional.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.7.0 / commit `2f9caeaf`) and the live Pi serve directory `/home/patrick/web-apps/DungeonTableOnline/`.

### WEB-DEPLOY-1 (low, debt) — retention sweep is mtime-based (reference-blind); report's "unbounded growth" + "SW precache" premises are stale

**Status: report premises corrected; one narrow residual confirmed.**

**Correction 1 — the deploy is NOT additive-without-pruning.** `.github/workflows/dnd-web-deploy.yml` (the `Rsync build to the Pi` step) deliberately runs `rsync -az` **without `--delete`** (PHASE-44 lineage — deleting old hashed chunks mid-session 404s an in-flight SPA), then runs a **bounded retention sweep**: `find $DEST/assets -type f -mmin +${RETENTION_MINUTES} -delete -print` with `RETENTION_MINUTES=1440` (24h). So stale assets *are* pruned, on a 24h delay. The QA-observed counts (live dir: 929 JS chunks / ~32 MB; 6 `index.web-*.js` entries; 6 `CampaignDetailPage-*.js`) are exactly what a 24h window holds across the recent deploy cadence (entry mtimes spanning ~24h) — **expected**, not unbounded growth. The dir is self-limiting to roughly "one window's worth of deploys."

**Correction 2 — the service worker does NOT precache hashed chunks.** `src/renderer/public/sw.js` (deployed verbatim to `/home/patrick/web-apps/DungeonTableOnline/sw.js`, version-stamped by `scripts/build/finalize-web.mjs`) precaches **only** the app shell on `install` — `cache.addAll([SCOPE_PATH, SHELL_URL, manifest.webmanifest])` — never the hashed `assets/*`. Hashed assets use a **cache-first** strategy fetched on demand (`isAsset(url)` branch), safe because content-hashed names are immutable. Caches are namespaced per app version (`dto-shell-${VERSION}` / `dto-assets-${VERSION}` / `dto-data-${VERSION}`) and the `activate` handler **evicts every non-current `dto-*` cache**. Navigations are network-first with a shell fallback. So a returning PWA user cannot be pinned to a stale chunk hash by a precache manifest — there is no such manifest. The report's flagged "more serious latent risk" does not exist for this SW. (Worth keeping as a regression note: if the SW ever moves to precaching hashed chunks, *that* would reintroduce the risk.)

**Residual (confirmed) — the prune predicate is age-only, hence reference-blind.** The sweep keys solely on mtime (`-mmin +1440`), with no check against the current module graph (`index.html` + the chunks it imports). Normally harmless because a fresh build writes fresh mtimes that rsync (`-a`, which re-transfers when source mtime differs and stamps the Pi copy with the source mtime) carries to the Pi, keeping current chunks "young." The edge case: a chunk **byte-identical across ≥24h of builds** can retain an aged Pi-side mtime (rsync may skip an unchanged file on its size+mtime quick-check, leaving the old Pi mtime); the age sweep would then delete a **still-referenced** current chunk, 404-ing it for live and returning visitors until the next deploy. Low probability (most chunks change hash when content changes; identical-across-24h is uncommon), but it is a genuine way the age-only predicate can remove a live asset.

**Reproduction (residual, by construction):** deploy build A; leave one large vendor chunk byte-identical so its content hash is unchanged for >24h of subsequent deploys; rsync skips re-transferring it (unchanged), so its Pi mtime stays at build A's time; after 24h the sweep matches it (`-mmin +1440`) and deletes it though `index.html` still imports it → `Failed to fetch dynamically imported module` on the next load of that route.

**Expected:** the prune never deletes an asset the current `index.html`/module graph references, regardless of age; genuinely-orphaned old-generation chunks are still pruned (bounded dir).

**Root cause (file:line):** `.github/workflows/dnd-web-deploy.yml`, the retention sweep `find $DEST/assets -type f -mmin +${RETENTION_MINUTES} -delete` — predicate is mtime-only, with no exclusion of currently-referenced files.

Verification:

```bash
# Retention sweep + no --delete (PHASE-44 lineage):
sed -n '/Rsync build to the Pi/,/find .*assets/p' .github/workflows/dnd-web-deploy.yml
# SW precaches shell only, not hashed chunks; versioned caches evicted on activate:
grep -n "addAll\|isAsset\|dto-shell\|dto-assets\|caches.delete\|skipWaiting" dnd-app/src/renderer/public/sw.js
# Live dir is bounded (one window's worth), not unbounded:
ssh patrick@bmo 'ls /home/patrick/web-apps/DungeonTableOnline/assets/index.web-*.js | wc -l; du -sh /home/patrick/web-apps/DungeonTableOnline/assets'
```

**Fix direction (default: corrections + the small hardening; the hardening is the only code change):**

- **Make the prune reference-aware (recommended hardening).** Before the age sweep, compute the set of assets the *current* deploy just shipped — i.e. the files present in `dist-web/assets/` for this build (or, equivalently, the basenames referenced by the freshly-deployed `index.html` and its imported chunks) — and **exclude that set** from deletion (`find … ! -newer … -a` plus a `--exclude`-style guard, or `find` piped through `grep -vF -f current-manifest` before `xargs rm`). Keep the 24h grace for *non-current* generations so in-flight old sessions still resolve their lazy imports (PHASE-44 invariant preserved). Net: current build's assets are never pruned (even if old/unchanged); only genuinely-superseded, past-grace chunks are removed.
- **Belt-and-suspenders (optional): refresh current-generation mtimes post-rsync.** After the rsync overlay, `touch` the just-deployed `assets/*` (or `find dist-web/assets -printf '%f\n'` → `touch` the matching Pi files) so the current generation is always "young" and the age sweep cannot match it. Simpler than a manifest diff; achieves the same safety for the identical-chunk edge case. Either approach (reference-exclude OR touch-current) fixes the residual; do not do nothing-and-shorten-the-window.
- **Document the corrections in the workflow comment** so a future reader (or QA agent) does not re-file "unbounded growth" / "SW precache risk": note that retention is bounded at `RETENTION_MINUTES`, that the SW precaches only the shell (hashed assets are cache-first/immutable, versioned caches evicted on activate), and that the prune is reference-aware after this phase.

**Affected components:** `.github/workflows/dnd-web-deploy.yml` (retention sweep step). Reference only (no change): `dnd-app/src/renderer/public/sw.js`, `dnd-app/scripts/build/finalize-web.mjs`, `dnd-app/src/web/register-sw.ts`.

## Sub-phases

> Per-sub-phase cheap check: this is a **deploy-workflow** change — validate with `actionlint` / a YAML lint on `.github/workflows/dnd-web-deploy.yml` and a local dry-run of the prune predicate against a scratch directory (verify a referenced file survives and an orphaned old file is removed). No `tsc`/`vitest` surface. The live effect is implementer-verified by a deploy run (or a manual prune dry-run on the Pi serve dir).

### 61A — Reference-aware retention prune (WEB-DEPLOY-1)

**Objective:** the deploy retention sweep never deletes a currently-referenced asset; genuinely-stale past-grace chunks are still pruned (dir stays bounded).

**Files:** `.github/workflows/dnd-web-deploy.yml`.

**Steps:**

1. After the rsync overlay, build the current-generation keep-set — the basenames in `dist-web/assets/` for this build (or the chunk names `index.html` imports) — and exclude them from the age sweep (`find … -mmin +${RETENTION_MINUTES}` filtered through `grep -vF -f keepset` before delete), **or** `touch` the just-deployed `assets/*` on the Pi so the current generation is never older than the grace window.
2. Preserve `RETENTION_MINUTES` (24h) and the no-`--delete` rsync — keep PHASE-44's in-flight-session invariant intact.
3. Update the workflow comment to record the two corrections (bounded retention; SW precaches shell only) so the premise is not re-filed.

**Acceptance:** workflow lints clean; a dry-run shows (a) a currently-referenced chunk survives even when artificially aged past the window, and (b) an orphaned old-generation chunk past the window is deleted. A real deploy keeps the serve dir bounded and never 404s a current chunk. Implementer-verified on the Pi serve dir.

## Completed

> _Implemented 2026-07-03 on branch `auto/dnd-phases-5862`._
>
> - **61A** — made the retention prune reference-aware in `.github/workflows/dnd-web-deploy.yml`
>   (the "Rsync build to the Pi" step) via the touch-current-generation approach: after the
>   `rsync -az` overlay, the step now enumerates the basenames in the local `dist-web/assets/`
>   (the current module graph) and `touch -c`es the matching files on the Pi, so the current
>   generation is always younger than the grace window and the age sweep
>   (`find -mmin +${RETENTION_MINUTES}`) can never match a still-referenced chunk — even one
>   rsync skipped re-transferring because it was byte-identical. `RETENTION_MINUTES=1440` (24h)
>   and the no-`--delete` rsync are preserved (PHASE-44 in-flight-session invariant intact).
> - The workflow comment was updated to record the two corrected premises (bounded retention;
>   SW precaches shell only, hashed assets cache-first/immutable under per-version caches evicted
>   on activate) so they are not re-filed as "unbounded growth" / "stale precache".
> - Deploy-workflow only; no app source. Verified: YAML/shell-syntax reviewed; the live effect
>   (a referenced chunk survives past the window; an orphaned old chunk is pruned) is verified by
>   the next deploy run on the Pi serve dir — left for the deploy/integrator pass.
