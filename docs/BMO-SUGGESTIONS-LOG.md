# BMO Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — BMO-domain only.**
>
> Sibling logs:
>
> - dnd-app suggestions → `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`
> - BMO active bugs / debt → `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - Security concerns (global, any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule:** `Domain: bmo` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to BMO behavior → mirrored here AND in `SUGGESTIONS-LOG-DNDAPP.md` where cross-tooling rules touch dnd-app too.

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-22] Remove stale one-off `dev/patch_*.py` + `revert_power.py` app.py-mutating scripts

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` holds six throwaway, one-shot scripts that read `../app.py`, do string-replacement surgery on it, and write it back: `patch_debug.py`, `patch_keepalive.py`, `patch_retry.py`, `patch_revert.py`, `patch_wol.py`, and `revert_power.py`. They were all last touched 2026-04-24 to fix the (now-resolved) RCA-TV power/WoL endpoint, and the comments confirm they are single-use migrations ("Revert to POWER for everything - WAKEUP doesn't work on this RCA TV", "Add WoL fallback...", etc.). They are no longer referenced anywhere except the `pi/README.md` directory tree. Keeping live "edit app.py in place" scripts around is a footgun — a future agent could re-run one and silently corrupt `app.py`.

**Proposed fix / improvement:**
- [ ] Confirm the corresponding changes are already merged into `app.py` (they are — the TV power work is resolved).
- [ ] Delete the six scripts, or move them under `_archive/` if history is wanted.
- [ ] Drop their line from the `pi/README.md` directory tree.

**Related files:** `bmo/pi/dev/patch_debug.py`, `bmo/pi/dev/patch_keepalive.py`, `bmo/pi/dev/patch_retry.py`, `bmo/pi/dev/patch_revert.py`, `bmo/pi/dev/patch_wol.py`, `bmo/pi/dev/revert_power.py`, `bmo/pi/README.md`

---

### [2026-06-22] Consolidate scattered systemd `.service` units into one location

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
Four tracked systemd unit files live in two different directories. Three sit together in `bmo/pi/kiosk/` (`bmo-kiosk.service`, `bmo-dm-bot.service`, `bmo-social-bot.service`) alongside `install-kiosk.sh`, while a fourth — `bmo-ide.service` — sits off on its own in `bmo/pi/ide_app/`. There is no single place to look for "what units does this host run", and the kiosk installer can't pick up the IDE unit. Either co-locate all units (e.g. a `bmo/pi/kiosk/` or new `bmo/pi/systemd/` dir) or document why the IDE unit is intentionally separate.

**Proposed fix / improvement:**
- [ ] Pick a canonical home for unit files (likely `bmo/pi/kiosk/` since the installer is there, or a dedicated `systemd/` dir).
- [ ] Move `ide_app/bmo-ide.service` there (update any install script / docs that reference its path).

**Related files:** `bmo/pi/ide_app/bmo-ide.service`, `bmo/pi/kiosk/bmo-kiosk.service`, `bmo/pi/kiosk/bmo-dm-bot.service`, `bmo/pi/kiosk/bmo-social-bot.service`, `bmo/pi/kiosk/install-kiosk.sh`

---

### [2026-06-22] `dev/` benchmark layout is inconsistent (loose files vs `benchmarks/` subdir)

- **Category:** debt
- **Severity:** low
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
`bmo/pi/dev/` keeps four benchmarks as loose files at its root (`benchmark_audio.py`, `benchmark_full.py`, `benchmark_llm.py`, `benchmark_personality.py`) while two others live in a `dev/benchmarks/` subdir (`gemini_stream_probe.py`, `thinking_budget_sweep.py`). Diagnostics were already consolidated into `dev/diagnostics/` in a prior pass, so the half-migrated benchmark split is the odd one out. Moving the four loose `benchmark_*.py` into `dev/benchmarks/` would make `dev/` uniform (benchmarks/, diagnostics/, ai-temp/ + true dev tools at root).

