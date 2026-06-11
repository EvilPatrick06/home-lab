/**
 * Ollama context-window resolution + tuning (PHASE-01).
 *
 * Leaf module: imports nothing from `ollama-client`, `ollama-manager`, or
 * `ai-service` — the Ollama base URL always arrives as a parameter so the import
 * graph stays acyclic (`ollama-client → ollama-context`,
 * `ollama-manager → ollama-context`, `ai-service → ollama-context`).
 *
 * Why this exists: Ollama's default context window is ~4k tokens and its
 * OpenAI-compat endpoint cannot override it, so the app must send `options.num_ctx`
 * over the native `/api/chat` endpoint. The resolved value MUST be byte-stable
 * across requests for a given model+config — a changed options block is treated as
 * a new runner configuration and wipes Ollama's prefix (KV) cache.
 */

/** Sent on every Ollama request so the model (and its KV cache) stays resident
 *  for an hour of idle play instead of unloading after the 5-minute default.
 *  The API value overrides the server's `OLLAMA_KEEP_ALIVE`. */
export const OLLAMA_KEEP_ALIVE = '60m'

/** Default `num_ctx` when neither a config override nor curated metadata applies. */
export const DEFAULT_NUM_CTX = 16384

/** Floor — never resolve below Ollama's own default window. */
export const MIN_NUM_CTX = 4096

export interface CuratedModel {
  id: string
  name: string
  vramMB: number
  /** Recommended `num_ctx` for this model on its target hardware tier; sent as
   *  `options.num_ctx` on every request and clamped to the model's reported
   *  maximum (via `/api/show`). Also shown in the install UI. */
  contextSize: number
  desc: string
}

export const CURATED_MODELS: CuratedModel[] = [
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    vramMB: 2500,
    contextSize: 16384,
    desc: 'Lightweight, great for weaker GPUs'
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    vramMB: 5000,
    contextSize: 16384,
    desc: 'Good quality, runs on most GPUs'
  },
  { id: 'mistral:7b', name: 'Mistral 7B', vramMB: 4500, contextSize: 16384, desc: 'Fast and capable' },
  { id: 'gemma2:9b', name: 'Gemma 2 9B', vramMB: 6000, contextSize: 8192, desc: 'High quality from Google' },
  { id: 'phi3:14b', name: 'Phi-3 14B', vramMB: 8000, contextSize: 4096, desc: 'Strong reasoning from Microsoft' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', vramMB: 5000, contextSize: 16384, desc: 'Versatile and capable' },
  {
    id: 'deepseek-r1:8b',
    name: 'DeepSeek R1 8B',
    vramMB: 5000,
    contextSize: 16384,
    desc: 'Excellent reasoning skills'
  },
  {
    id: 'mixtral:8x7b',
    name: 'Mixtral 8x7B',
    vramMB: 26000,
    contextSize: 16384,
    desc: 'Mixture of experts, great quality'
  },
  {
    id: 'command-r:35b',
    name: 'Command R 35B',
    vramMB: 20000,
    contextSize: 16384,
    desc: 'RAG-optimized, great for DM context'
  },
  {
    id: 'llama3.1:70b',
    name: 'Llama 3.1 70B',
    vramMB: 40000,
    contextSize: 16384,
    desc: 'Best quality, needs powerful GPU'
  }
]

/** Curated `num_ctx` for a model id. Exact id wins, else family-name prefix
 *  (`model.split(':')[0]`) so `llama3.1:8b-instruct-q5_K_M` still matches the
 *  `llama3.1:8b` family entry. Returns undefined if no curated entry matches. */
export function curatedContextSize(model: string): number | undefined {
  const exact = CURATED_MODELS.find((m) => m.id === model)
  if (exact) return exact.contextSize
  const base = model.split(':')[0]
  const fam = CURATED_MODELS.find((m) => m.id.split(':')[0] === base)
  return fam?.contextSize
}

// ── Manual override (AiConfig.contextLength) ──────────────────────────────

let configuredContextLength: number | undefined

export function setConfiguredContextLength(n: number | undefined): void {
  configuredContextLength = n
  clearNumCtxCache() // a changed override must re-resolve
}
export function getConfiguredContextLength(): number | undefined {
  return configuredContextLength
}

// ── Opt-in KV-cache tuning (AiConfig.ollamaKvCacheType) ───────────────────

let ollamaKvCacheType: 'q8_0' | 'q4_0' | undefined
export function setOllamaKvCacheType(v: 'q8_0' | 'q4_0' | undefined): void {
  ollamaKvCacheType = v
}
export function getOllamaKvCacheType(): 'q8_0' | 'q4_0' | undefined {
  return ollamaKvCacheType
}

// ── Model-max detection + num_ctx resolution ──────────────────────────────

const maxContextCache = new Map<string, number | undefined>()
const numCtxCache = new Map<string, number>()

/** POST {baseUrl}/api/show {model} → model_info["general.architecture"] →
 *  model_info[`${arch}.context_length`]. 5s timeout. Returns undefined on any
 *  failure (offline, old server, missing key). Cached per model. */
export async function fetchModelMaxContext(model: string, baseUrl: string): Promise<number | undefined> {
  if (maxContextCache.has(model)) return maxContextCache.get(model)
  let result: number | undefined
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(5000)
    })
    if (res.ok) {
      const data = (await res.json()) as { model_info?: Record<string, unknown> }
      const info = data.model_info
      const arch = info?.['general.architecture']
      if (info && typeof arch === 'string') {
        const ctx = info[`${arch}.context_length`]
        if (typeof ctx === 'number' && Number.isFinite(ctx)) result = ctx
      }
    }
  } catch {
    // offline / old server / timeout — leave undefined (resolution proceeds unclamped)
  }
  maxContextCache.set(model, result)
  return result
}

/** Deterministic per (model, configuredContextLength):
 *  choice   = configuredContextLength ?? curatedContextSize(model) ?? DEFAULT_NUM_CTX
 *  resolved = max(MIN_NUM_CTX, min(choice, modelMax ?? choice))
 *  Cached so the SAME value is returned for every request this session (a changed
 *  options block wipes the KV cache). The cache is keyed by model only because
 *  `setConfiguredContextLength` clears it on override change. */
export async function resolveNumCtx(model: string, baseUrl: string): Promise<number> {
  const cached = numCtxCache.get(model)
  if (cached !== undefined) return cached
  const choice = configuredContextLength ?? curatedContextSize(model) ?? DEFAULT_NUM_CTX
  const modelMax = await fetchModelMaxContext(model, baseUrl)
  const resolved = Math.max(MIN_NUM_CTX, Math.min(choice, modelMax ?? choice))
  numCtxCache.set(model, resolved)
  return resolved
}

/** Clear the resolution + model-max caches (e.g. on config change or URL switch). */
export function clearNumCtxCache(): void {
  numCtxCache.clear()
  maxContextCache.clear()
}
