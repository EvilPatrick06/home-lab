/**
 * Scans AI DM output for formatting violations before sending to renderer.
 * Returns cleaned text if violations found, or null if text is clean.
 */

interface ToneViolation {
  type: 'markdown_header' | 'bold_text' | 'bullet_list' | 'meta_label' | 'numbered_list'
  match: string
  index: number
}

import toneValidationJson from '../data/tone-validation.json'

const VIOLATION_PATTERNS: Array<{ type: ToneViolation['type']; pattern: RegExp }> =
  toneValidationJson.violationPatterns.map((p: { type: string; pattern: string; flags: string }) => ({
    type: p.type as ToneViolation['type'],
    pattern: new RegExp(p.pattern, p.flags)
  }))

export function detectToneViolations(text: string): ToneViolation[] {
  // Don't check inside JSON/action blocks
  const cleanedText = text
    .replace(/\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]/g, '')
    .replace(/\[DM_ACTIONS\][\s\S]*?\[\/DM_ACTIONS\]/g, '')
    .replace(/\[FILE_READ\][\s\S]*?\[\/FILE_READ\]/g, '')
    .replace(/\[WEB_SEARCH\][\s\S]*?\[\/WEB_SEARCH\]/g, '')

  const violations: ToneViolation[] = []

  for (const { type, pattern } of VIOLATION_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(cleanedText)) !== null) {
      violations.push({ type, match: match[0], index: match.index })
    }
  }

  return violations
}

export function cleanNarrativeText(text: string): string {
  // Preserve JSON blocks
  const jsonBlocks: string[] = []
  let cleaned = text.replace(
    /(\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]|\[DM_ACTIONS\][\s\S]*?\[\/DM_ACTIONS\]|\[FILE_READ\][\s\S]*?\[\/FILE_READ\]|\[WEB_SEARCH\][\s\S]*?\[\/WEB_SEARCH\])/g,
    (match) => {
      jsonBlocks.push(match)
      return `__JSON_BLOCK_${jsonBlocks.length - 1}__`
    }
  )

  // Remove markdown headers
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, '$1')
  // Remove bold markers
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
  // Remove bullet markers (preserve content)
  cleaned = cleaned.replace(/^[\s]*[-*]\s+/gm, '')
  // Remove numbered list markers
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '')
  // Remove meta-labels
  cleaned = cleaned.replace(
    /^(Scene Setting|Description|Overview|Read-aloud text|Summary|Introduction|Conclusion|Setting|Atmosphere|DM Note|Narration|Box Text)[:\s]*/gim,
    ''
  )

  // Restore JSON blocks
  for (let i = 0; i < jsonBlocks.length; i++) {
    cleaned = cleaned.replace(`__JSON_BLOCK_${i}__`, jsonBlocks[i])
  }

  return cleaned.trim()
}

export function hasViolations(text: string): boolean {
  return detectToneViolations(text).length > 0
}
