# PHASE-21 — Discord voice quality: sentence-chunked streaming TTS, barge-in, per-NPC voice casting, emotion-prosody completion

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Replace the DM bot's lossy single-shot narration path (`tts_text = text[:500]` + a 3-second cooldown that silently drops back-to-back narrations) with a sentence-chunked, queued, cancellable TTS pipeline: narration text is split at sentence boundaries, each chunk is synthesized while the previous one plays (local Piper by default, optional Kokoro-FastAPI endpoint, Fish Audio cloud as last resort), and playback is serialized through an asyncio queue so nothing is truncated or dropped. On top of that pipeline this phase adds barge-in cancellation (cut stale narration when a player acts — opt-in, off by default), per-NPC voice casting (a named NPC keeps a stable, distinct voice via a deterministic pool assignment that the DM can override), and completion of the emotion-prosody map so every mood the VTT prompts the AI to emit (`neutral/calm/happy/sad/angry/excited/fearful/menacing`) actually modulates the voice instead of falling back to flat prosody.

## Dependencies & cross-phase notes

- **Depends on PHASE-20 (discord-bridge-foundation) — hard prerequisite.** PHASE-20 fixes the deployment-topology split (Flask `get_dm_bot()` returns `None` because the bot runs in the separate `bmo-dm-bot` systemd unit), collapses the double narration sender to one main-process sender gated by the renderer toggle, makes `/api/discord/dm/narrate` honest (spoken/queued/dropped result + `eventId` dedup), and adds the in-app session start/stop/status UI. **Nothing in this phase is reachable at runtime until PHASE-20 lands.** This plan's `bmo/pi/bots/discord_dm_bot.py` and `bmo/pi/app.py` line citations were verified on 2026-06-10 *before* PHASE-20 executed — PHASE-20 rewrites `_speak`/`_play_audio`/the narrate route, so **re-verify every cited line against the post-PHASE-20 tree (INSTRUCTIONS.md rule 3) and amend this plan (rule 22) where the shapes moved.** Where this plan says "extend `_speak`" it means "extend whatever PHASE-20 left as the single narration entry point."
- **File collisions with PHASE-20:** `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/app.py`, `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/main/ipc/ai-handlers.ts`, `dnd-app/src/preload/index.ts`, `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx`. Execute strictly after PHASE-20's commit.
- **Coordinate with PHASE-11 (prompt-schema-contract) on `dnd-app/src/main/ai/prompt-sections/voice-narration.ts`:** PHASE-11 owns the VTT↔Pi emotion *vocabulary contract* (what mood words the prompt asks for). This phase owns the *Pi side* (prosody map completion + normalization). Sub-phase 21D makes the Pi accept BOTH the VTT vocabulary (`angry/fearful/menacing/neutral`) and the legacy BMO vocabulary (`scared/dramatic/...`) via an alias table, so the two phases are order-independent. 21C adds a `[SPEAKER:Name]` line to `voice-narration.ts` — if PHASE-11 already reworded that file, append the SPEAKER line to the reworded text rather than restoring the old prose.
- **Coordinate with PHASE-15 (bmo-hygiene) on `bmo/pi/services/cloud_providers.py`:** PHASE-15 owns the `fish_audio_tts` security fix (API key on the curl command line, missing `--fail`). This phase only *calls* `fish_audio_tts` as the last-resort backend — do not fix or restructure it here.
- **PHASE-25 (entity-memory-lore)** later enriches voice casting with structured NPC metadata (race/gender/age). This phase keys auto-assignment on the existing 8 NPC archetypes + name hash only; leave a `meta: dict` pass-through parameter so PHASE-25 can extend without an API break.
- **PHASE-36 (async-play-by-post)** also touches `discord_dm_bot.py` but runs much later; no action needed here.

## Verified findings

All claims below were re-verified against the live tree on 2026-06-10. The audit file this plan absorbed is deleted; this section is the canonical record.

### F1 — VC narration is silently truncated at 500 chars (bug/high)

`_speak()` truncates every narration to 500 characters with no chunking and no log of the dropped content, while the VTT pushes full multi-thousand-character scene narrations. Cutoff is mid-word; the bridge still reports success.

- `bmo/pi/bots/discord_dm_bot.py:781` — `tts_text = text[:500] if len(text) > 500 else text` (comment: "voice should be concise").
- The system prompt *asks* the model for short replies (`discord_dm_bot.py:260` — "Keep responses under 500 characters for voice readability") but the VTT narration path does not go through that prompt: `dnd-app/src/renderer/src/hooks/use-game-effects.ts:267` and `:448` call `narrateThroughBmo(lastAssistant.content)` / `narrateThroughBmo(lastMsg.content)` with the full AI scene text (PHASE-20 collapses this renderer sender into the main-process one at `dnd-app/src/main/ai/ai-service.ts:913`; the full-text property is unchanged).

Verification commands (run from repo root):

```bash
grep -n "text\[:500\]" bmo/pi/bots/discord_dm_bot.py
# → 781:        tts_text = text[:500] if len(text) > 500 else text
grep -n "narrateThroughBmo(" dnd-app/src/renderer/src/hooks/use-game-effects.ts
# → 146 (definition), 267, 448 (full-content call sites)
grep -n "sendNarration(displayText" dnd-app/src/main/ai/ai-service.ts
# → 913
```

### F2 — The 3 s TTS cooldown permanently drops narrations instead of queueing (bug/medium, the "dropped" leg)

- `bmo/pi/bots/discord_dm_bot.py:54` — `TTS_COOLDOWN = 3.0`.
- `:336-338` — `can_tts()` returns False within 3 s of the last call; `:340-342` — `mark_tts()`.
- `:773-775` — `_speak()` early-returns (`"TTS rate limited, skipping voice for: …"`) — the narration is gone, not queued.
- `:795-814` — `_play_audio()` serializes playback by busy-waiting `while vc.is_playing(): await asyncio.sleep(0.1)` (`:802-803`) and plays via `discord.FFmpegPCMAudio(io.BytesIO(audio_bytes), pipe=True)` (`:806-807`).
- PHASE-20 makes the narrate route *report* dropped-on-cooldown honestly; this phase removes the drop entirely by replacing the cooldown with a real queue.

```bash
grep -n "TTS_COOLDOWN\|can_tts\|mark_tts" bmo/pi/bots/discord_dm_bot.py
sed -n '795,814p' bmo/pi/bots/discord_dm_bot.py
```

### F3 — Current TTS backend is cloud-only Fish Audio via an os.system curl (context for the backend split)

- `bmo/pi/bots/discord_dm_bot.py:41` imports `fish_audio_tts` from `services.cloud_providers`; `:784-787` calls it per narration (`asyncio.to_thread(fish_audio_tts, tts_text, "", "wav", prosody.speed, prosody.pitch)`).
- `bmo/pi/services/cloud_providers.py:455-526` — `fish_audio_tts(text, voice_id, format, speed, pitch)`; native `prosody` payload `{speed, pitch}` (`:484-489`); shells out via `os.system('curl …')` with the bearer key inline (`:505-512`) — that security defect is PHASE-15's.
- The bot process is **not** gevent-patched: `setup-bmo.sh:312` runs it as `ExecStart=…/venv/bin/python -m bots.discord_dm_bot` (standalone asyncio, `discord_dm_bot.py:1626-1630` → `asyncio.run(_run_dm_bot())`). The "no `requests` under gevent" repo gotcha applies to `app.py` only — plain blocking HTTP inside `asyncio.to_thread` is fine in the bot process.
- The systemd unit caps the bot at `MemoryMax=512M` / `CPUQuota=50%` (`bmo/setup-bmo.sh:301-323`) — relevant because in-process Piper inference needs headroom (see 21A step 7).

