import { describe, expect, it } from 'vitest'
import { DEFAULT_BLOCKED_WORDS, filterMessage } from './moderation'

describe('moderation', () => {
  describe('DEFAULT_BLOCKED_WORDS', () => {
    it('exports DEFAULT_BLOCKED_WORDS as an array', () => {
      expect(Array.isArray(DEFAULT_BLOCKED_WORDS)).toBe(true)
    })

    it('contains blocked words', () => {
      expect(DEFAULT_BLOCKED_WORDS.length).toBeGreaterThan(0)
    })

    it('all entries are non-empty strings', () => {
      for (const word of DEFAULT_BLOCKED_WORDS) {
        expect(typeof word).toBe('string')
        expect(word.length).toBeGreaterThan(0)
      }
    })

    it('all entries are lowercase', () => {
      for (const word of DEFAULT_BLOCKED_WORDS) {
        expect(word).toBe(word.toLowerCase())
      }
    })
  })

  describe('filterMessage', () => {
    it('replaces blocked words with ***', () => {
      const result = filterMessage('That is crap', ['crap'])
      expect(result).toBe('That is ***')
    })

    it('is case-insensitive', () => {
      const result = filterMessage('That is CRAP and Crap', ['crap'])
      expect(result).toBe('That is *** and ***')
    })

    it('only replaces whole words (word boundary matching)', () => {
      const result = filterMessage('The assassin crapped out', ['ass', 'crap'])
      // "ass" should not match inside "assassin" due to word boundary
      // "crap" should not match inside "crapped" — but the regex uses \b which matches at word boundaries
      // Actually "crapped" contains "crap" but \bcrap\b won't match "crapped" since "p" is followed by "p"
      expect(result).not.toContain('***assin')
    })

    it('preserves clean messages unchanged', () => {
      const clean = 'The brave hero fought the dragon valiantly.'
      expect(filterMessage(clean, ['badword'])).toBe(clean)
    })

    it('handles empty message', () => {
      expect(filterMessage('', ['test'])).toBe('')
    })

    it('handles empty blocked words list', () => {
      const message = 'Hello world'
      expect(filterMessage(message, [])).toBe(message)
    })

    it('replaces multiple different blocked words', () => {
      const result = filterMessage('He said damn and crap', ['damn', 'crap'])
      expect(result).toBe('He said *** and ***')
    })

    it('handles multiple occurrences of same word', () => {
      const result = filterMessage('damn the damn luck', ['damn'])
      expect(result).toBe('*** the *** luck')
    })

    it('preserves D&D-appropriate fantasy language', () => {
      const fantasy = 'The lich cast a devastating spell. The assassin struck from the shadows.'
      expect(filterMessage(fantasy, DEFAULT_BLOCKED_WORDS)).toBe(fantasy)
    })
  })
})
