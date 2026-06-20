// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type Bastion, type ConstructionProject, createDefaultBastion } from '../../types/bastion'
import { BasicTab, SpecialTab } from './FacilityTabs'

function bastionWith(construction: ConstructionProject[]): Bastion {
  const b = createDefaultBastion('owner-1', 'Test Keep')
  return { ...b, construction }
}

describe('FacilityTabs', () => {
  it('can be imported', async () => {
    const mod = await import('./FacilityTabs')
    expect(mod).toBeDefined()
  })

  it('BasicTab renders an in-progress basic construction project so spent GP is visible', () => {
    const project: ConstructionProject = {
      id: 'proj-basic-1',
      projectType: 'add-basic',
      facilityType: 'kitchen',
      targetSpace: 'roomy',
      cost: 1000,
      daysRequired: 45,
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }
    render(<BasicTab bastion={bastionWith([project])} basicDefs={[]} onAdd={() => {}} onRemove={() => {}} />)
    // The queue header + the queued project (with its days/cost) must be visible
    // on the Basic Facilities tab itself, not just the Overview tab.
    expect(screen.getByText('Construction Queue')).toBeTruthy()
    expect(screen.getByText(/add basic: kitchen/i)).toBeTruthy()
    expect(screen.getByText(/0\/45 days \(1000 GP\)/)).toBeTruthy()
  })

  it('BasicTab does not show the construction queue when there are no basic projects', () => {
    render(<BasicTab bastion={bastionWith([])} basicDefs={[]} onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.queryByText('Construction Queue')).toBeNull()
  })

  it('BasicTab ignores special-facility projects (those belong on the Special tab)', () => {
    const special: ConstructionProject = {
      id: 'proj-special-1',
      projectType: 'add-special',
      specialFacilityType: 'library',
      specialFacilityName: 'Grand Library',
      specialFacilitySpace: 'roomy',
      cost: 0,
      daysRequired: 0,
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }
    render(<BasicTab bastion={bastionWith([special])} basicDefs={[]} onAdd={() => {}} onRemove={() => {}} />)
    expect(screen.queryByText('Construction Queue')).toBeNull()
  })

  it('SpecialTab renders an in-progress special construction project', () => {
    const project: ConstructionProject = {
      id: 'proj-special-2',
      projectType: 'add-special',
      specialFacilityType: 'library',
      specialFacilityName: 'Grand Library',
      specialFacilitySpace: 'roomy',
      cost: 0,
      daysRequired: 0,
      daysCompleted: 0,
      startedAt: new Date().toISOString()
    }
    render(
      <SpecialTab
        bastion={bastionWith([project])}
        facilityDefs={[]}
        owner5e={null}
        maxSpecial={2}
        onAdd={() => {}}
        onRemove={() => {}}
        onConfigure={() => {}}
      />
    )
    expect(screen.getByText('Construction Queue')).toBeTruthy()
    expect(screen.getByText(/Building: Grand Library/)).toBeTruthy()
  })
})
