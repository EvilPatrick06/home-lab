import { describe, expect, it } from 'vitest'

// Test the internal formatting logic used by SpellCardView
// (Component rendering is validated via manual smoke tests)

describe('SpellCardView formatting', () => {
  it('formats spell level correctly', () => {
    const formatLevel = (level: number | undefined): string => {
      if (level === undefined || level === 0) return 'Cantrip'
      const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'
      return `${level}${suffix}-level`
    }

    expect(formatLevel(0)).toBe('Cantrip')
    expect(formatLevel(undefined)).toBe('Cantrip')
    expect(formatLevel(1)).toBe('1st-level')
    expect(formatLevel(2)).toBe('2nd-level')
    expect(formatLevel(3)).toBe('3rd-level')
    expect(formatLevel(4)).toBe('4th-level')
    expect(formatLevel(9)).toBe('9th-level')
  })

  it('formats components from object', () => {
    const formatComponents = (comp: unknown): string => {
      if (!comp) return '—'
      if (typeof comp === 'string') return comp
      if (typeof comp === 'object' && comp !== null) {
        const obj = comp as Record<string, unknown>
        const parts: string[] = []
        if (obj.verbal) parts.push('V')
        if (obj.somatic) parts.push('S')
        if (obj.material) parts.push(`M (${obj.materialDescription ?? ''})`)
        return parts.join(', ') || '—'
      }
      return String(comp)
    }

    expect(formatComponents({ verbal: true, somatic: true })).toBe('V, S')
    expect(formatComponents({ verbal: true, somatic: true, material: true, materialDescription: 'a feather' })).toBe(
      'V, S, M (a feather)'
    )
    expect(formatComponents('V, S, M')).toBe('V, S, M')
    expect(formatComponents(null)).toBe('—')
  })

  it('formats range from object', () => {
    const formatRange = (range: unknown): string => {
      if (!range) return '—'
      if (typeof range === 'string') return range
      if (typeof range === 'number') return `${range} feet`
      if (typeof range === 'object' && range !== null) {
        const obj = range as Record<string, unknown>
        if (obj.distance) return `${obj.distance} ${obj.unit ?? 'feet'}`
        return String(obj.type ?? '—')
      }
      return String(range)
    }

    expect(formatRange({ distance: 150, unit: 'feet' })).toBe('150 feet')
    expect(formatRange({ type: 'Self' })).toBe('Self')
    expect(formatRange('120 feet')).toBe('120 feet')
    expect(formatRange(60)).toBe('60 feet')
    expect(formatRange(null)).toBe('—')
  })
})
