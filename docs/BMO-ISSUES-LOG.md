# BMO Issues Log

> **Active BMO bugs / tech debt / broken config / perf — domain-scoped to the Pi voice assistant + DM engine + Discord bots (`bmo/`).** Includes Pi-side infra/tooling that BMO depends on (the venv, pip caches, Pi systemd, etc.) since this is the Pi's primary domain.
>
> Sibling logs:
>
> - dnd-app active bugs / debt → `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`
> - BMO future ideas / design gotchas / observations → `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`
> - Security concerns (any domain) → `[SECURITY-LOG.md](./SECURITY-LOG.md)` *(gitignored)*
> - Resolved BMO entries → `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`
>
> Logging templates + triage rules: `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`.

**Triage rule (BMO-domain entries):** Bug / debt / config / perf issues whose **Domain: bmo** (or Pi-side infra/tooling) → here. dnd-app entries → `ISSUES-LOG-DNDAPP.md`. `Domain: both` → mirror in both issue logs (small duplication is fine; one fix removes both). Security (any domain) → `SECURITY-LOG.md`. Design-gotcha / future-idea / info → `BMO-SUGGESTIONS-LOG.md`.

New entries go at the TOP of their severity section (newest first within each section).

**Process (read this):** This log is the **deferred** backlog, not a duplicate of every commit. Per `[LOG-INSTRUCTIONS.md](./LOG-INSTRUCTIONS.md)`: if a bug is fixed in the same session / PR, we **do not** add a new entry here (the commit + moved archive entry are the record). That can make it look like the log "stopped" — it did not; it only tracks **outstanding** work. When an item is done, it moves to `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)` and is removed from here.

---

# Active BMO Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new BMO items below as they appear.

## Critical

*(none currently logged)*

## High

## Medium

### [2026-06-22] Voice pipeline starts degraded every boot — Silero VAD disabled (no `torchaudio`) and openwakeword default models missing → energy-only VAD + energy+STT wake fallback

