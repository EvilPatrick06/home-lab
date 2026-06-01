import { useState } from 'react'
import type {
  AttackEventResult,
  BastionEventResult,
  EnclaveCreatureEntry,
  ExpertTrainerEntry,
  ForgeConstructEntry,
  GamblingResult,
  GuildEntry,
  MenagerieCreatureEntry,
  PubSpecialEntry,
  TreasureResult
} from '../../data/bastion-events'
import {
  ALL_IS_WELL_FLAVORS,
  BASTION_EVENTS_TABLE,
  CREATURE_COSTS_BY_CR,
  EMERALD_ENCLAVE_CREATURES,
  EXPERT_TRAINERS,
  FORGE_CONSTRUCTS,
  GAMING_HALL_WINNINGS,
  GUEST_TABLE,
  MENAGERIE_CREATURES,
  PUB_SPECIALS,
  SAMPLE_GUILDS,
  TREASURE_TABLE
} from '../../data/bastion-events'
import { useT } from '../../i18n'
import { useBastionStore } from '../../stores/use-bastion-store'
import type { BasicFacilityDef, Bastion, BastionFacilitiesData, SpecialFacilityDef } from '../../types/bastion'
import { ENLARGE_COSTS, FACILITY_SPACE_SQUARES } from '../../types/bastion'
import type { Character5e } from '../../types/character-5e'
import { ORDER_COLORS, ORDER_LABELS } from './bastion-constants'

/** Type references to satisfy import usage for bastion event result types */
type _EventTypes =
  | BastionEventResult
  | AttackEventResult
  | GamblingResult
  | TreasureResult
  | MenagerieCreatureEntry
  | ExpertTrainerEntry
  | PubSpecialEntry
  | GuildEntry
  | EnclaveCreatureEntry
  | ForgeConstructEntry
  | BastionFacilitiesData

/** Show facility-relevant reference data from bastion event tables */
function FacilityReferenceData({ facilityType }: { facilityType: string }): JSX.Element | null {
  const { t } = useT()
  switch (facilityType) {
    case 'gaming-hall':
      return GAMING_HALL_WINNINGS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.winningsTable')}</span>{' '}
          {GAMING_HALL_WINNINGS.map((w) => w.description).join('; ')}
        </div>
      ) : null

    case 'menagerie':
      return MENAGERIE_CREATURES.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.availableCreatures')}</span>{' '}
          {MENAGERIE_CREATURES.map((c) => `${c.name} (CR ${c.cr}, ${c.cost} GP)`).join(', ')}
          {CREATURE_COSTS_BY_CR.length > 0 && (
            <span className="ml-1">
              {t('pages.facilityTabs.costByCr')} {CREATURE_COSTS_BY_CR.map((e) => `CR ${e.cr}=${e.cost} GP`).join(', ')}
            </span>
          )}
        </div>
      ) : null

    case 'training-area':
      return EXPERT_TRAINERS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.expertTrainers')}</span>{' '}
          {EXPERT_TRAINERS.map((trainer) => `${trainer.name} (${trainer.type})`).join(', ')}
        </div>
      ) : null

    case 'pub':
      return PUB_SPECIALS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.pubSpecials')}</span>{' '}
          {PUB_SPECIALS.map((p) => p.name).join(', ')}
        </div>
      ) : null

    case 'guildhall':
      return SAMPLE_GUILDS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.sampleGuilds')}</span>{' '}
          {SAMPLE_GUILDS.map((g) => g.guildType).join(', ')}
        </div>
      ) : null

    case 'emerald-enclave-grove':
      return EMERALD_ENCLAVE_CREATURES.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.enclaveCreatures')}</span>{' '}
          {EMERALD_ENCLAVE_CREATURES.map((c) => `${c.creatureType} (CR ${c.cr})`).join(', ')}
        </div>
      ) : null

    case 'construct-forge':
    case 'artificers-forge':
      return FORGE_CONSTRUCTS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-muted font-medium">{t('pages.facilityTabs.constructs')}</span>{' '}
          {FORGE_CONSTRUCTS.map((f) => `${f.name} (CR ${f.cr}, ${f.costGP} GP, ${f.timeDays} days)`).join(', ')}
        </div>
      ) : null

    default:
      return null
  }
}

