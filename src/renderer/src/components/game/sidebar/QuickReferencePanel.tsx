import { useState } from 'react'
import EquipmentTab from './EquipmentTab'
import MonstersTab from './MonstersTab'
import SpellsTab from './SpellsTab'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId =
  | 'actions'
  | 'conditions'
  | 'cover'
  | 'damage-types'
  | 'weapons'
  | 'dcs'
  | 'spells'
  | 'monsters'
  | 'equipment'

interface ReferenceItem {
  title: string
  description: string
}

interface QuickReferencePanelProps {
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'cover', label: 'Cover' },
  { id: 'damage-types', label: 'Damage Types' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'dcs', label: 'DCs' },
  { id: 'spells', label: 'Spells' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'equipment', label: 'Equipment' }
]

const ACTIONS: ReferenceItem[] = [
  {
    title: 'Attack',
    description:
      'Attack with a weapon or Unarmed Strike. Unarmed Strike options: Damage (1 + STR mod Bludgeoning), Grapple (target makes STR/DEX save vs DC 8 + STR mod + PB), or Shove (same save; push 5 ft. or knock Prone).'
  },
  {
    title: 'Dash',
    description: 'For the rest of the turn, give yourself extra movement equal to your Speed.'
  },
  {
    title: 'Disengage',
    description: "Your movement doesn't provoke Opportunity Attacks for the rest of the turn."
  },
  {
    title: 'Dodge',
    description:
      'Until the start of your next turn, attack rolls against you have Disadvantage, and you make DEX saves with Advantage. Lost if Incapacitated or Speed is 0.'
  },
  {
    title: 'Help',
    description:
      "Help another creature's ability check or attack roll, or administer First Aid (DC 10 WIS (Medicine) to stabilize a creature with 0 HP)."
  },
  {
    title: 'Hide',
    description: 'Make a Dexterity (Stealth) check to become hidden.'
  },
  {
    title: 'Influence',
    description:
      "Make a Charisma (Deception, Intimidation, Performance, or Persuasion) or Wisdom (Animal Handling) check to alter a creature's attitude."
  },
  {
    title: 'Magic',
    description: 'Cast a spell, use a magic item, or use a magical feature.'
  },
  {
    title: 'Ready',
    description: 'Prepare to take an action in response to a trigger you define (uses your Reaction).'
  },
  {
    title: 'Search',
    description: 'Make a Wisdom (Insight, Medicine, Perception, or Survival) check.'
  },
  {
    title: 'Study',
    description: 'Make an Intelligence (Arcana, History, Investigation, Nature, or Religion) check.'
  },
  {
    title: 'Utilize',
    description: 'Use a nonmagical object.'
  }
]

const CONDITIONS: ReferenceItem[] = [
  {
    title: 'Blinded',
    description: "Can't see. Auto-fail sight checks. Attacks have disadvantage. Attacks against have advantage."
  },
  {
    title: 'Charmed',
    description: "Can't attack the charmer. The charmer has advantage on social checks against you."
  },
  {
    title: 'Deafened',
    description: "Can't hear. Auto-fail hearing checks."
  },
  {
    title: 'Exhaustion',
    description: 'Cumulative levels 1-6. Each level imposes -2 to d20 rolls. Speed reduced. Death at level 6.'
  },
  {
    title: 'Frightened',
    description:
      "Disadvantage on ability checks and attacks while the source of fear is within line of sight. Can't willingly move closer to the source."
  },
  {
    title: 'Grappled',
    description: "Speed becomes 0. Can't benefit from any bonus to speed."
  },
  {
    title: 'Incapacitated',
    description: "Can't take actions or reactions."
  },
  {
    title: 'Invisible',
    description:
      'Impossible to see without magic or special senses. Advantage on attacks. Attacks against have disadvantage.'
  },
  {
    title: 'Paralyzed',
    description:
      "Incapacitated. Can't move or speak. Auto-fail STR/DEX saves. Attacks against have advantage. Melee hits are automatic critical hits."
  },
  {
    title: 'Petrified',
    description: 'Turned to stone. Weight multiplied by 10. Incapacitated and unaware. Resistance to all damage.'
  },
  {
    title: 'Poisoned',
    description: 'Disadvantage on attack rolls and ability checks.'
  },
  {
    title: 'Prone',
    description:
      'Disadvantage on attack rolls. Melee attacks against have advantage. Ranged attacks against have disadvantage. Must use half movement to stand.'
  },
  {
    title: 'Restrained',
    description:
      'Speed becomes 0. Attacks have disadvantage. Attacks against have advantage. Disadvantage on DEX saves.'
  },
  {
    title: 'Stunned',
    description:
      "Incapacitated. Can't move. Can speak only falteringly. Auto-fail STR/DEX saves. Attacks against have advantage."
  },
  {
    title: 'Unconscious',
    description:
      'Incapacitated, prone, drop held items. Auto-fail STR/DEX saves. Attacks against have advantage. Melee hits are automatic critical hits.'
  },
  {
    title: 'Bloodied',
    description: 'A creature is Bloodied while it has half its Hit Points or fewer remaining.'
  }
]

