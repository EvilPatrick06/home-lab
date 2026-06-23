"""Voice / audio service cluster for BMO.

Groups the nine voice/audio modules that were previously scattered in the flat
`services/` namespace:

- voice_pipeline    — the STT→LLM→TTS core (wake word, listening loop)
- voice_metrics     — per-stage latency rings (feeds /metrics + /api/metrics/voice)
- voice_personality — NPC prosody + personality voice config
- voice_casting     — NPC voice assignment
- voice_canary      — import-only boot validation of the pipeline
- bmo_say           — one-shot speech helper
- discord_tts       — Discord voice-channel TTS backend resolution
- audio_output_service — output device / volume control (wpctl)
- system_audio      — low-level system audio helpers

Import submodules explicitly, e.g. `from services.voice.voice_pipeline import
VoicePipeline`. This package intentionally does NOT eagerly import its
submodules: voice_pipeline pulls in heavy audio deps, so eager re-exports here
would force that cost (and risk import-order cycles) on anything that merely
touches `services.voice`. Submodule access (`from services.voice import
voice_metrics`) still works without eager imports.

Module file names are kept as-is per the "Service module names" rule in
bmo/docs/DESIGN-CONSTRAINTS.md (avoid stdlib-shadowing renames).
"""
