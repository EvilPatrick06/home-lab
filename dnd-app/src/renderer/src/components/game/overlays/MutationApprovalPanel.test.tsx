// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import MutationApprovalPanel from './MutationApprovalPanel'

// One set holding every type that was previously unlabeled (fell through to the raw type).
const ALL_NEW_TYPES = [
  { type: 'npc_attitude', name: 'Barkeep', attitude: 'friendly', reason: 'bribed' },
  { type: 'reduce_exhaustion', characterName: 'Aria', reason: 'rest' },
  { type: 'add_exhaustion', characterName: 'Aria', levels: 2, reason: 'forced march' },
  { type: 'set_equipped', name: 'Longsword', equipped: true },
  { type: 'set_proficiency', category: 'weapon', name: 'Longbow', proficient: true },
  { type: 'set_skill_proficiency', skill: 'Stealth', proficient: true },
  { type: 'set_save_proficiency', ability: 'dex', proficient: true },
  { type: 'creature_set_resistance', targetLabel: 'Golem', damageTypes: ['fire'], reason: 'r' },
  { type: 'creature_set_vulnerability', targetLabel: 'Golem', damageTypes: ['cold'], reason: 'r' },
  { type: 'creature_set_immunity', targetLabel: 'Golem', damageTypes: ['poison'], reason: 'r' },
  { type: 'creature_expend_spell_slot', targetLabel: 'Lich', level: 3, reason: 'r' },
  { type: 'creature_restore_spell_slot', targetLabel: 'Lich', level: 2, reason: 'r' }
]

const seed = (mutations: unknown[], id = 'set-1', messageId = 1): void =>
  useAiDmStore.setState({
    pendingMutations: [{ id, messageId, mutations: mutations as never, source: 'ai-dm', timestamp: Date.now() }]
  })

describe('MutationApprovalPanel', () => {
  afterEach(() => {
    for (const m of useAiDmStore.getState().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
    useAiDmStore.setState({ pendingMutations: [] })
  })

  it('labels every schema type — no raw type string leaks (F8)', () => {
    seed(ALL_NEW_TYPES)
    render(<MutationApprovalPanel />)
    for (const m of ALL_NEW_TYPES) {
      expect(screen.queryByText(m.type)).toBeNull()
    }
    // A couple of the translated fragments are present.
    expect(screen.getByText(/Proficiency: Stealth/)).toBeTruthy()
    expect(screen.getByText(/Golem: resistance to fire/)).toBeTruthy()
    expect(screen.getByText(/Exhaustion −1/)).toBeTruthy()
  })

  it('colors creature healing green and creature damage red (F9)', () => {
    seed([
      { type: 'creature_heal', targetLabel: 'Goblin', value: 5, reason: 'potion' },
      { type: 'creature_damage', targetLabel: 'Orc', value: 7, damageType: 'slashing', reason: 'sword' }
    ])
    const { container } = render(<MutationApprovalPanel />)
    const green = container.querySelector('.text-emerald-400')
    const red = container.querySelector('.text-red-400')
    expect(green?.textContent).toContain('Goblin')
    expect(red?.textContent).toContain('Orc')
  })

  it('renders a long reason in full with a title tooltip (F10)', () => {
    const reason = 'because '.repeat(25).trim() // ~200 chars
    seed([{ type: 'damage', value: 3, damageType: 'fire', reason }])
    const { container } = render(<MutationApprovalPanel />)
    const el = container.querySelector(`[title="${reason}"]`)
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain(reason)
    expect(el?.className).not.toContain('truncate')
  })

  it('exposes role=status on the panel root (F12)', () => {
    seed([{ type: 'heal', value: 5 }])
    render(<MutationApprovalPanel />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('Reject All renders with >1 set and empties the store (F11)', () => {
    useAiDmStore.setState({
      pendingMutations: [
        {
          id: 'a',
          messageId: 1,
          mutations: [{ type: 'heal', value: 1 }] as never,
          source: 'ai-dm',
          timestamp: Date.now()
        },
        {
          id: 'b',
          messageId: 2,
          mutations: [{ type: 'heal', value: 2 }] as never,
          source: 'ai-dm',
          timestamp: Date.now()
        }
      ]
    })
    render(<MutationApprovalPanel />)
    fireEvent.click(screen.getByText(/Reject All/))
    expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
  })
})
