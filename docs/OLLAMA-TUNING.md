# Ollama tuning (dnd-app AI DM)

How dnd-app drives a local Ollama server, and the knobs for fitting larger
context windows on consumer hardware. Added in the PHASE-01 context-window work.

## What the app sends on every request

dnd-app talks to Ollama's **native `/api/chat`** endpoint (not the OpenAI-compat
`/v1/chat/completions`, which cannot set a context window). Every request carries:

- **`options.num_ctx`** — the context window in tokens. Resolved per model as
  `config override → curated recommendation → 16384 default`, then **clamped to the
  model's true maximum** (read once from `POST /api/show`). The resolved value is
  cached and byte-stable for the session so Ollama's prefix (KV) cache survives
  between turns.
- **`keep_alive: "60m"`** — keeps the model (and its KV cache) resident for an hour
  of idle play instead of unloading after Ollama's 5-minute default, which would
  discard the cache and re-pay the full prompt prefill on the next message. The API
  value overrides the server's `OLLAMA_KEEP_ALIVE` env.

The prompt is also laid out static-first / volatile-last (rules → campaign →
character → retrieval → game-state-snapshot) so the cache-stable prefix is as long
as possible; the cache invalidates at the first byte that differs from the previous
turn.

### Overriding the window

Per campaign (Settings → AI DM, once the PHASE-10 UI lands) or in `ai-config.json`:
`contextLength` (tokens, 2048–131072). Unset = auto. A value above the model's real
maximum is clamped down; below 4096 is clamped up.

## VRAM math (why you might quantize the KV cache)

The KV cache grows with `num_ctx`. On a GPU that can't hold model + KV at the window
you want, Ollama spills into CPU offload and both prefill and decode crater. Two env
flags shrink the KV cache (flash attention is the prerequisite for the second):

| KV cache type | KV memory | Quality | Example (Llama-3-8B-class @ 128k ctx, total) |
|---|---|---|---|
| `f16` (default) | baseline | — | 23.3 GB |
| `q8_0` | ½ | negligible loss | 17.0 GB |
| `q4_0` | ¼ | modest loss | 13.8 GB |

### Enabling tuning

**In-app (recommended):** set `ollamaKvCacheType` to `q8_0` or `q4_0` in the AI DM
config. When the app spawns the Ollama server it injects
`OLLAMA_FLASH_ATTENTION=1` + `OLLAMA_KV_CACHE_TYPE=<value>`. Unset = off (default;
the spawn env is byte-identical to before this feature). **This only affects a
server the app launches** — an already-running or system-managed Ollama is
unaffected until it is restarted through the app.

**Externally (system-managed Ollama):** add to your service config and restart:

```ini
# systemd: /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
```

(macOS launchd plist / Windows system env are the equivalents.)

### Caveat

KV quantization is a **global** setting (all models). Quality loss is negligible at
`q8_0`, measurable at `q4_0`. Some model families (Gemma 3 reported) actually slow
down with KV quantization — hence it is opt-in and off by default. See
[ollama#9683](https://github.com/ollama/ollama/issues/9683).

Recent Ollama **desktop GUI** builds expose their own context-length setting that can
override env expectations; the per-request `options.num_ctx` dnd-app sends remains
authoritative for dnd-app's own requests.

## Verifying it works

- **Server log:** if you see `msg="truncating input prompt" limit=N prompt=M`, the
  window is smaller than the prompt — raise `contextLength` or use a bigger-window
  model. With `num_ctx` sized correctly this line should not appear for normal play.
- **In-app:** `getLastOllamaStats().promptEvalCount` (surfaced by the PHASE-14
  context inspector) should be ≈ the app's estimated prompt size; a much smaller
  count means truncation.

## Sources

- [Ollama `/api/chat` reference](https://docs.ollama.com/api/chat) ·
  [api.md (`/api/show`, model_info)](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama FAQ — context length, keep_alive, KV cache type](https://docs.ollama.com/faq)
- [Why `/v1` can't set num_ctx — ollama#5356](https://github.com/ollama/ollama/issues/5356)
- [Prefix/KV cache mechanics](https://leanpub.com/read/ollama/prompt-caching) ·
  [KV-cache quantization measurements](https://mitjamartini.com/posts/ollama-kv-cache-quantization/)
- [Gemma KV-quant slowdown — ollama#9683](https://github.com/ollama/ollama/issues/9683)
