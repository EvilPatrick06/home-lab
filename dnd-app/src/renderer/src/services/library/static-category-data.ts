// Inline rules reference data for Library categories that have no JSON source
// file — actions, cover, DCs, and damage types are short, stable 2024 5e lists
// that ship as code constants. Surfaced via library-service.loadCategoryItems.

export const ACTIONS_DATA = [
  { name: 'Attack', description: 'Attack with a weapon or Unarmed Strike.' },
  { name: 'Dash', description: 'Extra movement equal to your Speed for the rest of the turn.' },
  {
    name: 'Disengage',
    description: "Your movement doesn't provoke Opportunity Attacks for the rest of the turn."
  },
  {
    name: 'Dodge',
    description:
      'Attack rolls against you have Disadvantage; you have Advantage on DEX saves. Lost if Incapacitated or Speed is 0.'
  },
  {
    name: 'Help',
    description:
      'Give an ally Advantage on their next ability check (within 10 ft) or attack roll (within 5 ft) before your next turn.'
  },
  { name: 'Hide', description: 'Make a Stealth check to become Hidden. DC = passive Perception of observers.' },
  {
    name: 'Influence',
    description:
      "Make a CHA check to alter a creature's attitude: Persuasion (Indifferent/Friendly), Deception, or Intimidation (Hostile)."
  },
  { name: 'Magic', description: 'Cast a spell, use a magic item, or use a magical feature.' },
  {
    name: 'Ready',
    description: 'Choose a trigger and an action to take as a Reaction when that trigger occurs.'
  },
  { name: 'Search', description: 'Make a Perception or Investigation check to notice or find something.' },
  {
    name: 'Study',
    description: 'Make an Arcana, History, Investigation, Nature, or Religion check to recall or analyze information.'
  },
  {
    name: 'Utilize',
    description: 'Use a non-magical object or tool, or interact with an object that requires an action.'
  }
]

export const COVER_DATA = [
  {
    name: 'Half Cover',
    description: 'Target has +2 to AC and DEX saves. Blocked by obstacle covering at least half the target.'
  },
  {
    name: 'Three-Quarters Cover',
    description: 'Target has +5 to AC and DEX saves. Blocked by obstacle covering about three-quarters of the target.'
  },
  {
    name: 'Total Cover',
    description: "Target can't be targeted directly by attacks or spells. Completely concealed by an obstacle."
  }
]

export const DC_DATA = [
  { name: 'Very Easy (DC 5)', description: 'A trivial task that almost anyone can accomplish.' },
  { name: 'Easy (DC 10)', description: 'A task that most people can manage with little effort.' },
  {
    name: 'Medium (DC 15)',
    description: 'A task requiring focused effort; adventurers succeed about half the time.'
  },
  { name: 'Hard (DC 20)', description: 'A task demanding significant skill or luck.' },
  { name: 'Very Hard (DC 25)', description: 'A task achievable only by highly skilled or lucky individuals.' },
  { name: 'Nearly Impossible (DC 30)', description: 'An extraordinary task at the limit of mortal ability.' }
]

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder'
]
