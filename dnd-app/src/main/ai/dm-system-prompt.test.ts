import { describe, expect, it } from 'vitest'
import { DM_TOOLBOX_CONTEXT, PLANAR_RULES_CONTEXT } from './dm-system-prompt'

describe('dm-system-prompt', () => {
  // ── DM_TOOLBOX_CONTEXT ──

  describe('DM_TOOLBOX_CONTEXT', () => {
    it('is a non-empty string', () => {
      expect(typeof DM_TOOLBOX_CONTEXT).toBe('string')
      expect(DM_TOOLBOX_CONTEXT.length).toBeGreaterThan(50)
    })

    it('contains environmental effects', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Environmental Effects')
      expect(DM_TOOLBOX_CONTEXT).toContain('Extreme Cold')
      expect(DM_TOOLBOX_CONTEXT).toContain('Extreme Heat')
    })

    it('contains trap rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Traps')
      expect(DM_TOOLBOX_CONTEXT).toContain('detection')
    })

    it('contains poison rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Poisons')
      expect(DM_TOOLBOX_CONTEXT).toContain('Poisoned condition')
    })

    it('contains disease rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Diseases')
      expect(DM_TOOLBOX_CONTEXT).toContain('Cackle Fever')
      expect(DM_TOOLBOX_CONTEXT).toContain('Sewer Plague')
    })

    it('contains curse rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Curses')
      expect(DM_TOOLBOX_CONTEXT).toContain('Demonic Possession')
    })

    it('contains chase rules', () => {
      expect(DM_TOOLBOX_CONTEXT).toContain('Chase')
      expect(DM_TOOLBOX_CONTEXT).toContain('exhaustion')
    })
  })

  // ── PLANAR_RULES_CONTEXT ──

  describe('PLANAR_RULES_CONTEXT', () => {
    it('is a non-empty string', () => {
      expect(typeof PLANAR_RULES_CONTEXT).toBe('string')
      expect(PLANAR_RULES_CONTEXT.length).toBeGreaterThan(50)
    })

    it('contains Astral Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Astral Plane')
      expect(PLANAR_RULES_CONTEXT).toContain('Silver cords')
      expect(PLANAR_RULES_CONTEXT).toContain('Intelligence score')
    })

    it('contains Ethereal Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Ethereal Plane')
      expect(PLANAR_RULES_CONTEXT).toContain('Border Ethereal')
    })

    it('contains Feywild rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Feywild')
      expect(PLANAR_RULES_CONTEXT).toContain('Time distortion')
      expect(PLANAR_RULES_CONTEXT).toContain('Wild Magic')
    })

    it('contains Shadowfell rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Shadowfell')
      expect(PLANAR_RULES_CONTEXT).toContain('Despair')
    })

    it('contains Elemental Plane rules', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Elemental Planes')
      expect(PLANAR_RULES_CONTEXT).toContain('Fire')
      expect(PLANAR_RULES_CONTEXT).toContain('Water')
      expect(PLANAR_RULES_CONTEXT).toContain('Air')
      expect(PLANAR_RULES_CONTEXT).toContain('Earth')
    })

    it('contains Outer Planes reference', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Outer Planes')
      expect(PLANAR_RULES_CONTEXT).toContain('Nine Hells')
      expect(PLANAR_RULES_CONTEXT).toContain('Abyss')
    })

    it('contains planar travel methods', () => {
      expect(PLANAR_RULES_CONTEXT).toContain('Plane Shift')
      expect(PLANAR_RULES_CONTEXT).toContain('Gate')
      expect(PLANAR_RULES_CONTEXT).toContain('Astral Projection')
      expect(PLANAR_RULES_CONTEXT).toContain('Sigil')
    })
  })
})