```bash
sed -n '455,526p' bmo/pi/services/cloud_providers.py
grep -n "python -m bots.discord_dm_bot\|MemoryMax\|CPUQuota" bmo/setup-bmo.sh
```

### F4 — Piper is already a pinned dependency with local infrastructure, but the DM bot never uses it

- `bmo/pi/requirements.in:24` — `piper-tts`; resolved to `piper-tts==1.4.2` (`requirements.txt:239`, `requirements-ci.txt:231`). Requirements are pip-compile-managed (header of `requirements.txt`).
- `bmo/pi/services/voice_pipeline.py:31-33` — `MODELS_DIR = ~/home-lab/bmo/pi/models` (with a `piper/` subdir), `DATA_DIR = ~/home-lab/bmo/pi/data`; `:121-124` — `PIPER_MODEL = …/piper/en_US-hfc_female-medium.onnx`, `PIPER_BMO_MODEL = …/piper/bmo-voice.onnx`, `PIPER_BMO_AVAILABLE` file check.
- Piper is invoked CLI-style (`subprocess.run(["piper", "--model", …, "--output_file", …], input=text, text=True)`) at `voice_pipeline.py:1822-1825`, `:2018-2024`, `:2054-2057`; prosody is applied afterwards with sox (`["sox", raw, out, "tempo", str(speed), "pitch", str(pitch*100)]`, `:2063-2073`).
- The kiosk TTS chain (`speak()`, `:1656-1749`) is `cache → Piper BMO → Fish Audio → edge-tts → generic Piper` — the Discord bot bypasses all of it and calls `fish_audio_tts` directly.
- `bmo/pi/tests/conftest.py` mocks the `piper` module (`_MOCK_MODULES` list includes `"piper"`), so unit tests never need the real onnxruntime.

```bash
grep -n "piper-tts" bmo/pi/requirements.in bmo/pi/requirements.txt
grep -n "MODELS_DIR\|PIPER_BMO_MODEL\|PIPER_MODEL " bmo/pi/services/voice_pipeline.py | head
grep -n '"piper"' bmo/pi/tests/conftest.py
```

### F5 — Emotion vocabulary mismatch: half the VTT moods have no prosody mapping (bug/low)

- `dnd-app/src/main/ai/prompt-sections/voice-narration.ts:11` prompts the AI for: `neutral, calm, happy, sad, angry, excited, fearful, menacing`.
- `bmo/pi/services/voice_personality.py:44-55` — `PIPER_EMOTION_PROSODY` keys: `happy, excited, calm, dramatic, sleepy, sad, scared, sassy, mischievous, shy`. **Missing: `neutral`, `angry`, `fearful`, `menacing`** (it has `scared`, which `fearful` should alias to).
- `get_prosody()` (`voice_personality.py:223-243`): NPC prosody wins outright; otherwise emotion looked up in `PIPER_EMOTION_PROSODY`; otherwise flat `{"speed": 1.0, "pitch": 0}`. So `angry/fearful/menacing/neutral` → flat default today. Also: when both `npc` and `emotion` are present, **emotion is silently ignored** (`if npc … return; if emotion … return`).
- The Fish-side maps have the same gap: `BMO_EMOTIONS` (`:63-74`) and `_EMOTION_ALIASES` (`:77-99`) know only the legacy 10 moods.
- Existing tests: `bmo/pi/tests/test_dm_bot_voice.py` parametrizes `get_prosody` over `NPC_PROSODY` keys, checks unknown-NPC fallback `== {"speed": 1.0, "pitch": 0}`, `emotion="dramatic"`, and no-args neutral — none cover the VTT vocabulary or npc+emotion combination, so 21D's changes don't break them (the unknown-fallback test stays valid because `totally_made_up_archetype` remains unknown).

```bash
sed -n '8,13p' dnd-app/src/main/ai/prompt-sections/voice-narration.ts
sed -n '44,55p' bmo/pi/services/voice_personality.py
sed -n '223,243p' bmo/pi/services/voice_personality.py
```

### F6 — Voice-tag plumbing that voice casting builds on (current state)

- AI output tags: `[NPC:archetype]` + `[EMOTION:mood]`, parsed main-side by `parseVoiceTags()` (`dnd-app/src/main/ai/ai-response-parser.ts:29-44`, regexes `\[NPC:\s*([a-z_]+)\s*\]` / `\[EMOTION:\s*([a-z_]+)\s*\]`, first match wins) and stripped from display text by `stripVoiceTags()` (`:47-55`). `ai-service.ts:877` parses, `:879` strips, `:913` forwards `(displayText, npc, emotion)`.
- Bridge: `sendNarration(text, npc?, emotion?)` → `POST /api/discord/dm/narrate` body `{text, npc, emotion}` (`dnd-app/src/main/bmo-bridge.ts:171-176`), retry/backoff wrapper `bmoPiFetch` (`:141-158`).
- IPC: `BMO_NARRATE: 'bmo:narrate'` (`dnd-app/src/shared/ipc-channels.ts:206`), handler at `src/main/ipc/ai-handlers.ts:664-666`, preload `bmoNarrate(text, npc?, emotion?)` (`src/preload/index.ts:508-509`), renderer service `src/renderer/src/services/bmo-narration.ts` (normalizes whitespace, returns `{success, error}`). **No zod schema exists for any `BMO_*` channel** (`grep -n "BMO_" dnd-app/src/shared/ipc-schemas.ts` → no hits) — 21B adds one for narrate per the repo's zod-at-boundaries convention.
- Renderer toggle: `useNarrationTtsStore` (`src/renderer/src/stores/use-narration-tts-store.ts:1-35`, `enabled` + localStorage key `dnd-vtt-ai-narration-tts`); DMTabPanel toggle button (`src/renderer/src/components/game/bottom/DMTabPanel.tsx:231-238`).
- Pi side: `parse_response_tags()` (`voice_personality.py:151-201`) extracts `npc`/`emotion` from the bot's own LLM replies; the narrate route (`bmo/pi/app.py:2891-2919`) accepts `{text, npc, emotion}`, rate-limited `30 per minute` (`app.py:226` `RATE_LIMIT_NARRATE`, override env `BMO_NARRATE_RATE_LIMIT`).
- Per-NPC voice IDs exist *vestigially*: `NPC_VOICES` (`voice_personality.py:16-25`) maps 8 archetypes to Fish Audio voice-id env vars all defaulting to `""`; `NPC_PROSODY` (`:31-40`) is what's actually used (single voice, speed/pitch modulation per archetype). There is no named-NPC concept anywhere — two different innkeepers sound identical.
- `_speak` call sites that must all survive the 21A queue refactor: `discord_dm_bot.py:429` (slash-start greeting), `:467` (slash-stop farewell), `:760` (player-input reply), `:981` (`/initiative`), and `app.py:2832` (bridge start greeting), `:2868` (bridge stop farewell), `:2912` (narrate route).

```bash
grep -rn "sendNarration\|bmoNarrate" dnd-app/src/main dnd-app/src/preload | grep -v test
grep -n "_speak(" bmo/pi/bots/discord_dm_bot.py bmo/pi/app.py | grep -v "def _speak"
grep -n "NPC_VOICES\|NPC_PROSODY" bmo/pi/services/voice_personality.py | head -4
```

### F7 — No cancellation path exists anywhere in the narration pipeline (feature gap)