**Proposed fix / improvement:**
- [ ] Move `dev/benchmark_*.py` into `dev/benchmarks/` (rename to drop the `benchmark_` prefix, or keep it — just be consistent).
- [ ] Update any docs/README tree references.

**Related files:** `bmo/pi/dev/benchmark_audio.py`, `bmo/pi/dev/benchmark_full.py`, `bmo/pi/dev/benchmark_llm.py`, `bmo/pi/dev/benchmark_personality.py`, `bmo/pi/dev/benchmarks/`

---

# Design gotchas (warnings for future agents)

### [2026-06-22] Two IDE implementations coexist — the production IDE is `web/` + `routes/ide.py`, NOT `ide_app/`

- **Category:** design-gotcha
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
There are two separate, diverged IDE frontends in the tree, which is easy to confuse:
- **Production** — served by the main app: `app.py` `@app.route("/ide")` renders `web/templates/ide.html`, backed by the `/api/ide/*` blueprint in `routes/ide.py`, using assets under `web/static/ide/` (`ide.css` ~1751 lines, `ide.js` ~2622 lines, `sw.js`). Runs on :5000.
- **Experimental rebuild** — `ide_app/` ("BMO IDE Test App … A brand-new IDE built from scratch") is a standalone Flask+SocketIO app on :5001 (`ide_app/ide_app.py`, its own `bmo-ide.service`) with its OWN copies of the assets (`ide_app/static/css/ide.css` ~1140 lines, `ide_app/static/js/ide.js` ~1695 lines, `ide_app/templates/ide.html`).

The two asset trees have already diverged (different sizes + md5s), so a fix applied to one will not reach the other. A future contributor editing `ide_app/` expecting it to change the live `/ide` tab (or vice-versa) will be surprised. **Decide the status of `ide_app/`:** if the rebuild is the future direction, plan the cutover and retire the `web/`-based IDE; if it's a stalled experiment, archive `ide_app/` so there is a single source of truth.

**Proposed fix / improvement:**
- [ ] Document which IDE is canonical (in `pi/README.md`), and label `ide_app/` clearly as experimental/WIP or archive it.
- [ ] Avoid maintaining two diverging copies of `ide.css`/`ide.js`/`ide.html` long-term.

**Related files:** `bmo/pi/app.py` (`/ide` route), `bmo/pi/routes/ide.py`, `bmo/pi/web/templates/ide.html`, `bmo/pi/web/static/ide/`, `bmo/pi/ide_app/ide_app.py`, `bmo/pi/ide_app/static/`, `bmo/pi/ide_app/templates/ide.html`, `bmo/pi/ide_app/bmo-ide.service`

> Standing warnings also live in the phase plans' Research notes under `dnd-app/docs/phases/` and in `bmo/docs/DESIGN-CONSTRAINTS.md`.

---

# Info / Observations

### [2026-06-22] Misspelled static asset filename `PrimeVIdeo.png`

- **Category:** debt
- **Severity:** info
- **Domain:** bmo
- **Discovered by:** bmo-cleanup
- **During:** Automated cleanup scan of the bmo/ tree.

**Description:**
The TV-app launcher image `bmo/pi/web/static/img/PrimeVIdeo.png` has a capitalization typo (`VIdeo` instead of `Video`). It works today because `web/templates/index.html:1163` references it with the exact same misspelling, but the inconsistent casing is a small naming smell next to its siblings (`Netflix.png`, `YouTube.png`, `Plex.png`, etc.) and is a portability hazard on case-sensitive vs case-insensitive filesystems. Low priority — only worth fixing alongside other `index.html` asset churn (rename file + update the one `<img src>`).

**Related files:** `bmo/pi/web/static/img/PrimeVIdeo.png`, `bmo/pi/web/templates/index.html`

---

> dnd-app suggestions: `[SUGGESTIONS-LOG-DNDAPP.md](./SUGGESTIONS-LOG-DNDAPP.md)`. BMO bugs: `[BMO-ISSUES-LOG.md](./BMO-ISSUES-LOG.md)`. Security: `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
