/**
 * PHASE-24 24C — Ollama embeddings client (leaf module; imports nothing from the
 * AI service graph). `POST /api/embed` with batched input. Vectors come back
 * L2-normalized, so cosine similarity ≡ dot product.
 */

export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'

// nomic-embed-text v1.5 was trained with task prefixes that Ollama does NOT add
// automatically; unknown models default to no prefix.
export const EMBEDDING_MODEL_PREFIXES: Record<string, { document: string; query: string }> = {
  'nomic-embed-text': { document: 'search_document: ', query: 'search_query: ' }
}

export function prefixesFor(model: string): { document: string; query: string } {
  const base = model.split(':')[0]
  return EMBEDDING_MODEL_PREFIXES[base] ?? { document: '', query: '' }
}

interface EmbedResponse {
  embeddings?: number[][]
}

/**
 * Embed a batch of texts. `num_ctx: 8192` is required — the nomic Ollama card
 * defaults to a 2k window while rulebook chunks reach ~2.4k estimated tokens, so
 * without it long chunks get silently truncated at embed time.
 */
export async function embedTexts(
  model: string,
  inputs: string[],
  baseUrl: string,
  timeoutMs = 120_000
): Promise<number[][]> {
  const res = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: inputs,
      truncate: true,
      options: { num_ctx: 8192 },
      keep_alive: '60m'
    }),
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Model "${model}" is not installed on Ollama. Install it with: ollama pull ${model}`)
    }
    throw new Error(`Ollama /api/embed HTTP ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as EmbedResponse
  const embeddings = data.embeddings
  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
    throw new Error(`Ollama /api/embed returned ${embeddings?.length ?? 0} vectors for ${inputs.length} inputs`)
  }
  return embeddings
}

/** Embed a single query (with the model's query prefix), short timeout. */
export async function embedQuery(model: string, text: string, baseUrl: string): Promise<number[]> {
  const [vec] = await embedTexts(model, [prefixesFor(model).query + text], baseUrl, 10_000)
  return vec
}
