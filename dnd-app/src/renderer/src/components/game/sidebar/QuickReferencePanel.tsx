import { useState } from 'react'
import { useT } from '../../../i18n'
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
  titleKey: string
  descriptionKey: string
}

interface QuickReferencePanelProps {
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const TABS: { id: TabId; labelKey: string }[] = [
  { id: 'actions', labelKey: 'game.quickReferencePanel.tabActions' },
  { id: 'conditions', labelKey: 'game.quickReferencePanel.tabConditions' },
  { id: 'cover', labelKey: 'game.quickReferencePanel.tabCover' },
  { id: 'damage-types', labelKey: 'game.quickReferencePanel.tabDamageTypes' },
  { id: 'weapons', labelKey: 'game.quickReferencePanel.tabWeapons' },
  { id: 'dcs', labelKey: 'game.quickReferencePanel.tabDcs' },
  { id: 'spells', labelKey: 'game.quickReferencePanel.tabSpells' },
  { id: 'monsters', labelKey: 'game.quickReferencePanel.tabMonsters' },
  { id: 'equipment', labelKey: 'game.quickReferencePanel.tabEquipment' }
]

const ACTIONS: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.actions.attack.title',
    descriptionKey: 'game.quickReferencePanel.actions.attack.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.dash.title',
    descriptionKey: 'game.quickReferencePanel.actions.dash.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.disengage.title',
    descriptionKey: 'game.quickReferencePanel.actions.disengage.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.dodge.title',
    descriptionKey: 'game.quickReferencePanel.actions.dodge.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.help.title',
    descriptionKey: 'game.quickReferencePanel.actions.help.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.hide.title',
    descriptionKey: 'game.quickReferencePanel.actions.hide.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.influence.title',
    descriptionKey: 'game.quickReferencePanel.actions.influence.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.magic.title',
    descriptionKey: 'game.quickReferencePanel.actions.magic.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.ready.title',
    descriptionKey: 'game.quickReferencePanel.actions.ready.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.search.title',
    descriptionKey: 'game.quickReferencePanel.actions.search.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.study.title',
    descriptionKey: 'game.quickReferencePanel.actions.study.description'
  },
  {
    titleKey: 'game.quickReferencePanel.actions.utilize.title',
    descriptionKey: 'game.quickReferencePanel.actions.utilize.description'
  }
]

const CONDITIONS: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.conditions.blinded.title',
    descriptionKey: 'game.quickReferencePanel.conditions.blinded.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.charmed.title',
    descriptionKey: 'game.quickReferencePanel.conditions.charmed.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.deafened.title',
    descriptionKey: 'game.quickReferencePanel.conditions.deafened.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.exhaustion.title',
    descriptionKey: 'game.quickReferencePanel.conditions.exhaustion.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.frightened.title',
    descriptionKey: 'game.quickReferencePanel.conditions.frightened.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.grappled.title',
    descriptionKey: 'game.quickReferencePanel.conditions.grappled.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.incapacitated.title',
    descriptionKey: 'game.quickReferencePanel.conditions.incapacitated.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.invisible.title',
    descriptionKey: 'game.quickReferencePanel.conditions.invisible.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.paralyzed.title',
    descriptionKey: 'game.quickReferencePanel.conditions.paralyzed.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.petrified.title',
    descriptionKey: 'game.quickReferencePanel.conditions.petrified.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.poisoned.title',
    descriptionKey: 'game.quickReferencePanel.conditions.poisoned.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.prone.title',
    descriptionKey: 'game.quickReferencePanel.conditions.prone.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.restrained.title',
    descriptionKey: 'game.quickReferencePanel.conditions.restrained.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.stunned.title',
    descriptionKey: 'game.quickReferencePanel.conditions.stunned.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.unconscious.title',
    descriptionKey: 'game.quickReferencePanel.conditions.unconscious.description'
  },
  {
    titleKey: 'game.quickReferencePanel.conditions.bloodied.title',
    descriptionKey: 'game.quickReferencePanel.conditions.bloodied.description'
  }
]