const COVER: ReferenceItem[] = [
  {
    title: 'Half Cover (+2 AC, +2 DEX saves)',
    description:
      "An obstacle blocks at least half of the target's body. Examples: low wall, furniture, another creature."
  },
  {
    title: 'Three-Quarters Cover (+5 AC, +5 DEX saves)',
    description:
      "An obstacle blocks at least three-quarters of the target's body. Examples: arrow slit, thick tree trunk."
  },
  {
    title: 'Total Cover',
    description: 'The target is completely concealed. Cannot be targeted directly by attacks or spells.'
  }
]

const DAMAGE_TYPES: ReferenceItem[] = [
  { title: 'Acid', description: 'Corrosive chemicals and digestive enzymes.' },
  { title: 'Bludgeoning', description: 'Blunt force -- hammers, falling, constriction.' },
  { title: 'Cold', description: 'Freezing cold, ice, and arctic winds.' },
  { title: 'Fire', description: 'Flames, searing heat, and lava.' },
  { title: 'Force', description: 'Pure magical energy -- Magic Missile, Eldritch Blast.' },
  { title: 'Lightning', description: 'Electrical bolts and shocks.' },
  { title: 'Necrotic', description: 'Life-draining dark energy.' },
  { title: 'Piercing', description: 'Stabbing and puncturing -- arrows, spears, bites.' },
  { title: 'Poison', description: 'Venoms and toxic substances.' },
  { title: 'Psychic', description: 'Mental assault and psychic intrusion.' },
  { title: 'Radiant', description: 'Divine light and searing brilliance.' },
  { title: 'Slashing', description: 'Cutting and cleaving -- swords, axes, claws.' },
  { title: 'Thunder', description: 'Concussive sound waves and sonic booms.' }
]

const WEAPONS: ReferenceItem[] = [
  {
    title: 'Ammunition',
    description:
      'Requires ammunition to make a ranged attack. Each attack expends one piece of ammo. Drawing ammo is part of the attack.'
  },
  {
    title: 'Finesse',
    description: 'Use your choice of STR or DEX modifier for attack and damage rolls.'
  },
  {
    title: 'Heavy',
    description: 'Small creatures have disadvantage on attack rolls with this weapon.'
  },
  {
    title: 'Light',
    description: 'Can engage in two-weapon fighting when wielded alongside another light weapon.'
  },
  {
    title: 'Loading',
    description:
      'You can fire only one piece of ammunition per action, bonus action, or reaction, regardless of number of attacks.'
  },
  {
    title: 'Range',
    description:
      'Listed as two numbers: normal range and long range. Attacks beyond normal range have disadvantage. Cannot attack beyond long range.'
  },
  {
    title: 'Reach',
    description: 'Adds 5 feet to your melee reach when you attack with it and for opportunity attacks.'
  },
  {
    title: 'Thrown',
    description:
      'Can be thrown to make a ranged attack using the same ability modifier you would use for a melee attack.'
  },
  {
    title: 'Two-Handed',
    description: 'Requires two hands when you make an attack with it.'
  },
  {
    title: 'Versatile',
    description:
      'Can be used with one or two hands. A damage value in parentheses appears with the property and is the damage when used with two hands.'
  }
]

const DCS: ReferenceItem[] = [
  { title: 'Very Easy', description: 'DC 5' },
  { title: 'Easy', description: 'DC 10' },
  { title: 'Medium', description: 'DC 15' },
  { title: 'Hard', description: 'DC 20' },
  { title: 'Very Hard', description: 'DC 25' },
  { title: 'Nearly Impossible', description: 'DC 30' }
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReferenceList({ items }: { items: ReferenceItem[] }): JSX.Element {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.title} className="bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/30">
          <div className="text-xs font-semibold text-amber-400">{item.title}</div>
          <p className="text-[11px] text-gray-300 mt-0.5 leading-relaxed">{item.description}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickReferencePanel({ onClose }: QuickReferencePanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('actions')

  const renderTabContent = (): JSX.Element => {
    switch (activeTab) {
      case 'actions':
        return <ReferenceList items={ACTIONS} />
      case 'conditions':
        return <ReferenceList items={CONDITIONS} />
      case 'cover':
        return <ReferenceList items={COVER} />
      case 'damage-types':
        return <ReferenceList items={DAMAGE_TYPES} />
      case 'weapons':
        return <ReferenceList items={WEAPONS} />
      case 'dcs':
        return <ReferenceList items={DCS} />
      case 'spells':
        return <SpellsTab />
      case 'monsters':
        return <MonstersTab />
      case 'equipment':
        return <EquipmentTab />
    }
  }

  return (
    <div className="w-80 h-full bg-gray-900/95 border-l border-gray-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h2 className="text-sm font-bold text-gray-100">Quick Reference</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-gray-800 cursor-pointer transition-colors"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex flex-wrap gap-1 px-3 py-2 border-b border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">{renderTabContent()}</div>
    </div>
  )
}
