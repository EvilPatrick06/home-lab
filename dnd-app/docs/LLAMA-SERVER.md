# Using a llama.cpp `llama-server` (experimental)

The AI DM's local provider can target a [llama.cpp](https://github.com/ggml-org/llama.cpp)
`llama-server` instead of Ollama. The main reason to bother: **speculative decoding**, which stock
Ollama still does not support ([ollama#5800](https://github.com/ollama/ollama/issues/5800), open
since 2024-07-19). The app **connects to** a server you launch yourself — it does not download,
start, or manage llama-server (that lifecycle is out of scope; the app only speaks its API).

## What the app uses

`llama-server` exposes OpenAI-compatible endpoints. With the `llama.cpp server (experimental)`
flavor selected, the app uses:

- `GET /health` — readiness check (`{"status":"ok"}` when ready, `503` while a model loads).
- `GET /v1/models` — model list; each entry's `id` is the model file path or the `--alias` value.
- `POST /v1/chat/completions` — streaming (SSE) + non-streaming chat, and JSON-schema-constrained
  output via `response_format: {type: "json_schema", json_schema: …}` (used by structured extraction).

No Ollama-only fields (`keep_alive`, `options`, `format`) or Ollama-binary management
(detect/install/pull, GPU pinning) are sent or run for this flavor.

## Launch examples

`llama-server` accepts **any** `model` value in chat requests (a single-model server ignores
mismatches), so the model id the app sends does not need to match exactly.

```bash
# llama.cpp master (2026) — current flag spellings:
llama-server -m Meta-Llama-3.1-8B-Instruct-Q8_0.gguf \
  --spec-draft-model Llama-3.2-1B-Instruct-Q8_0.gguf \
  --spec-draft-n-max 8 --spec-draft-n-min 4 --spec-draft-p-min 0.9 \
  -ngl 99 --spec-draft-ngl 99 -c 8192 --host 127.0.0.1 --port 8080

# Older releases / most online guides use the legacy spellings:
llama-server -m model.gguf -md draft.gguf \
  --draft-max 8 --draft-min 4 --draft-p-min 0.9 -ngld 99 \
  -c 8192 --host 127.0.0.1 --port 8080

# Draftless n-gram speculation (no second model — good for repetitive RPG prose):
llama-server -m model.gguf --spec-type ngram-simple -c 8192 --host 127.0.0.1 --port 8080
```

## Two important caveats

1. **The draft and target models must share a compatible vocabulary.** A mismatched pair (e.g. a
   draft with vocab 151936 against a target with vocab 248320) **fails to start**.
2. **Speedup is hardware- and model-dependent — benchmark before adopting.** ~1.5–2× is typical for
   *dense* targets with a good draft, but 2026 community benchmarks measured **3–12% net SLOWDOWNS**
   on some MoE/GPU combinations (e.g. Qwen3.6-35B-A3B on an RTX 3090) **even at 100% draft
   acceptance**. Predictable RPG prose has high acceptance, which favors gains on dense models, but
   measure on your own hardware.

## Point the app at it

In the campaign's **AI DM settings** → provider **Ollama** → **Local endpoint** → choose
`llama.cpp server (experimental)`, then set the server URL (e.g. `http://127.0.0.1:8080`). The
Ollama detect/install wizard is hidden for this flavor — only the URL field applies.

References: [speculative.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md),
[tools/server README](https://github.com/ggml-org/llama.cpp/tree/master/tools/server).