- **Category:** config, bug
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` boot journal + voice_pipeline.py read + venv/pip + `arecord -l`)

**Description:**
On the live Pi, the voice pipeline logs two ERROR-level failures at every boot and runs in a degraded mode:
1. `[vad] Silero VAD not available, using energy-only` → `_load_silero_vad` (voice_pipeline.py ~240) does `import torchaudio` ("required by silero"), but **`torchaudio` is not installed** (`pip show torchaudio` → not found; `torch==2.12.0+cpu` IS installed; `torchaudio` is not in `requirements.txt`/`requirements.in`). So Silero VAD can never load and the pipeline permanently falls back to energy-only VAD (worse speech/no-speech discrimination).
2. `[wake] openwakeword not available, using energy+STT fallback...` → `_load_wake_model` (voice_pipeline.py ~211-215) raises `RuntimeError("no wake word ONNX model files found ...")`. `openwakeword==0.6.0` and `onnxruntime==1.26.0` ARE installed, but the **default ONNX model weight files were never downloaded** (`_get_wake_model_paths()` returns empty), so wake-word detection falls back to the cruder energy+STT path.

Net: both core voice-front-end models are unavailable; the assistant runs on the weaker energy-based fallbacks and prints ERROR tracebacks each boot.

**Caveat (honest):** this Pi currently has **no capture device** (`arecord -l` lists zero CAPTURE hardware), so wake/VAD are paused anyway right now — the impact is **latent**. But these are real packaging/setup gaps that (a) spam ERROR tracebacks every boot and (b) will silently leave voice degraded the moment a mic is attached. The "no audio input device" pause is a separate, already-known quiet-degrade path (commit f87518cc); the model/dep gaps here are distinct.

**Expected behavior:** with the documented deps + models installed, Silero VAD and openwakeword should load; if a model/dep is genuinely optional, the absence should log once at INFO (not an ERROR traceback every boot).

**Hypothesis / root cause:** the 2026-04-23 CPU-only-torch venv rebuild (see resolved log) installed `torch` but never added `torchaudio`; and `setup-bmo.sh` / `install-venv.sh` do not run `openwakeword`'s model download step (e.g. `python -c "import openwakeword.utils; openwakeword.utils.download_models()"`), so the `.onnx` weights are absent.

**Proposed fix / improvement:**
- [ ] Add `torchaudio` (CPU build, matching `torch` 2.12 / the pinned index) to `requirements.in` + recompile, OR make `_load_silero_vad` degrade at INFO without a traceback if Silero is intentionally optional.
- [ ] Add an openwakeword model-download step to `setup-bmo.sh` / `scripts/install-venv.sh` (or ship a bundled custom model) so `_get_wake_model_paths()` resolves.
- [ ] Demote the per-boot wake/VAD-unavailable ERRORs to a single INFO when running headless / mic-absent.

**Related files:** `bmo/pi/services/voice_pipeline.py` (`_load_silero_vad` ~234, `_load_wake_model` ~210, `_get_wake_model_paths`), `bmo/pi/requirements.in` / `requirements.txt`, `bmo/setup-bmo.sh`, `bmo/pi/scripts/install-venv.sh`

**Related entries:** resolved 2026-04-23 "CPU-only torch venv rebuild"; wake-word quiet-degrade commit f87518cc

### [2026-06-22] Pi thermal throttling — CPU hit 84°C, soft-temp limit + frequency capping occurred this boot despite `bmo-fan` active (`get_throttled=0xe0000`)

- **Category:** performance, config
- **Severity:** medium
- **Domain:** bmo
- **Discovered by:** bmo-errors
- **During:** automated bmo error scan (live `bmo.service` journal + `vcgencmd measure_temp` / `get_throttled`)

**Description:**
The health monitor fired repeated CRITICALs this boot: `pi_cpu_temp: 🌡️ CPU temperature critical: 84.2°C` and `pi_power: 🌡️ Soft temperature limit active NOW (flags: 0xe0008)` (multiple cycles ~18:51–18:54). `vcgencmd get_throttled` reads **`0xe0000`** = bits 17/18/19 set → "arm frequency capping has occurred", "throttling has occurred", "soft temperature limit has occurred" (no under-voltage bits, no currently-active bits). Current temp at scan ≈ 74–75°C with `bmo-fan.service` **active** — so the fan runs but cooling is insufficient under load and the SoC has been thermally throttling. Throttling directly slows the CPU-bound voice/STT pipeline and sustained 80°C+ shortens hardware life.

**Reproduction:**
1. `vcgencmd get_throttled` → `0xe0000` (throttle/soft-limit/freq-cap occurred since boot).
2. `journalctl -u bmo.service -b | grep -i "temperature critical"` → CPU peaked 84.2°C.

**Expected behavior:** under normal load the Pi should stay below the soft-temp limit (no throttle/freq-cap bits) with the fan running.

**Hypothesis / root cause:** cooling headroom is marginal — fan curve too conservative, fan/heatsink undersized for the enclosed touchscreen build, or a CPU-heavy workload (faster-whisper "small" int8 STT, onnxruntime) spiking temps. Needs a hardware/fan-curve look, not a code fix per se.

**Proposed fix / improvement:**
- [ ] Review `bmo-fan` control curve (`bmo/pi/hardware/fan_control.py`) — raise duty / lower the on-threshold so it ramps before 80°C.
- [ ] Check enclosure airflow / heatsink contact.
- [ ] Consider throttling background CPU work when `pi_cpu_temp` is in the critical band.

**Related files:** `bmo/pi/hardware/fan_control.py`, `bmo/pi/services/monitoring.py` (`_check_*` thermal/power checks), `bmo/pi/kiosk/bmo-fan.service`

## Low

---

> dnd-app issues: `[ISSUES-LOG-DNDAPP.md](./ISSUES-LOG-DNDAPP.md)`. BMO future ideas / design gotchas / observations: `[BMO-SUGGESTIONS-LOG.md](./BMO-SUGGESTIONS-LOG.md)`. Security (any domain): `[SECURITY-LOG.md](./SECURITY-LOG.md)` (gitignored). Resolved BMO issues: `[BMO-RESOLVED-ISSUES.md](./BMO-RESOLVED-ISSUES.md)`.