/** Summary of bastion event tables for the events reference tooltip */
function _getEventTablesSummary(): {
  eventCount: number
  flavorCount: number
  guestCount: number
  treasureCount: number
} {
  return {
    eventCount: BASTION_EVENTS_TABLE.length,
    flavorCount: ALL_IS_WELL_FLAVORS.length,
    guestCount: GUEST_TABLE.length,
    treasureCount: TREASURE_TABLE.length
  }
}

export function BasicTab({
  bastion,
  basicDefs,
  onAdd,
  onRemove
}: {
  bastion: Bastion
  basicDefs: BasicFacilityDef[]
  onAdd: () => void
  onRemove: (id: string) => void
}): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">
          {t('pages.facilityTabs.basicFacilities', { count: bastion.basicFacilities.length })}
        </h2>
        <button
          onClick={onAdd}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded transition-colors"
        >
          {t('pages.facilityTabs.addBasicFacility')}
        </button>
      </div>
      {bastion.basicFacilities.length === 0 ? (
        <div className="text-sm text-gray-500 bg-surface rounded-lg p-4">
          {t('pages.facilityTabs.noBasicFacilities')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bastion.basicFacilities.map((f) => {
            const def = basicDefs.find((d) => d.type === f.type)
            return (
              <div key={f.id} className="bg-surface border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-fg">{f.name}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-border capitalize"
                      title={t('pages.facilityTabs.squaresTitle', { squares: FACILITY_SPACE_SQUARES[f.space] })}
                    >
                      {f.space} ({FACILITY_SPACE_SQUARES[f.space]} sq)
                    </span>
                  </div>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    {t('pages.facilityTabs.remove')}
                  </button>
                </div>
                {def && <p className="text-xs text-gray-500">{def.description}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AcquireCreaturePanel({
  bastion,
  facilityId,
  facilityType
}: {
  bastion: Bastion
  facilityId: string
  facilityType: string
}): JSX.Element {
  const { t } = useT()
  const creatures =
    facilityType === 'emerald-enclave-grove'
      ? EMERALD_ENCLAVE_CREATURES.map((c) => ({
          name: c.creatureType,
          creatureType: c.creatureType,
          size: 'medium' as const,
          cost: CREATURE_COSTS_BY_CR.find((e) => e.cr === c.cr)?.cost ?? 100,
          cr: c.cr
        }))
      : MENAGERIE_CREATURES

  return (
    <div className="mt-2 bg-surface-2/50 rounded p-3 border border-border">
      <h4 className="text-xs font-medium text-gray-300 mb-2">{t('pages.facilityTabs.acquireCreature')}</h4>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {creatures.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between text-xs bg-surface-2 rounded px-2 py-1 border border-border"
          >
            <span className="text-gray-200">
              {c.name}{' '}
              <span className="text-gray-500">
                (CR {c.cr}, {c.size})
              </span>
            </span>
            <button
              onClick={() => {
                const store = useBastionStore.getState()
                if (bastion.treasury < c.cost) return
                store.withdrawGold(bastion.id, c.cost)
                store.addCreature(bastion.id, facilityId, {
                  name: c.name,
                  creatureType: c.creatureType,
                  size: c.size,
                  isDefender: false
                })
              }}
              disabled={bastion.treasury < c.cost}
              className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              {c.cost} GP
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateConstructPanel({ bastion }: { bastion: Bastion }): JSX.Element {
  const { t } = useT()
  return (
    <div className="mt-2 bg-surface-2/50 rounded p-3 border border-border">
      <h4 className="text-xs font-medium text-gray-300 mb-2">{t('pages.facilityTabs.createConstruct')}</h4>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {FORGE_CONSTRUCTS.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between text-xs bg-surface-2 rounded px-2 py-1 border border-border"
          >
            <div>
              <span className="text-gray-200">{c.name}</span>
              <span className="text-gray-500 ml-1">
                (CR {c.cr}, {c.timeDays} days)
              </span>
            </div>
            <button
              onClick={() => {
                const store = useBastionStore.getState()
                if (bastion.treasury < c.costGP) return
                store.withdrawGold(bastion.id, c.costGP)
                store.addDefender(bastion.id, {
                  name: c.name,
                  barrackId: '',
                  isConstruct: true
                })
              }}
              disabled={bastion.treasury < c.costGP}
              className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              {c.costGP} GP
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SpecialTab({
  bastion,
  facilityDefs,
  owner5e: _owner5e,
  maxSpecial,
  onAdd,
  onRemove,
  onConfigure
}: {
  bastion: Bastion
  facilityDefs: SpecialFacilityDef[]
  owner5e: Character5e | null
  maxSpecial: number
  onAdd: () => void
  onRemove: (id: string) => void
  onConfigure: (id: string, config: Record<string, unknown>) => void
}): JSX.Element {
  const { t } = useT()
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">
          {t('pages.facilityTabs.specialFacilities', {
            count: bastion.specialFacilities.length,
            max: maxSpecial
          })}
        </h2>
        <button
          onClick={onAdd}
          disabled={bastion.specialFacilities.length >= maxSpecial}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
        >
          {t('pages.facilityTabs.addSpecialFacility')}
        </button>
      </div>
      {/* BAS-2 — at owner level < 5 there are 0 special-facility slots and Add is
          disabled with no explanation; tell the user why it's locked. */}
      {maxSpecial === 0 && <p className="text-xs text-amber-500">{t('pages.facilityTabs.specialLockedLevel5')}</p>}
      {bastion.specialFacilities.length === 0 ? (
        <div className="text-sm text-gray-500 bg-surface rounded-lg p-4">
          {t('pages.facilityTabs.noSpecialFacilities')}
        </div>
      ) : (
        <div className="space-y-3">
          {bastion.specialFacilities.map((f) => {
            const def = facilityDefs.find((d) => d.type === f.type)
            return (
              <div key={f.id} className="bg-surface border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-fg">{f.name}</span>
                    {def && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${
                          def.setting === 'core'
                            ? 'bg-surface-2 text-muted border-border'
                            : def.setting === 'fr'
                              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700'
                              : 'bg-orange-900/30 text-orange-400 border-orange-700'
                        }`}
                      >
                        Lv {def.level}
                      </span>
                    )}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-border capitalize"
                      title={`${t('pages.facilityTabs.squaresTitle', { squares: FACILITY_SPACE_SQUARES[f.space] })}${
                        !f.enlarged && f.space !== 'vast'
                          ? t('pages.facilityTabs.enlargeTitleSuffix', {
                              gp: ENLARGE_COSTS[f.space === 'cramped' ? 'cramped-roomy' : 'roomy-vast']?.gp ?? '?',
                              days: ENLARGE_COSTS[f.space === 'cramped' ? 'cramped-roomy' : 'roomy-vast']?.days ?? '?'
                            })
                          : ''
                      }`}
                    >
                      {f.space} ({FACILITY_SPACE_SQUARES[f.space]} sq)
                    </span>
                    {f.enlarged && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-700">
                        {t('pages.facilityTabs.enlarged')}
                      </span>
                    )}
                    {f.currentOrder && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[f.currentOrder]}`}>
                        {ORDER_LABELS[f.currentOrder]}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    {t('pages.facilityTabs.remove')}
                  </button>
                </div>
                {def && <p className="text-xs text-gray-500 mb-2">{def.description}</p>}
                {def?.charm && (
                  <div className="text-xs text-purple-300 mb-2">
                    {t('pages.facilityTabs.charmDetail', {
                      description: def.charm.description,
                      duration: def.charm.duration
                    })}
                  </div>
                )}
                {def?.permanentBenefit && (
                  <div className="text-xs text-amber-300 mb-2">
                    {t('pages.facilityTabs.benefit', { benefit: def.permanentBenefit })}
                  </div>
                )}
                {/* Order types */}
                {def && def.orders.length > 0 && (
                  <div className="flex gap-1 mb-2">
                    {def.orders.map((o) => (
                      <span key={o} className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[o]}`}>
                        {ORDER_LABELS[o]}
                      </span>
                    ))}
                  </div>
                )}
                {/* Hirelings */}
                {def && def.hirelingCount > 0 && (
                  <div className="text-xs text-gray-500">
                    {t('pages.facilityTabs.hirelings')}{' '}
                    {f.hirelingNames.length > 0
                      ? f.hirelingNames.join(', ')
                      : t('pages.facilityTabs.hirelingsAssigned', { count: def.hirelingCount })}
                  </div>
                )}
                {/* Type-specific config */}
                {f.type === 'garden' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">{t('pages.facilityTabs.type')}</span>
                    <select
                      value={f.gardenType || 'herb'}
                      onChange={(e) => onConfigure(f.id, { gardenType: e.target.value })}
                      className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="decorative">{t('pages.facilityTabs.gardenDecorative')}</option>
                      <option value="food">{t('pages.facilityTabs.gardenFood')}</option>
                      <option value="herb">{t('pages.facilityTabs.gardenHerb')}</option>
                      <option value="poison">{t('pages.facilityTabs.gardenPoison')}</option>
                    </select>
                  </div>
                )}
                {f.type === 'training-area' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">{t('pages.facilityTabs.trainer')}</span>
                    <select
                      value={f.trainerType || 'battle'}
                      onChange={(e) => onConfigure(f.id, { trainerType: e.target.value })}
                      className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="battle">{t('pages.facilityTabs.trainerBattle')}</option>
                      <option value="skills">{t('pages.facilityTabs.trainerSkills')}</option>
                      <option value="tools">{t('pages.facilityTabs.trainerTools')}</option>
                      <option value="unarmed-combat">{t('pages.facilityTabs.trainerUnarmedCombat')}</option>
                      <option value="weapon">{t('pages.facilityTabs.trainerWeapon')}</option>
                    </select>
                  </div>
                )}
                {/* Creatures (menagerie) */}
                {(f.type === 'menagerie' || f.type === 'emerald-enclave-grove') &&
                  f.creatures &&
                  f.creatures.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">{t('pages.facilityTabs.creatures')} </span>
                      {f.creatures.map((c, i) => (
                        <span key={i} className="text-xs text-gray-300">
                          {c.name} ({c.size}){i < (f.creatures?.length ?? 0) - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                {/* Facility-specific reference data from event tables */}
                <FacilityReferenceData facilityType={f.type} />
                {/* Acquire creature button for menagerie/grove */}
                {(f.type === 'menagerie' || f.type === 'emerald-enclave-grove') && (
                  <>
                    <button
                      onClick={() => setExpandedPanel(expandedPanel === f.id ? null : f.id)}
                      className="mt-2 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                    >
                      {expandedPanel === f.id
                        ? t('pages.facilityTabs.hideCreatures')
                        : t('pages.facilityTabs.acquireCreature')}
                    </button>
                    {expandedPanel === f.id && (
                      <AcquireCreaturePanel bastion={bastion} facilityId={f.id} facilityType={f.type} />
                    )}
                  </>
                )}
                {/* Create construct button for forges */}
                {(f.type === 'construct-forge' || f.type === 'artificers-forge') && (
                  <>
                    <button
                      onClick={() => setExpandedPanel(expandedPanel === f.id ? null : f.id)}
                      className="mt-2 px-2 py-1 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded transition-colors"
                    >
                      {expandedPanel === f.id
                        ? t('pages.facilityTabs.hideConstructs')
                        : t('pages.facilityTabs.createConstruct')}
                    </button>
                    {expandedPanel === f.id && <CreateConstructPanel bastion={bastion} />}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