- The bot has no way to stop in-flight or queued speech: no `vc.stop()` call site outside playback errors, no cancel endpoint in `app.py` (`grep -n "narrate/cancel\|stop_speaking\|vc.stop()" bmo/pi/app.py bmo/pi/bots/discord_dm_bot.py` → no hits), no bridge/IPC affordance in dnd-app.
- LLM-stream cancellation DOES exist VTT-side (`cancelChat(streamId)` aborts the provider stream, `dnd-app/src/main/ai/ai-service.ts:920-927`) — barge-in in this phase is **narration-side only**. One audit-recommendation nuance corrected against reality: the recommendation described threading one cancellation token "through the Ollama stream, the chunk queue, the TTS request, and `voice_client.stop()`", implying the live LLM token stream feeds TTS. In the deployed topology the VTT only sends narration *after* the response finalizes (`ai-service.ts:913` runs in the completion handler), so the LLM leg is already covered by the existing `cancelChat` and the new token here covers: sentence queue → in-flight synthesis → Discord playback. The sentence-splitter is still built generator-ready (21A) so a future token-stream feed needs no rework.

## Sub-phases

Execution order 21A → 21B → 21C → 21D keeps the tree green: 21A is Pi-only and self-contained; 21B layers cancel paths over 21A's queue and adds the VTT surface; 21C extends both ends with the speaker dimension; 21D is an isolated Pi map completion.

---

### 21A — Pi: sentence-chunked streaming TTS engine + narration queue (kills `text[:500]` and cooldown drops)

**Objective:** every narration plays in full, in order, with first audio in a few seconds, regardless of length; local Piper is the default backend, Kokoro-FastAPI is an opt-in endpoint, Fish Audio is the last-resort fallback.

**Files:**
- NEW `bmo/pi/services/discord_tts.py`
- NEW `bmo/pi/tests/test_discord_tts.py`
- `bmo/pi/bots/discord_dm_bot.py`
- `bmo/pi/tests/test_dm_bot_voice.py` (extend)
- `bmo/pi/requirements.in`, `bmo/pi/requirements.txt`, `bmo/pi/requirements-ci.in`, `bmo/pi/requirements-ci.txt`
- `bmo/setup-bmo.sh`
- `bmo/docs/SERVICES.md`

**Steps:**

1. **`services/discord_tts.py` — splitting.** Module-level docstring per repo style. Implement:
   - `split_sentences(text: str, max_chars: int = 350, min_chars: int = 24) -> list[str]`. Primary path: `from stream2sentence import generate_sentences` fed a single-yield generator (`def _gen(): yield text`) with `minimum_sentence_length=10`, defaults otherwise (the library handles abbreviations/quotes; tokenizer default "nltk"). Wrap the import AND the call in `try/except Exception` (covers `ImportError` and nltk `LookupError` when punkt data is absent) falling back to `_regex_split(text)`: split on `(?<=[.!?…])\s+(?=[A-Z"'“(])`, which never raises. Post-process in both paths: merge any fragment shorter than `min_chars` into its successor (or predecessor for the trailing one); hard-split any sentence longer than `max_chars` at the last space before the limit (loop until all ≤ `max_chars`). Pure function, no I/O.
   - The function signature must also accept a generator for future token-stream use: `split_sentences_stream(gen: Iterator[str], …) -> Iterator[str]` thin wrapper calling `generate_sentences(gen, …)` with the same fallback (buffer-all + regex). Only `split_sentences` is consumed this phase.
2. **`services/discord_tts.py` — backends.** Define `@dataclass VoiceSpec: backend: str = "auto"; kokoro_voice: str | None = None; piper_speaker: int | None = None; speed: float = 1.0; pitch: int = 0` and `def synthesize_chunk(text: str, voice: VoiceSpec) -> bytes` returning WAV bytes. Resolution ladder (first available wins) inside a `def resolve_backend() -> str` cached helper:
   - **kokoro** if `KOKORO_TTS_URL` env is set (e.g. `http://gpu-box:8880`). POST `{url}/v1/audio/speech` JSON `{"model": "kokoro", "input": text, "voice": voice.kokoro_voice or os.environ.get("KOKORO_TTS_VOICE", "af_bella"), "response_format": "wav", "speed": voice.speed, "stream": False}`, `timeout=30`, raise on non-200. Use `requests` — safe in the standalone-asyncio bot process (F3); add a module docstring warning that this module must NOT be imported from gevent-patched `app.py` request paths.
   - **piper** if the model file exists: `PIPER_DM_MODEL` env, default `os.path.expanduser("~/home-lab/bmo/pi/models/piper/en_US-libritts_r-medium.onnx")`, falling back to the existing `~/home-lab/bmo/pi/models/piper/bmo-voice.onnx` if the libritts model is absent (then `piper_speaker` is ignored — single-speaker model). Lazy module-level singleton: `from piper import PiperVoice; _VOICE = PiperVoice.load(model_path)` guarded by a `threading.Lock`. Synthesize via the Python API: build `SynthesisConfig` with `length_scale=1.0/voice.speed` (length_scale is inverse speed) and — only if the installed piper supports it — `speaker_id=voice.piper_speaker` (probe once with `"speaker_id" in inspect.signature(SynthesisConfig).parameters` or `dataclasses.fields`; if unsupported, shell out CLI-style like `voice_pipeline.py:2054` with `["piper", "--model", model, "--speaker", str(id), "--output_file", tmp]`). Collect `chunk.audio_int16_bytes` from `voice.synthesize(text, syn_config=…)` into a WAV container via the `wave` stdlib module using `chunk.sample_rate/sample_width/sample_channels`. Executor pre-check: `bmo/pi/venv/bin/python -c "from piper import PiperVoice, SynthesisConfig; import dataclasses; print([f.name for f in dataclasses.fields(SynthesisConfig)])"`.
   - **fish** otherwise: `from services.cloud_providers import fish_audio_tts; return fish_audio_tts(text, "", "wav", voice.speed, voice.pitch)` (speed/pitch native — skip step 3 for this backend).
3. **`services/discord_tts.py` — prosody post-processing.** `def apply_prosody(wav_bytes: bytes, speed: float, pitch: int, *, skip_speed: bool = False) -> bytes`: no-op when `speed == 1.0 and pitch == 0`; else pipe through sox on stdin/stdout (`subprocess.run(["sox", "-t", "wav", "-", "-t", "wav", "-"] + effects, input=wav_bytes, capture_output=True, check=True)` with `effects = (["tempo", str(speed)] if speed != 1.0 and not skip_speed else []) + (["pitch", str(pitch * 100)] if pitch else [])`), mirroring `voice_pipeline.py:2063-2073`. On `FileNotFoundError` (no sox) log and return input unchanged. Kokoro/piper handle speed natively → call with `skip_speed=True`; pitch always via sox for those two.
4. **Bot queue worker (`discord_dm_bot.py`).**
   - `@dataclass NarrationJob: text: str; npc: str | None = None; emotion: str | None = None; speaker: str | None = None; event_id: str | None = None; interrupt: bool = False` (speaker/interrupt consumed in 21B/21C; declare now for a stable shape).
   - `DMSession` gains `narration_queue: asyncio.Queue | None = None` and `narration_worker: asyncio.Task | None = None`, both reset in `reset()` (cancel the worker task if alive). **Delete** `TTS_COOLDOWN`, `_last_tts_time`, `can_tts()`, `mark_tts()` and the `:773-775` drop (if PHASE-20 converted the drop into a "dropped" status, delete that status leg too — the queue makes it unreachable; keep the `queued` status).
   - `DMBot._ensure_narration_worker()` — lazily create the queue + `self.loop.create_task(self._narration_worker())`.
   - `async def _narration_worker(self)`: forever `job = await queue.get()`; resolve prosody (`get_prosody(npc=job.npc, emotion=job.emotion)`) and `VoiceSpec` (21C extends with casting); `chunks = split_sentences(job.text)`; pipelined loop — kick off synthesis of chunk *i+1* (`asyncio.create_task(asyncio.to_thread(_synth_one, chunk))` where `_synth_one` = `apply_prosody(synthesize_chunk(...))`) before awaiting playback of chunk *i*; on per-chunk synthesis exception, log + skip that chunk (keep going — partial audio beats silence). Wrap the whole job in `try/except asyncio.CancelledError: vc.stop(); raise`-safe handling (21B refines).
   - `async def _play_chunk(self, wav_bytes: bytes)`: replace the busy-wait with an event — `done = asyncio.Event()`; `vc.play(discord.FFmpegPCMAudio(io.BytesIO(wav_bytes), pipe=True), after=lambda e: self.loop.call_soon_threadsafe(done.set))`; `await done.wait()`; log playback errors from the `after` arg as today (`:810`).
   - `_speak(text, npc=None, emotion=None, speaker=None, event_id=None, interrupt=False) -> dict`: keep the existing connected-VC guard (`:769-771`, return the PHASE-20 "no-voice" status shape); `self._ensure_narration_worker()`; `await queue.put(NarrationJob(...))`; return `{"status": "queued", "position": queue.qsize(), "chunks": len_estimate}`. **Remove `tts_text = text[:500]`**; log `_log("Narration queued: %d chars", len(text))`. All seven call sites (F6) continue to `await self._speak(...)` unchanged.
   - `leave_voice()` / session teardown: cancel the worker + drain the queue so a stopped session never plays stale audio.