const COVER: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.cover.half.title',
    descriptionKey: 'game.quickReferencePanel.cover.half.description'
  },
  {
    titleKey: 'game.quickReferencePanel.cover.threeQuarters.title',
    descriptionKey: 'game.quickReferencePanel.cover.threeQuarters.description'
  },
  {
    titleKey: 'game.quickReferencePanel.cover.total.title',
    descriptionKey: 'game.quickReferencePanel.cover.total.description'
  }
]

const DAMAGE_TYPES: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.damageTypes.acid.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.acid.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.bludgeoning.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.bludgeoning.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.cold.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.cold.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.fire.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.fire.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.force.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.force.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.lightning.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.lightning.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.necrotic.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.necrotic.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.piercing.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.piercing.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.poison.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.poison.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.psychic.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.psychic.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.radiant.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.radiant.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.slashing.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.slashing.description'
  },
  {
    titleKey: 'game.quickReferencePanel.damageTypes.thunder.title',
    descriptionKey: 'game.quickReferencePanel.damageTypes.thunder.description'
  }
]

const WEAPONS: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.weapons.ammunition.title',
    descriptionKey: 'game.quickReferencePanel.weapons.ammunition.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.finesse.title',
    descriptionKey: 'game.quickReferencePanel.weapons.finesse.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.heavy.title',
    descriptionKey: 'game.quickReferencePanel.weapons.heavy.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.light.title',
    descriptionKey: 'game.quickReferencePanel.weapons.light.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.loading.title',
    descriptionKey: 'game.quickReferencePanel.weapons.loading.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.range.title',
    descriptionKey: 'game.quickReferencePanel.weapons.range.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.reach.title',
    descriptionKey: 'game.quickReferencePanel.weapons.reach.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.thrown.title',
    descriptionKey: 'game.quickReferencePanel.weapons.thrown.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.twoHanded.title',
    descriptionKey: 'game.quickReferencePanel.weapons.twoHanded.description'
  },
  {
    titleKey: 'game.quickReferencePanel.weapons.versatile.title',
    descriptionKey: 'game.quickReferencePanel.weapons.versatile.description'
  }
]

const DCS: ReferenceItem[] = [
  {
    titleKey: 'game.quickReferencePanel.dcs.veryEasy.title',
    descriptionKey: 'game.quickReferencePanel.dcs.veryEasy.description'
  },
  {
    titleKey: 'game.quickReferencePanel.dcs.easy.title',
    descriptionKey: 'game.quickReferencePanel.dcs.easy.description'
  },
  {
    titleKey: 'game.quickReferencePanel.dcs.medium.title',
    descriptionKey: 'game.quickReferencePanel.dcs.medium.description'
  },
  {
    titleKey: 'game.quickReferencePanel.dcs.hard.title',
    descriptionKey: 'game.quickReferencePanel.dcs.hard.description'
  },
  {
    titleKey: 'game.quickReferencePanel.dcs.veryHard.title',
    descriptionKey: 'game.quickReferencePanel.dcs.veryHard.description'
  },
  {
    titleKey: 'game.quickReferencePanel.dcs.nearlyImpossible.title',
    descriptionKey: 'game.quickReferencePanel.dcs.nearlyImpossible.description'
  }
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReferenceList({ items }: { items: ReferenceItem[] }): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.titleKey} className="bg-surface-2/50 rounded-lg px-3 py-2 border border-border/30">
          <div className="text-xs font-semibold text-accent">{t(item.titleKey)}</div>
          <p className="text-[11px] text-gray-300 mt-0.5 leading-relaxed">{t(item.descriptionKey)}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickReferencePanel({ onClose }: QuickReferencePanelProps): JSX.Element {
  const { t } = useT()
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
    <div className="w-80 h-full bg-surface/95 border-l border-border flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-bold text-fg">{t('game.quickReferencePanel.title')}</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-surface-2 cursor-pointer transition-colors"
            title={t('common.actions.close')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex flex-wrap gap-1 px-3 py-2 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-600 text-white'
                : 'bg-surface-2 text-muted hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">{renderTabContent()}</div>
    </div>
  )
}
