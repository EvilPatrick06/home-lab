/**
 * D&D compound terms that should be kept together during keyword extraction.
 * Ordered by length (longest first) so longer phrases match before shorter ones.
 */
import dndTermsJson from '../data/dnd-terms.json'

export const DND_COMPOUND_TERMS: string[] = dndTermsJson