5. **Dependencies.** Append `stream2sentence` to `bmo/pi/requirements.in` and `bmo/pi/requirements-ci.in`; regenerate both lockfiles exactly as their headers document:
   ```bash
   cd bmo/pi
   pip-compile --extra-index-url=https://download.pytorch.org/whl/cpu --no-strip-extras --output-file=requirements.txt requirements.in
   pip-compile --no-strip-extras --output-file=requirements-ci.txt requirements-ci.in   # verify exact flags in the file header first
   ```
   (Verify the `requirements-ci.txt` header for its true pip-compile invocation before running.)
6. **Provisioning (`setup-bmo.sh`).** After the `pip install -r requirements.txt` line (`setup-bmo.sh:102`), add: NLTK punkt pre-download (`venv/bin/python - <<'EOF'` block calling `nltk.download("punkt", quiet=True)` and `nltk.download("punkt_tab", quiet=True)`, tolerant of offline failure — the regex fallback covers it) and the Piper voice fetch `venv/bin/python -m piper.download_voices en_US-libritts_r-medium --download-dir /home/patrick/home-lab/bmo/pi/models/piper || true` (verify the module name against piper-tts 1.4.2: `venv/bin/python -m piper.download_voices --help`).
7. **systemd headroom.** In the `bmo-dm-bot.service` heredoc (`setup-bmo.sh:301-323`) raise `MemoryMax=512M` → `MemoryMax=1G` and `CPUQuota=50%` → `CPUQuota=150%` (libritts_r-medium onnx inference needs both; measured model is ~75 MB on disk, onnxruntime working set is several hundred MB). This edits only the checked-in script; per repo safety rules, applying it to the live Pi (`sudo tee /etc/systemd/system/… + daemon-reload + restart`) requires warning the user first — note it in the phase commit body as a user-action item.
8. **Docs.** Add a `discord_tts` row/section to `bmo/docs/SERVICES.md` (new service module: purpose, env vars `KOKORO_TTS_URL`, `KOKORO_TTS_VOICE`, `PIPER_DM_MODEL`, backend ladder, "bot-process-only, not gevent-safe" warning).
9. **Tests.**
   - `tests/test_discord_tts.py`: regex-fallback splitting (force it by `monkeypatch.setitem(sys.modules, "stream2sentence", None)` or patching the import-guard flag): simple two-sentence text; abbreviation survival ("Dr. Vex nods. She smiles." → 2 chunks under the regex's capital-follow guard — assert ≥1 and full-text coverage rather than exact boundaries); long-sentence hard split at `max_chars`; tiny-fragment merge; empty/whitespace input → `[]`. Backend selection: with `KOKORO_TTS_URL` set + `requests.post` mocked → kokoro body asserted; with no env + model file faked absent + `fish_audio_tts` mocked → fish; `apply_prosody` no-op fast path (no sox subprocess spawned — patch `subprocess.run` and assert not called when speed 1.0/pitch 0).
   - `tests/test_dm_bot_voice.py` (extend, existing style — `DMBot()` constructed directly, conftest mocks `piper`): `_speak` with connected fake vc enqueues a `NarrationJob` and returns `status == "queued"`; `_speak` with no vc returns the no-voice status without enqueueing; worker plays jobs in FIFO order (patch `_play_chunk` + `discord_tts.synthesize_chunk` with `AsyncMock`/`MagicMock`, drive the loop with `asyncio.wait_for`); 500+ char text is NOT truncated (assert the synthesized chunks re-join to the full text).

**Targeted cheap checks:** `cd bmo/pi && python -m pytest tests/test_discord_tts.py tests/test_dm_bot_voice.py -q` and `python -c "import ast,sys; ast.parse(open('services/discord_tts.py').read())"`.

**Acceptance (21A):**
- `grep -n "text\[:500\]" bmo/pi/bots/discord_dm_bot.py` → no hits; `grep -n "TTS_COOLDOWN" …` → no hits.
- A 2,000-char narration enqueues as ≥5 chunks and the worker would play all of them (covered by the FIFO/no-truncation tests).
- `services/discord_tts.py` importable with stream2sentence absent (fallback test green).
- Both pip-compile lockfiles regenerated and consistent (`grep stream2sentence bmo/pi/requirements.txt bmo/pi/requirements-ci.txt`).

---

### 21B — Barge-in cancellation through the whole narration pipeline (opt-in, off by default)

**Objective:** stale narration can be cut — manually (a "Stop voice" button) always, and automatically on a new player action when the new `bargeIn` setting is ON (default OFF). Cancellation flushes the sentence queue, abandons in-flight synthesis, and stops Discord playback.

**Files:**
- `bmo/pi/bots/discord_dm_bot.py`
- `bmo/pi/app.py`
- `bmo/pi/tests/test_dm_bot_voice.py`, `bmo/pi/tests/test_app_endpoints.py` (extend)
- `dnd-app/src/main/bmo-bridge.ts`
- `dnd-app/src/main/ipc/ai-handlers.ts`
- `dnd-app/src/main/ai/ai-service.ts`
- `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/src/shared/ipc-schemas.ts`
- `dnd-app/src/preload/index.ts`
- `dnd-app/src/renderer/src/stores/use-narration-tts-store.ts` (+ its colocated test)
- `dnd-app/src/renderer/src/services/bmo-narration.ts` (+ test)
- `dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx`
- `dnd-app/src/renderer/src/i18n/locales/en.json`, `es.json`

**Steps:**

1. **Bot cancel primitive.** `async def cancel_narration(self, flush: bool = True) -> dict`: snapshot `flushed = queue.qsize()`; if flush, drain via `get_nowait()` loop; cancel the current job by setting a `self._current_job_cancel: asyncio.Event` the worker checks between chunks AND cancelling the in-flight synthesis task; call `vc.stop()` if `vc and vc.is_playing()`; return `{"cancelled": was_playing_or_active, "flushed": flushed}`. Worker hardening: between every chunk check the cancel event (set → stop job, clear event, continue to next queue item); wrap `await self._play_chunk(...)` so `vc.stop()` resolves the playback event promptly (the `after` callback fires on stop — verified discord.py behavior; the event-based `_play_chunk` from 21A needs no change).
2. **Interrupt-on-enqueue.** In `_speak(...)`: `if interrupt: await self.cancel_narration(flush=True)` before `queue.put`. The narrate route passes `interrupt = bool(data.get("interrupt", False))` through (extend the route's `_speak` invocation in `app.py:2904-2914` — post-PHASE-20 shape).
3. **Cancel endpoint (`app.py`).** New route after the narrate route: `POST /api/discord/dm/narrate/cancel` (+ `/api/v1/…` alias, `@limiter.limit(RATE_LIMIT_NARRATE)`): resolve the bot per the PHASE-20 mechanism (in-process `get_dm_bot()` or proxy — match the narrate route exactly), 404 `{"error": "No active DM session"}` when absent, else `asyncio.run_coroutine_threadsafe(bot.cancel_narration(), bot.loop).result(timeout=5)` and return its dict with `{"ok": True, …}`. A 5 s timeout is safe — cancel does no synthesis.
4. **Bridge (`bmo-bridge.ts`).** Change `sendNarration` signature to `sendNarration(text: string, opts?: { npc?: string; emotion?: string; speaker?: string; interrupt?: boolean }): Promise<BridgeResponse>` posting `{text, ...opts}` (update the two existing callers: `ai-service.ts:913` and the `ai-handlers.ts` BMO_NARRATE handler). New `export async function cancelNarration(): Promise<BridgeResponse>` → `bmoPiFetch('/api/discord/dm/narrate/cancel', { method: 'POST' })`.
5. **IPC.** `ipc-channels.ts`: add `BMO_NARRATE_CANCEL: 'bmo:narrate-cancel'` next to `:206`. `ipc-schemas.ts`: add
   ```ts
   export const BmoNarrateRequestSchema = z.object({
     text: z.string().min(1).max(8000),
     npc: z.string().max(40).optional(),
     emotion: z.string().max(24).optional(),
     speaker: z.string().max(40).optional(),
     interrupt: z.boolean().optional()
   })
   ```
   `ai-handlers.ts`: change the `BMO_NARRATE` handler to take a single payload object validated with `BmoNarrateRequestSchema.safeParse` (invalid → `{ ok: false, error: 'invalid narrate payload' }`), then `sendNarration(parsed.text, parsed)`; add `handle(IPC_CHANNELS.BMO_NARRATE_CANCEL, async () => cancelNarration())`. `preload/index.ts`: update `bmoNarrate` to `(payload: { text: string; npc?: string; emotion?: string; speaker?: string; interrupt?: boolean })` and add `bmoNarrateCancel: () => ipcRenderer.invoke(IPC_CHANNELS.BMO_NARRATE_CANCEL)`; update the preload `api` type declaration accordingly. Update `src/renderer/src/services/bmo-narration.ts` (`speakNarrationThroughBmo`) to the payload-object call shape and adjust `bmo-narration.test.ts` expectations.
6. **Renderer setting + button.** `use-narration-tts-store.ts`: add `bargeIn: boolean` (default **false**), `setBargeIn`, persisted under `dnd-vtt-ai-narration-barge-in` mirroring the existing `enabled` persistence; extend the colocated store test (default false, persistence round-trip). `DMTabPanel.tsx`: next to the Speak-narration toggle (`:231-238`) add (a) a "Barge-in" toggle bound to `bargeIn` (rendered only when `narrationTtsEnabled`), (b) a "Stop voice" button calling `window.api.bmoNarrateCancel()` (fire-and-forget with a DM-alert on `{ok:false}` non-404). i18n keys: `game.dmTabPanel.bargeIn`, `game.dmTabPanel.bargeInTitle`, `game.dmTabPanel.stopVoice`, `game.dmTabPanel.stopVoiceTitle` in `en.json` AND `es.json`.
7. **Auto barge-in wiring (main).** Follow the toggle-plumbing mechanism PHASE-20 established for `narrationTtsEnabled` reaching the main process, and plumb `bargeIn` identically (per-call param or main-side settings — match, don't invent a second channel). Consumption points: (a) the single narration send (`ai-service.ts:913` region) passes `interrupt: bargeIn` so a new scene's audio replaces a stale one; (b) at the start of each new user-initiated chat request (the `sendChatMessage`/stream-entry in `ai-service.ts`), when `bargeIn` is enabled fire `cancelNarration().catch(() => {})` so audio cuts the moment the player acts, before generation even finishes. Both legs are inert while `bargeIn` is false — default behavior is byte-identical to PHASE-20's.
8. **Tests.** pytest: `cancel_narration` flushes N queued jobs + calls `vc.stop()` (fake vc `is_playing() → True`); `_speak(interrupt=True)` cancels before enqueue; cancel route returns 404 with no bot (extend `test_app_endpoints.py` following its existing discord-route cases). vitest: store defaults/persistence; `speakNarrationThroughBmo` payload-shape pass-through; (optional, cheap) `ai-handlers` narrate schema rejection via the existing handler-test harness if one exists for AI handlers — otherwise the schema's own unit test (`BmoNarrateRequestSchema.safeParse` cases) colocated in a `ipc-schemas.test.ts` addition.

**Targeted cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json` (from `dnd-app/`), `npx vitest run src/renderer/src/stores/use-narration-tts-store.test.ts src/renderer/src/services/bmo-narration.test.ts`, `cd bmo/pi && python -m pytest tests/test_dm_bot_voice.py tests/test_app_endpoints.py -q`.

**Acceptance (21B):**
- `POST /api/discord/dm/narrate/cancel` exists with v1 alias and returns `{ok, cancelled, flushed}` against a live bot; 404 without one.
- With `bargeIn` OFF (default): no `interrupt` is sent, no cancel fires — verified by the pass-through test asserting the default payload.
- "Stop voice" button renders only for the DM panel when narration is enabled and invokes `bmoNarrateCancel`.
- Both locales carry the four new keys.

---

### 21C — Per-NPC voice casting (stable distinct voices, DM-overridable)

**Objective:** a named NPC gets a stable, distinct TTS voice on first appearance (deterministic assignment from a pool, biased by archetype), persisted per campaign, viewable and re-rollable from the DM panel; plain narration keeps the default DM voice.

**Files:**
- NEW `bmo/pi/services/voice_casting.py`
- NEW `bmo/pi/tests/test_voice_casting.py`
- `bmo/pi/bots/discord_dm_bot.py`, `bmo/pi/app.py` (extend), `bmo/pi/tests/test_app_endpoints.py`
- `bmo/docs/SERVICES.md`
- `dnd-app/src/main/ai/prompt-sections/voice-narration.ts`
- `dnd-app/src/main/ai/ai-response-parser.ts` + `ai-response-parser.test.ts`
- `dnd-app/src/main/ai/ai-service.ts`
- `dnd-app/src/main/bmo-bridge.ts`, `src/main/ipc/ai-handlers.ts`, `src/shared/ipc-channels.ts`, `src/shared/ipc-schemas.ts`, `src/preload/index.ts`
- `dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx`, i18n `en.json`/`es.json`

**Steps:**

1. **`services/voice_casting.py`.**
   - Pools: `KOKORO_POOL: list[dict]` — ~16 entries `{"id": "af_bella", "group": "female"}, {"id": "am_adam", "group": "male"}, {"id": "am_onyx", "group": "deep_male"}, {"id": "bf_emma", "group": "female"}, {"id": "bm_george", "group": "male"}, …` (use the documented Kokoro voice ids; voice *blends* like `"af_bella+af_sky"` are valid ids too — include 2-3 blends for variety). `PIPER_SPEAKER_POOL: list[dict]` — ~24 curated libritts_r speaker ids `{"id": 0, "group": "male"}, …` spanning the 904-speaker model (pick spread-out ids; exact voice character is tuning, not correctness). `ARCHETYPE_GROUPS: dict[str, list[str]]` mapping the 8 existing archetypes (`voice_personality.NPC_PROSODY` keys) to preferred groups, e.g. `booming_dragon → ["deep_male"]`, `mysterious_elf → ["female"]`, `gruff_dwarf → ["deep_male", "male"]`, default `["male", "female"]`.
   - `@dataclass CastEntry: speaker: str; backend: str; voice_id: str; speed: float = 1.0; pitch: int = 0` (voice_id holds the Kokoro voice string or stringified Piper speaker id).
   - `class VoiceCasting:` ctor takes `path` (default `os.environ.get("BMO_VOICE_CAST_PATH", os.path.expanduser("~/home-lab/bmo/pi/data/voice_cast.json"))` — inside the unit's `ReadWritePaths`, F3). JSON shape: `{campaign_id: {speaker_lower: CastEntry-dict}}`. Concurrency: `threading.Lock` + atomic write (`tempfile` in same dir + `os.replace`) + reload when file mtime changed (the Flask process and the bot process share the file; both re-read on access).
   - `get_voice(campaign_id, speaker, archetype=None, meta=None) -> CastEntry`: normalized key `speaker.strip().lower()`; return persisted entry if present; else auto-assign: pool = backend-appropriate pool filtered to `ARCHETYPE_GROUPS[archetype]` (fall back to full pool when the filter empties); start index `int(hashlib.sha256(f"{campaign_id}:{key}".encode()).hexdigest(), 16) % len(pool)`; linear-probe forward past voices already cast in this campaign (wrap; collisions allowed once the pool is exhausted); seed `speed/pitch` from `NPC_PROSODY.get(archetype, {"speed": 1.0, "pitch": 0})`; persist and return. `meta` is accepted and ignored (PHASE-25 extension point).
   - `list_cast(campaign_id) -> list[dict]`, `set_voice(campaign_id, speaker, voice_id=None, speed=None, pitch=None) -> CastEntry` (partial update; unknown speaker creates an entry), `reset_voice(campaign_id, speaker) -> bool` (delete → next `get_voice` re-rolls deterministically), `pool_for_backend(backend) -> list[str]` (for the UI picker).
2. **Bot consumption.** In the 21A worker: when `job.speaker` is set, `entry = VoiceCasting().get_voice(self._campaign_name or "discord_campaign", job.speaker, archetype=job.npc)`; build `VoiceSpec(backend=resolve_backend(), kokoro_voice=entry.voice_id if kokoro, piper_speaker=int(entry.voice_id) if piper, speed=entry.speed * emotion_overlay_speed, pitch=entry.pitch + emotion_overlay_pitch)` (use 21D's combined `get_prosody` for the overlay); when `job.speaker` is unset keep current default-voice behavior. Hold one module-level `VoiceCasting` instance in the bot (mtime reload keeps it fresh).
3. **Flask endpoints (`app.py`).** These operate on the shared JSON directly — no bot round-trip: `GET /api/discord/dm/voices?campaign_id=X` → `{"ok": true, "cast": list_cast(X), "pool": pool_for_backend(resolved), "backend": resolved}`; `POST /api/discord/dm/voices` body `{campaign_id, speaker, voice_id?, speed?, pitch?}` → updated entry; `DELETE /api/discord/dm/voices` body `{campaign_id, speaker}` → `{"ok": true, "reset": bool}`. v1 aliases + `@limiter.limit(RATE_LIMIT_NARRATE)` on the mutating ones. Import `services.voice_casting` lazily inside the routes (matches the file's `from bots.discord_dm_bot import get_dm_bot` lazy-import pattern and keeps gevent-sensitive imports out of module load — `voice_casting` itself is stdlib-only, no `requests`).
4. **Prompt (`voice-narration.ts`).** Add one line after the `[EMOTION:mood]` bullet (or its PHASE-11 replacement): `` - \`[SPEAKER:Name]\` — when a NAMED NPC speaks most of the reply, add their short name (e.g. \`[SPEAKER:Volo]\`) so that character keeps a consistent voice across scenes. Omit for unnamed or one-off characters. `` and extend the example to `[NPC:gruff_dwarf][EMOTION:angry][SPEAKER:Borin] "Ye'll not pass…"`. Update the "at most ONE of each" sentence to cover all three tags. Update `prompt-assembler.test.ts` only if it snapshots the literal (it asserts inclusion of `VOICE_NARRATION_PROMPT` by reference — verify with `grep -n "VOICE_NARRATION_PROMPT" dnd-app/src/main/ai/prompt-assembler.test.ts`; reference-based assertions need no change).
5. **Parser (`ai-response-parser.ts`).** `const VOICE_SPEAKER_RE = /\[SPEAKER:\s*([^\]\n]{1,40}?)\s*\]/i`; `parseVoiceTags` returns `{ npc?, emotion?, speaker? }` (speaker NOT lower-cased — display name, just `.trim()`); `stripVoiceTags` gains `.replace(/\[SPEAKER:[^\]\n]{1,40}\]/gi, '')` before the whitespace collapse. Extend `ai-response-parser.test.ts`: extraction, stripping, 40-char bound, absence → `undefined`, combined three-tag example.
6. **Pass-through.** `ai-service.ts:877` destructures `speaker` too; `:913` region sends `sendNarration(displayText, { npc, emotion, speaker, interrupt: bargeIn })`. `bmo-bridge.ts` `sendNarration` already carries `speaker` from 21B step 4. The Pi narrate route forwards `speaker = data.get("speaker")` into `_speak`.
7. **Cast management IPC + UI.** Channels `BMO_VOICE_CAST_GET: 'bmo:voice-cast-get'`, `BMO_VOICE_CAST_SET: 'bmo:voice-cast-set'`, `BMO_VOICE_CAST_RESET: 'bmo:voice-cast-reset'` in `ipc-channels.ts`; zod in `ipc-schemas.ts` (`VoiceCastSetSchema = z.object({ campaignId: z.string().min(1), speaker: z.string().min(1).max(40), voiceId: z.string().max(64).optional(), speed: z.number().min(0.5).max(1.5).optional(), pitch: z.number().int().min(-10).max(8).optional() })`, plus get/reset shapes); bridge fns `getVoiceCast(campaignId)`, `setVoiceCast(payload)`, `resetVoiceCast(campaignId, speaker)` in `bmo-bridge.ts`; handlers in `ai-handlers.ts` (validate with safeParse); preload `bmoVoiceCastGet/Set/Reset` + api types. UI: in `DMTabPanel.tsx`, under the narration controls and only when `narrationTtsEnabled` && DM, a collapsible "Voice cast" section: on expand fetch `getVoiceCast(campaign.id)`; render rows `speaker — voice_id` with a `<select>` of `pool` options (change → `setVoiceCast`) and a "Re-roll" button (`resetVoiceCast` then refetch). Empty state: one i18n line ("No NPCs cast yet — voices are assigned when a named NPC first speaks."). i18n keys (`game.dmTabPanel.voiceCast*`) in both locales. Keep it list-only — no modal, no new component file needed unless the panel section exceeds ~80 lines (then a colocated `VoiceCastSection.tsx` beside DMTabPanel is fine).
8. **Docs.** `bmo/docs/SERVICES.md`: add `voice_casting` entry (file path, JSON store location, env override, endpoints).
9. **Tests.**
   - `tests/test_voice_casting.py`: determinism (same campaign+name → same entry across instances); distinct names spread across the pool (≥3 unique voices for 4 names); archetype group respected (`booming_dragon` lands in a deep_male-group voice); collision probing (cast pool-size+1 names without raising); persistence round-trip + `os.replace` atomicity (write, reload via new instance); `set_voice` partial update wins over auto-assign; `reset_voice` then `get_voice` re-rolls to the same deterministic value; mtime reload (instance A writes, instance B sees it).
   - `test_app_endpoints.py`: voices GET/POST/DELETE happy path against a tmp `BMO_VOICE_CAST_PATH` (monkeypatched env), plus POST validation failure (missing speaker → 400).
   - vitest: parser cases (step 5); a `bmo-bridge` shape test only if a bridge test harness already exists — otherwise the handler-level schema tests from 21B cover the boundary.

**Targeted cheap checks:** `cd bmo/pi && python -m pytest tests/test_voice_casting.py tests/test_app_endpoints.py -q`; `cd dnd-app && npx vitest run src/main/ai/ai-response-parser.test.ts && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`.

**Acceptance (21C):**
- Two different `[SPEAKER:]` names in one campaign resolve to two different voice ids; the same name resolves identically across bot restarts (file persistence) and across the Flask/bot process pair (shared JSON).
- `[SPEAKER:…]` never leaks into chat (strip test) and absent speaker keeps today's default voice path byte-identical.
- DM panel lists, edits, and re-rolls cast entries via the three new IPC channels, all zod-validated.

---

### 21D — Emotion-prosody map completion + vocabulary normalization

**Objective:** every mood in the VTT prompt vocabulary modulates prosody; NPC + emotion combine instead of emotion being silently ignored; legacy BMO moods keep working.

**Files:**
- `bmo/pi/services/voice_personality.py`
- `bmo/pi/tests/test_dm_bot_voice.py` (extend)

**Steps:**

1. **Complete `PIPER_EMOTION_PROSODY`** (`voice_personality.py:44-55`): add `"neutral": {"speed": 1.0, "pitch": 0}`, `"angry": {"speed": 1.08, "pitch": -2}`, `"menacing": {"speed": 0.82, "pitch": -4}`. Keep `"scared"` as-is.
2. **Normalization table.** New module-level `EMOTION_NORMALIZE: dict[str, str] = {"fearful": "scared", "afraid": "scared", "terrified": "scared", "furious": "angry", "enraged": "angry", "joyful": "happy", "cheerful": "happy", "ominous": "menacing", "sinister": "menacing", "tense": "dramatic"}` and `def normalize_emotion(emotion: str | None) -> str | None`: lower/strip, return canonical if in `PIPER_EMOTION_PROSODY`, else `EMOTION_NORMALIZE.get(value)`, else `None`.
3. **Combine NPC + emotion in `get_prosody`** (`:223-243`): `base = NPC_PROSODY.get(npc)` when npc known, else `{"speed": 1.0, "pitch": 0}`; `overlay = PIPER_EMOTION_PROSODY.get(normalize_emotion(emotion))` or neutral; combined `speed = round(min(1.4, max(0.6, base.speed * overlay.speed)), 3)`, `pitch = int(min(8, max(-10, base.pitch + overlay.pitch)))`. Behavior deltas vs today: (a) npc+known-emotion now combines (was: emotion ignored) — wanted; (b) npc-only and emotion-only results are numerically unchanged (neutral overlay/base is identity); (c) unknown npc + unknown emotion still `{"speed": 1.0, "pitch": 0}` — keeps the existing fallback test green.
4. **Legacy alias surfaces.** Extend `_EMOTION_ALIASES` (`:77-99`) and `BMO_EMOTIONS` (`:63-74`) with `angry`, `menacing`, `neutral` entries (BMO_EMOTIONS values default to `_DEFAULT_VOICE` via env like the rest, env names `FISH_AUDIO_BMO_ANGRY` etc.) so `detect_emotion("[EMOTION:angry] …")` (`:104-130`) recognizes the VTT vocabulary too. Map `fearful` in `_EMOTION_ALIASES` to `scared`.
5. **Tests** (`test_dm_bot_voice.py`): parametrize the full VTT vocabulary `["neutral", "calm", "happy", "sad", "angry", "excited", "fearful", "menacing"]` → `get_prosody(emotion=e)` returns non-flat prosody for every entry except `neutral` (exactly flat); `fearful` equals `scared`'s profile; combination test `get_prosody(npc="booming_dragon", emotion="angry")` → speed `0.7*1.08=0.756`, pitch clamped `max(-10, -8+-2) = -10`; clamp bounds test; `normalize_emotion` unknown → `None`; existing tests untouched and green.

**Targeted cheap checks:** `cd bmo/pi && python -m pytest tests/test_dm_bot_voice.py -q`.

**Acceptance (21D):**
- `python - <<'PY'` probe: every VTT mood returns a mapped profile; `get_prosody(npc=X, emotion=Y)` combines with clamping; `grep -n '"menacing"\|"angry"\|"neutral"' bmo/pi/services/voice_personality.py` shows the new keys.

## Research notes

- **Sentence splitting — `stream2sentence` (chosen).** `pip install stream2sentence`; `generate_sentences(generator, context_size=12, minimum_sentence_length=10, quick_yield_single_sentence_fragment=…, tokenizer="nltk"|"stanza", sentence_fragment_delimiters=…)` converts a chunk stream into sentences with abbreviation/quote handling; a time-based variant (`generate_sentences_time_based`, `target_tps`, `max_wait_for_fragments`, `min_output_lengths`) exists for pacing token streams. Chosen because it is tiny, generator-native (future token-stream feed needs zero rework), and is the exact library the RealtimeTTS stack uses internally. Caveat: the default nltk tokenizer needs punkt data at runtime (`nltk.download('punkt'/'punkt_tab')`) — hence the setup-bmo.sh pre-download AND the regex fallback so a fresh/offline Pi never hard-fails narration. Source: https://github.com/KoljaB/stream2sentence
- **`RealtimeTTS` (considered, rejected for this phase).** Wraps the whole text-stream→audio-stream pattern with engine classes (PiperEngine, KokoroEngine, system/cloud engines), `feed()` accepting iterators, `play_async()` with pause/resume/stop, and muted synthesis with `on_audio_chunk` callbacks for custom sinks (which is what Discord would need — we never want local speaker playback on the Pi). Rejected: it drags PyAudio/portaudio system deps onto a headless bot, its playback model is built around local audio devices, and our queue/cancel semantics around `discord.VoiceClient` are ~100 lines of asyncio we need to own anyway for barge-in. Source: https://pypi.org/project/realtimetts/
- **Kokoro-FastAPI (opt-in network backend).** `docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest` (arm64 CPU image exists; GPU images for NVIDIA). OpenAI-compatible `POST /v1/audio/speech` `{model:"kokoro", input, voice:"af_bella", response_format:"wav"|"pcm"|…, stream, speed}`; voice blending via `"af_bella+af_sky"` or weighted `"af_bella(2)+af_sky(1)"`; chunking tunables `TARGET_MIN_TOKENS`/`TARGET_MAX_TOKENS`/`TARGET_ABSOLUTE_MAX_TOKENS` (defaults 175/250/450); ~300 ms first chunk on GPU, ~3.5 s CPU on an older i7 — i.e. **not** a Pi-5-local choice, which is why it's gated behind `KOKORO_TTS_URL` pointing at a LAN box and the default stays Piper-on-Pi. Per-sentence requests with `stream: False` keep our integration trivial (we already chunk); revisit `stream: True` + `response_format: "pcm"` if inter-chunk latency matters. Sources: https://github.com/remsky/Kokoro-FastAPI, https://github.com/Viker/Kokoro-TTS-Discord-Bot (reference Discord integration), https://docs.clore.ai/guides/audio-and-voice/kokoro-tts
- **Piper (default local backend).** Already pinned (`piper-tts==1.4.2`, the OHF-Voice/piper1-gpl line). Python API: `PiperVoice.load(path)`, streaming `for chunk in voice.synthesize(text): chunk.audio_int16_bytes / sample_rate / sample_width / sample_channels`; `SynthesisConfig` exposes `length_scale` (2.0 = half speed → use `1/speed`), `noise_scale`, `noise_w_scale`, `volume`. Multi-speaker: `en_US-libritts_r-medium` ships **904 speakers** selected by speaker id (CLI `-s/--speaker`; config-level `speaker_id` in the Python API — probe the installed version, step 21A.2) — that one model file is the whole per-NPC voice pool on CPU. `--output-raw` streams raw PCM from the CLI if the subprocess path is ever preferred. Piper is the established Pi-friendly engine in this repo (`voice_pipeline.py` patterns reused: sox `tempo`/`pitch` post-processing, model dir conventions). Sources: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md, https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/libritts_r/medium, https://www.openslr.org/141/
- **discord.py playback/cancel patterns.** `VoiceClient.play(source, after=cb)` runs `after` on completion **and** on `stop()`; the canonical queue pattern chains via the `after` callback; since `after` fires on a non-loop thread, signal back with `loop.call_soon_threadsafe(event.set)` (our `_play_chunk`). `FFmpegPCMAudio(io.BytesIO(b), pipe=True)` is the in-memory WAV path already used at `discord_dm_bot.py:806-807`; `is_playing()` + `stop()` are the interruption primitives. Sources: https://fallendeity.github.io/discord.py-masterclass/audio-playback/, https://github.com/Rapptz/discord.py/issues/9001 (piped-input caveats)
- **Barge-in design.** Real-time voice pipelines implement barge-in as one cancellation signal fanned out to every stage (generation → chunk buffer → TTS request → playback); partial-result flushing matters more than cancel latency. Mapped here: the LLM leg already has `cancelChat`; the new `cancel_narration` covers buffer/synthesis/playback; the opt-in `interrupt` flag ties new turns to stale-audio replacement. Source: https://www.retellai.com/blog/how-real-time-voice-ai-works-stt-llm-tts
- **Per-NPC voice casting precedent.** Commercial AI-DM products (Friends & Fables, FoundryAI) ship per-character voices as a headline feature; the deterministic pool-assignment + override pattern mirrors how they cast on first appearance. Speaker tagging in model output is the prerequisite — hence `[SPEAKER:Name]` alongside the existing archetype tag rather than replacing it (archetype keeps working for unnamed characters and biases the pool group). Sources: https://fables.gg/, https://foundryvtt.com/packages/foundry-ai
- **Why queue-not-cooldown:** the 3 s `TTS_COOLDOWN` was a Fish-Audio rate-limit guard; with local synthesis the constraint disappears, and the serialization the cooldown half-provided is what the asyncio queue provides correctly. Fish fallback safety: per-sentence chunks are naturally spaced by playback duration (≥ several seconds each), so removal is safe even on the cloud path; the narrate route's Flask-side `RATE_LIMIT_NARRATE` (30/min) still bounds inbound volume.

## Test plan

- **21A:** NEW `bmo/pi/tests/test_discord_tts.py` (splitting incl. regex fallback + hard-split + merge; backend ladder with mocked env/requests/piper/fish; prosody no-op fast path). Extend `bmo/pi/tests/test_dm_bot_voice.py` (enqueue semantics, FIFO worker, no-truncation, no-VC guard).
- **21B:** Extend `test_dm_bot_voice.py` (cancel flush + `vc.stop()`, interrupt-enqueue) and `test_app_endpoints.py` (cancel route 404/ok). dnd-app: extend `use-narration-tts-store.test.ts` (bargeIn default false + persistence), `bmo-narration.test.ts` (payload-object shape), add `BmoNarrateRequestSchema` cases (new or existing schema test file).
- **21C:** NEW `bmo/pi/tests/test_voice_casting.py` (determinism, spread, archetype grouping, probing, persistence/atomicity, override, reset, cross-instance mtime reload); extend `test_app_endpoints.py` (voices GET/POST/DELETE + 400). dnd-app: extend `src/main/ai/ai-response-parser.test.ts` (SPEAKER parse/strip/bound).
- **21D:** Extend `test_dm_bot_voice.py` (full VTT vocabulary mapped, fearful≡scared, npc×emotion combination + clamps, normalize_emotion).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): from `dnd-app/` — `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run`; **plus** (Pi code touched) `cd bmo/pi && python -m pytest tests/ -q`.

## Acceptance criteria

1. No `text[:500]` and no `TTS_COOLDOWN` anywhere in `bmo/pi/bots/discord_dm_bot.py`; a narration of arbitrary length is fully chunked and queued (tests assert full-text coverage).
2. Sentence splitting works with and without `stream2sentence`/nltk-data installed (fallback test green); `stream2sentence` is pinned in both pip-compile lockfiles.
3. TTS backend ladder is env-driven: `KOKORO_TTS_URL` → Kokoro; else local Piper model (`PIPER_DM_MODEL`, libritts_r default, bmo-voice fallback); else `fish_audio_tts` — with native-speed/sox-pitch prosody applied per chunk.
4. `POST /api/discord/dm/narrate/cancel` (+v1) cancels current playback and flushes the queue; `_speak(interrupt=True)` does the same before enqueueing; both covered by pytest.
5. Barge-in is opt-in and off by default: with the toggle off, narrate payloads and request-start behavior are unchanged from PHASE-20; with it on, new turns send `interrupt: true` and fire a cancel at request start. A manual "Stop voice" button works regardless of the toggle.
6. `[SPEAKER:Name]` round-trips end-to-end: prompted, parsed, stripped from display, forwarded to the Pi, and resolved to a deterministic persisted voice; the DM can list/override/re-roll the cast from the DM panel through zod-validated IPC.
7. Every emotion in `neutral/calm/happy/sad/angry/excited/fearful/menacing` resolves to a real prosody profile; npc+emotion combine with clamped bounds; legacy moods unaffected.
8. New IPC channels (`BMO_NARRATE_CANCEL`, `BMO_VOICE_CAST_GET/SET/RESET`) registered in `ipc-channels.ts` with schemas in `ipc-schemas.ts`; preload + api types updated; both i18n locales carry every new key.
9. 4-gate + `pytest bmo/pi/tests` green; one phase commit; plan moved to `completed/`.

## Out of scope

- Process-split fix, honest narrate statuses (spoken/queued/dropped/no-voice), `eventId` idempotency, single-sender collapse, narrate 15 s-timeout/retry double-speak, 4xx-as-unreachable, session start/stop/status UI, VC reconnect + auto-leave callbacks, guild/channel config, `_log` kwargs crash — **PHASE-20**.
- VTT↔Discord sync plane (`register_sync_routes`, push helpers, `vtt_state`, `apply_patch.py`), push-to-Discord TEXT narration wiring — **PHASE-22**.
- `fish_audio_tts` key-on-cmdline + `--fail` security fix — **PHASE-15**.
- Emotion *vocabulary contract* wording in `voice-narration.ts` and the rest of the prompt-schema trio — **PHASE-11** (21C only appends the SPEAKER line; 21D makes the Pi accept both vocabularies).
- Entity records that would key voice casting on race/gender/age metadata — **PHASE-25** (the `meta` parameter is the hook).
- Pi-kiosk voice pipeline (`voice_pipeline.py`) refactors — untouched; only its sox/model-path conventions are reused.
- Async play-by-post Discord features — **PHASE-36**.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
