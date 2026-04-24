import { DND_COMPOUND_TERMS } from './dnd-terms'

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'out',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'but',
  'and',
  'or',
  'if',
  'while',
  'about',
  'up',
  'that',
  'this',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'also',
  'get',
  'got',
  'like',
  'make',
  'take',
  'know',
  'think',
  'see',
  'come',
  'want',
  'look',
  'use',
  'go',
  'say',
  'tell',
  'work',
  'does',
  'much',
  'many',
  'well',
  'back',
  'even',
  'give',
  'way',
  'new'
])

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract D&D-aware keywords from a query.
 * Preserves compound D&D terms as phrases.
 */
export function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase()
  const keywords: string[] = []
  let remaining = lower

  for (const term of DND_COMPOUND_TERMS) {
    if (remaining.includes(term)) {
      keywords.push(term)
      remaining = remaining.replace(new RegExp(escapeRegex(term), 'g'), ' ')
    }
  }

  const words = remaining.split(/[^a-z0-9'-]+/).filter(Boolean)
  for (const word of words) {
    if (word.length > 1 && !STOP_WORDS.has(word)) {
      keywords.push(word)
    }
  }

  return [...new Set(keywords)]
}

/**
 * Tokenize text for TF-IDF indexing.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}
