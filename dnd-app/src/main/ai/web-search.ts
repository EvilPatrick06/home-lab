/**
 * AI DM Web Search — parses [WEB_SEARCH] tags from AI responses,
 * performs web searches via DuckDuckGo Instant Answer API,
 * and formats results for injection back into the conversation.
 */

const WEB_SEARCH_RE = /\[WEB_SEARCH\]\s*([\s\S]*?)\s*\[\/WEB_SEARCH\]/

const SEARCH_TIMEOUT_MS = 10_000

export interface WebSearchRequest {
  query: string
}

export interface WebSearchResult {
  title: string
  snippet: string
  url: string
}

/** Check if the AI response contains a [WEB_SEARCH] tag. */
export function hasWebSearchTag(response: string): boolean {
  return WEB_SEARCH_RE.test(response)
}

/** Parse the [WEB_SEARCH] tag to extract the search query. */
export function parseWebSearch(response: string): WebSearchRequest | null {
  const match = response.match(WEB_SEARCH_RE)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1])
    if (parsed && typeof parsed.query === 'string') {
      return { query: parsed.query }
    }
  } catch {
    // Try plain text query (no JSON wrapper)
    const trimmed = match[1].trim()
    if (trimmed && !trimmed.includes('\n')) {
      return { query: trimmed }
    }
  }
  return null
}

/** Remove the [WEB_SEARCH] tag from response text for display. */
export function stripWebSearch(response: string): string {
  return response.replace(/\s*\[WEB_SEARCH\][\s\S]*?\[\/WEB_SEARCH\]\s*/g, '').trim()
}

/** Perform a web search using DuckDuckGo Instant Answer API. */
export async function performWebSearch(query: string): Promise<WebSearchResult[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Web search failed: HTTP ${response.status}`)
    }

    const data = (await response.json()) as {
      Abstract?: string
      AbstractSource?: string
      AbstractURL?: string
      Heading?: string
      RelatedTopics?: Array<{
        Text?: string
        FirstURL?: string
        Result?: string
        Topics?: Array<{ Text?: string; FirstURL?: string }>
      }>
    }

    const results: WebSearchResult[] = []

    // Main abstract result
    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.Heading || data.AbstractSource || 'Result',
        snippet: data.Abstract,
        url: data.AbstractURL
      })
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= 5) break
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0]?.slice(0, 80) || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL
          })
        }
        // Nested topics
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (results.length >= 5) break
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0]?.slice(0, 80) || 'Related',
                snippet: sub.Text,
                url: sub.FirstURL
              })
            }
          }
        }
      }
    }

    if (results.length === 0) {
      results.push({
        title: 'No results',
        snippet: `No instant answers found for "${query}". Try rephrasing your search.`,
        url: ''
      })
    }

    return results
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return [{ title: 'Search Timeout', snippet: 'The search request timed out after 10 seconds.', url: '' }]
    }
    return [{ title: 'Search Error', snippet: (err as Error).message, url: '' }]
  } finally {
    clearTimeout(timeout)
  }
}

/** Format search results for injection into the conversation. */
export function formatSearchResults(query: string, results: WebSearchResult[]): string {
  const lines = [`[SEARCH RESULTS: ${query}]`]
  for (const r of results) {
    lines.push(`Title: ${r.title}`)
    lines.push(`Snippet: ${r.snippet}`)
    if (r.url) lines.push(`URL: ${r.url}`)
    lines.push('')
  }
  lines.push('[/SEARCH RESULTS]')
  return lines.join('\n')
}
