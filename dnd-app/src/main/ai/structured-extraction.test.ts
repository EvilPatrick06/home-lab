import { describe, expect, it } from 'vitest'
import type { GameStateSnapshot } from './game-state-validation'
import {
  buildExtractionPrompts,
  EXTRACTION_CHANGE_TYPES,
  EXTRACTION_JSON_SCHEMA,
  mapExtractedToStatChanges,
  parseExtractionResponse,
  runStructuredExtraction
} from './structured-extraction'

const snapshot: GameStateSnapshot = {
  partyNames: ['Aria', 'Korgan'],
  creatureLabels: ['Goblin', 'Goblin 2']
}

describe('structured-extraction (PHASE-23 23A)', () => {
  describe('schema', () => {
    it('is a flat object: 12-type enum, all fields required, additionalProperties false', () => {
      const s = EXTRACTION_JSON_SCHEMA as Record<string, unknown>
      const item = (s.properties as Record<string, { items: Record<string, unknown> }>).changes.items
      expect((item.properties as Record<string, { enum?: string[] }>).type.enum).toHaveLength(12)
      expect(EXTRACTION_CHANGE_TYPES).toHaveLength(12)
      expect((item.required as string[]).sort()).toEqual(['name', 'reason', 'target', 'type', 'value'])
      expect(item.additionalProperties).toBe(false)
    })
  })

  describe('buildExtractionPrompts', () => {
    it('embeds the schema, referent lists, and the empty-result rule', () => {
      const { system, user } = buildExtractionPrompts('The goblin dies.', snapshot)
      expect(system).toContain('"changes"')
      expect(system).toContain('{"changes":[]}')
      expect(user).toContain('Aria, Korgan')
      expect(user).toContain('Goblin, Goblin 2')
      expect(user).toContain('The goblin dies.')
    })
  })

  describe('parseExtractionResponse', () => {
    it('parses clean JSON', () => {
      expect(parseExtractionResponse('{"changes":[]}')).toEqual({ changes: [] })
    })
    it('parses markdown-fenced JSON via brace slice', () => {
      const r = parseExtractionResponse(
        '```json\n{"changes":[{"type":"heal","target":"Aria","value":5,"name":"","reason":"potion"}]}\n```'
      )
      expect(r?.changes).toHaveLength(1)
    })
    it('returns null on unparseable garbage', () => {
      expect(parseExtractionResponse('not json at all')).toBeNull()
      expect(parseExtractionResponse('')).toBeNull()
    })
    it('returns null on shape mismatch', () => {
      expect(parseExtractionResponse('{"wrong":true}')).toBeNull()
    })
  })

  describe('mapExtractedToStatChanges', () => {
    it('maps a party-name damage to {damage, characterName}', () => {
      const { changes } = mapExtractedToStatChanges(
        [{ type: 'damage', target: 'Aria', value: 7, name: '', reason: 'arrow' }],
        snapshot
      )
      expect(changes).toEqual([{ type: 'damage', characterName: 'Aria', value: 7, reason: 'arrow' }])
    })
    it('maps a creature-label damage to {creature_damage, targetLabel}', () => {
      const { changes } = mapExtractedToStatChanges(
        [{ type: 'damage', target: 'Goblin', value: 4, name: '', reason: 'sword' }],
        snapshot
      )
      expect(changes).toEqual([{ type: 'creature_damage', targetLabel: 'Goblin', value: 4, reason: 'sword' }])
    })
    it('resolves a unique case-insensitive prefix', () => {
      const { changes } = mapExtractedToStatChanges(
        [{ type: 'heal', target: 'kor', value: 3, name: '', reason: 'potion' }],
        snapshot
      )
      expect(changes[0]).toMatchObject({ type: 'heal', characterName: 'Korgan', value: 3 })
    })
    it('drops an unknown target with an issue', () => {
      const { changes, issues } = mapExtractedToStatChanges(
        [{ type: 'damage', target: 'Nobody', value: 5, name: '', reason: 'x' }],
        snapshot
      )
      expect(changes).toEqual([])
      expect(issues.some((i) => i.includes('Nobody'))).toBe(true)
    })
    it('drops a creature-incompatible type aimed at a creature', () => {
      const { changes, issues } = mapExtractedToStatChanges(
        [{ type: 'xp', target: 'Goblin', value: 50, name: '', reason: 'x' }],
        snapshot
      )
      expect(changes).toEqual([])
      expect(issues.some((i) => i.includes('cannot target a creature'))).toBe(true)
    })
    it('maps slot-level and exhaustion fields', () => {
      const { changes } = mapExtractedToStatChanges(
        [
          { type: 'expend_spell_slot', target: 'Aria', value: 3, name: '', reason: 'fireball' },
          { type: 'add_exhaustion', target: 'Korgan', value: 1, name: '', reason: 'march' }
        ],
        snapshot
      )
      expect(changes).toContainEqual({ type: 'expend_spell_slot', characterName: 'Aria', level: 3, reason: 'fireball' })
      expect(changes).toContainEqual({ type: 'add_exhaustion', characterName: 'Korgan', levels: 1, reason: 'march' })
    })
    it('maps an empty target to the acting character (no characterName)', () => {
      const { changes } = mapExtractedToStatChanges(
        [{ type: 'heal', target: '', value: 2, name: '', reason: 'rest' }],
        snapshot
      )
      expect(changes[0]).toEqual({ type: 'heal', value: 2, reason: 'rest' })
    })
  })

  describe('runStructuredExtraction', () => {
    it('returns null when the provider has no structuredOnce', async () => {
      const r = await runStructuredExtraction({ structuredOnce: undefined }, 'm', 'narration', snapshot)
      expect(r).toBeNull()
    })
    it('returns null when the call throws', async () => {
      const provider = {
        structuredOnce: async () => {
          throw new Error('boom')
        }
      }
      expect(await runStructuredExtraction(provider, 'm', 'n', snapshot)).toBeNull()
    })
    it('parses + maps a successful structured response', async () => {
      const provider = {
        structuredOnce: async () =>
          JSON.stringify({ changes: [{ type: 'damage', target: 'Aria', value: 6, name: '', reason: 'trap' }] })
      }
      const r = await runStructuredExtraction(provider, 'm', 'n', snapshot)
      expect(r?.changes).toEqual([{ type: 'damage', characterName: 'Aria', value: 6, reason: 'trap' }])
    })
  })
})
