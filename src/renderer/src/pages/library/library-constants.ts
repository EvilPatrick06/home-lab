export type Tab = 'monsters' | 'creatures' | 'npcs' | 'custom'
export type SortField = 'name' | 'cr' | 'type' | 'size'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'monsters', label: 'Monsters' },
  { id: 'creatures', label: 'Creatures' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'custom', label: 'Custom' }
]

export const CR_OPTIONS = [
  'Any',
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30'
]

export const TYPE_OPTIONS = [
  'Any',
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead'
]

export const SIZE_OPTIONS = ['Any', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']

export function sizeOrder(size: string): number {
  const order: Record<string, number> = { Tiny: 0, Small: 1, Medium: 2, Large: 3, Huge: 4, Gargantuan: 5 }
  return order[size] ?? 3
}
