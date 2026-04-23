import { describe, expect, it, vi } from 'vitest'
import { formatSearchResults, hasWebSearchTag, parseWebSearch, performWebSearch, stripWebSearch } from './web-search'

describe('hasWebSearchTag', () => {
  it('returns true when tag is present', () => {
    expect(hasWebSearchTag('Some text [WEB_SEARCH]{"query":"fireball"}[/WEB_SEARCH] more text')).toBe(true)
  })

  it('returns false when tag is absent', () => {
    expect(hasWebSearchTag('Some text without tags')).toBe(false)
  })

  it('returns false for partial tags', () => {
    expect(hasWebSearchTag('[WEB_SEARCH]no closing tag')).toBe(false)
  })
})

describe('parseWebSearch', () => {
  it('parses JSON query', () => {
    const result = parseWebSearch('[WEB_SEARCH]{"query":"D&D 5e grappling rules"}[/WEB_SEARCH]')
    expect(result).toEqual({ query: 'D&D 5e grappling rules' })
  })

  it('parses plain text query (no JSON)', () => {
    const result = parseWebSearch('[WEB_SEARCH]D&D 5e grappling rules[/WEB_SEARCH]')
    expect(result).toEqual({ query: 'D&D 5e grappling rules' })
  })

  it('returns null when no tag present', () => {
    expect(parseWebSearch('just regular text')).toBeNull()
  })

  it('returns null for empty content', () => {
    expect(parseWebSearch('[WEB_SEARCH]   [/WEB_SEARCH]')).toBeNull()
  })

  it('returns null for multiline plain text (not a valid query)', () => {
    expect(parseWebSearch('[WEB_SEARCH]line one\nline two[/WEB_SEARCH]')).toBeNull()
  })

  it('returns null for malformed JSON without query field', () => {
    expect(parseWebSearch('[WEB_SEARCH]{"search":"test"}[/WEB_SEARCH]')).toBeNull()
  })

  it('handles surrounding whitespace', () => {
    const result = parseWebSearch('[WEB_SEARCH]  {"query":"test"}  [/WEB_SEARCH]')
    expect(result).toEqual({ query: 'test' })
  })

  it('extracts query from text with surrounding narrative', () => {
    const text = 'Let me search. [WEB_SEARCH]{"query":"monk deflect missiles"}[/WEB_SEARCH] I found...'
    const result = parseWebSearch(text)
    expect(result).toEqual({ query: 'monk deflect missiles' })
  })
})

describe('stripWebSearch', () => {
  it('removes web search block from text', () => {
    const text = 'Before. [WEB_SEARCH]{"query":"test"}[/WEB_SEARCH] After.'
    expect(stripWebSearch(text)).toBe('Before.After.')
  })

  it('returns original text when no tag present', () => {
    expect(stripWebSearch('Hello world')).toBe('Hello world')
  })

  it('handles multiple web search blocks', () => {
    const text = 'A [WEB_SEARCH]q1[/WEB_SEARCH] B [WEB_SEARCH]q2[/WEB_SEARCH] C'
    const result = stripWebSearch(text)
    expect(result).not.toContain('WEB_SEARCH')
  })
})

describe('performWebSearch', () => {
  it('returns results from DuckDuckGo API', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        Abstract: 'Fireball is a 3rd-level evocation spell.',
        AbstractSource: 'D&D Wiki',
        AbstractURL: 'https://example.com/fireball',
        Heading: 'Fireball',
        RelatedTopics: []
      })
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('D&D fireball')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Fireball')
    expect(results[0].snippet).toContain('3rd-level')
    expect(results[0].url).toBe('https://example.com/fireball')

    vi.restoreAllMocks()
  })

  it('includes related topics', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        Abstract: '',
        RelatedTopics: [
          { Text: 'Topic 1 - description', FirstURL: 'https://example.com/1' },
          { Text: 'Topic 2 - description', FirstURL: 'https://example.com/2' }
        ]
      })
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('test query')
    expect(results).toHaveLength(2)

    vi.restoreAllMocks()
  })

  it('handles nested topics', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        Abstract: '',
        RelatedTopics: [
          {
            Topics: [{ Text: 'Nested topic - info', FirstURL: 'https://example.com/nested' }]
          }
        ]
      })
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('nested test')
    expect(results.some((r) => r.url === 'https://example.com/nested')).toBe(true)

    vi.restoreAllMocks()
  })

  it('returns "no results" fallback when API returns empty', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        Abstract: '',
        RelatedTopics: []
      })
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('xyznonexistent')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('No results')

    vi.restoreAllMocks()
  })

  it('returns error on HTTP failure', async () => {
    const mockResponse = {
      ok: false,
      status: 500
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('error query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Search Error')
    expect(results[0].snippet).toContain('500')

    vi.restoreAllMocks()
  })

  it('returns error on fetch exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'))

    const results = await performWebSearch('failing query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Search Error')
    expect(results[0].snippet).toContain('Network failure')

    vi.restoreAllMocks()
  })

  it('returns timeout error on abort', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

    const results = await performWebSearch('timeout query')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Search Timeout')

    vi.restoreAllMocks()
  })

  it('caps results at 5', async () => {
    const topics = Array.from({ length: 10 }, (_, i) => ({
      Text: `Topic ${i} - description`,
      FirstURL: `https://example.com/${i}`
    }))
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        Abstract: 'Main result',
        AbstractURL: 'https://example.com/main',
        Heading: 'Main',
        RelatedTopics: topics
      })
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const results = await performWebSearch('many results')
    expect(results.length).toBeLessThanOrEqual(5)

    vi.restoreAllMocks()
  })
})

describe('formatSearchResults', () => {
  it('formats results with header and footer', () => {
    const result = formatSearchResults('test query', [
      { title: 'Result 1', snippet: 'First result', url: 'https://example.com/1' }
    ])
    expect(result).toContain('[SEARCH RESULTS: test query]')
    expect(result).toContain('[/SEARCH RESULTS]')
    expect(result).toContain('Title: Result 1')
    expect(result).toContain('Snippet: First result')
    expect(result).toContain('URL: https://example.com/1')
  })

  it('omits URL line when URL is empty', () => {
    const result = formatSearchResults('test', [{ title: 'No URL', snippet: 'No link available', url: '' }])
    expect(result).not.toContain('URL:')
  })

  it('formats multiple results', () => {
    const result = formatSearchResults('multi', [
      { title: 'A', snippet: 'First', url: 'https://a.com' },
      { title: 'B', snippet: 'Second', url: 'https://b.com' }
    ])
    expect(result).toContain('Title: A')
    expect(result).toContain('Title: B')
  })
})
