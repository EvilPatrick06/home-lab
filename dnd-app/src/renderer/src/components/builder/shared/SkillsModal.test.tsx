// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBuilderStore } from '../../../stores/use-builder-store'
import SkillsModal from './SkillsModal'

describe('SkillsModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SkillsModal')
    expect(mod).toBeDefined()
  })

  // Regression — the Bard "from: 'any'" crash. bard.json declares
  // `skillProficiencies.from: "any"` (a string, "choose any skill"). The class
  // selection used to store that string verbatim in `classSkillOptions`, so the
  // modal ran `"any".length > 0` (true: length 3) → `"any".join(', ')` →
  // "c.join is not a function", white-screening the whole character builder.
  // The fix normalizes 'any' → [] at the source (selection-slice) AND the modal
  // coerces defensively. Here we inject the raw string the source fix prevents,
  // proving the modal itself can no longer crash on it.
  it('does not crash when classSkillOptions is the string "any" (Bard / bad data)', () => {
    useBuilderStore.setState({
      classSkillOptions: 'any' as unknown as string[],
      maxSkills: 3
    })
    expect(() => render(<SkillsModal />)).not.toThrow()
    // "any" → empty list → the full skill list is offered (the "choose any
    // skill" semantics). A real skill row must be present.
    expect(screen.getByText('Acrobatics')).toBeTruthy()
  })

  it('offers the full skill list for a Bard (normalized empty options)', () => {
    useBuilderStore.setState({ classSkillOptions: [], maxSkills: 3 })
    render(<SkillsModal />)
    // Skills outside any single class list are present → all skills shown.
    expect(screen.getByText('Acrobatics')).toBeTruthy()
    expect(screen.getByText('Arcana')).toBeTruthy()
  })

  it('restricts to the class skill list when options are provided', () => {
    useBuilderStore.setState({ classSkillOptions: ['Athletics', 'Intimidation'], maxSkills: 2 })
    render(<SkillsModal />)
    expect(screen.getByText('Athletics')).toBeTruthy()
    // A skill NOT in the restricted list must be absent.
    expect(screen.queryByText('Arcana')).toBeNull()
  })
})
