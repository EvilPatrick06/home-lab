import { useEffect, useRef, useState } from 'react'
import { AI_MUTATIONS_AUTO_REJECT_MS } from '../../../constants'
import { i18n, useT } from '../../../i18n'
import { type PendingMutationSet, useAiDmStore } from '../../../stores/use-ai-dm-store'
import { announce } from '../../ui/ScreenReaderAnnouncer'

/** Total countdown seconds — derived from the store's auto-reject timeout so the
 * UI and the actual timer can't drift apart. */
const AUTO_REJECT_SECONDS = Math.round(AI_MUTATIONS_AUTO_REJECT_MS / 1000)

/** Human-readable label for a stat change type */
function changeLabel(change: { type: string; [key: string]: unknown }): string {
  const type = change.type
  switch (type) {
    case 'damage':
      return i18n.t('game.mutationApprovalPanel.damage', { value: change.value, damageType: change.damageType ?? '' })
    case 'heal':
      return i18n.t('game.mutationApprovalPanel.heal', { value: change.value })
    case 'temp_hp':
      return i18n.t('game.mutationApprovalPanel.tempHp', { value: change.value })
    case 'add_condition':
      return i18n.t('game.mutationApprovalPanel.addCondition', { name: change.name })
    case 'remove_condition':
      return i18n.t('game.mutationApprovalPanel.removeCondition', { name: change.name })
    case 'death_save':
      return i18n.t('game.mutationApprovalPanel.deathSave', { result: change.success ? '✓' : '✗' })
    case 'reset_death_saves':
      return i18n.t('game.mutationApprovalPanel.resetDeathSaves')
    case 'expend_spell_slot':
      return i18n.t('game.mutationApprovalPanel.expendSpellSlot', { level: change.level })
    case 'restore_spell_slot':
      return i18n.t('game.mutationApprovalPanel.restoreSpellSlot', { level: change.level })
    case 'add_item':
      return i18n.t('game.mutationApprovalPanel.addItem', {
        name: change.name,
        qty: (change.quantity as number) > 1 ? ` ×${change.quantity}` : ''
      })
    case 'remove_item':
      return i18n.t('game.mutationApprovalPanel.removeItem', {
        name: change.name,
        qty: (change.quantity as number) > 1 ? ` ×${change.quantity}` : ''
      })
    case 'gold':
      return i18n.t('game.mutationApprovalPanel.gold', {
        sign: (change.value as number) >= 0 ? '+' : '',
        value: change.value,
        denomination: change.denomination ?? 'gp'
      })
    case 'xp':
      return i18n.t('game.mutationApprovalPanel.xp', { value: change.value })
    case 'use_class_resource':
      return i18n.t('game.mutationApprovalPanel.useClassResource', { name: change.name })
    case 'restore_class_resource':
      return i18n.t('game.mutationApprovalPanel.restoreClassResource', { name: change.name })
    case 'heroic_inspiration':
      return i18n.t('game.mutationApprovalPanel.heroicInspiration', {
        state: change.grant ? i18n.t('game.mutationApprovalPanel.granted') : i18n.t('game.mutationApprovalPanel.used')
      })
    case 'hit_dice':
      return i18n.t('game.mutationApprovalPanel.hitDice', {
        sign: (change.value as number) >= 0 ? '+' : '',
        value: change.value
      })
    case 'creature_damage':
      return i18n.t('game.mutationApprovalPanel.creatureDamage', {
        target: change.targetLabel,
        value: change.value,
        damageType: change.damageType ?? ''
      })
    case 'creature_heal':
      return i18n.t('game.mutationApprovalPanel.creatureHeal', { target: change.targetLabel, value: change.value })
    case 'creature_add_condition':
      return i18n.t('game.mutationApprovalPanel.creatureAddCondition', {
        target: change.targetLabel,
        name: change.name
      })
    case 'creature_remove_condition':
      return i18n.t('game.mutationApprovalPanel.creatureRemoveCondition', {
        target: change.targetLabel,
        name: change.name
      })
    case 'creature_kill':
      return i18n.t('game.mutationApprovalPanel.creatureKill', { target: change.targetLabel })
    case 'set_ability_score':
      return i18n.t('game.mutationApprovalPanel.setAbilityScore', {
        ability: (change.ability as string).toUpperCase(),
        value: change.value
      })
    case 'grant_feature':
      return i18n.t('game.mutationApprovalPanel.grantFeature', { name: change.name })
    case 'revoke_feature':
      return i18n.t('game.mutationApprovalPanel.revokeFeature', { name: change.name })
    case 'npc_attitude':
      return i18n.t('game.mutationApprovalPanel.npcAttitude', { name: change.name, attitude: change.attitude })
    case 'reduce_exhaustion':
      return i18n.t('game.mutationApprovalPanel.reduceExhaustion')
    case 'add_exhaustion':
      return i18n.t('game.mutationApprovalPanel.addExhaustion', { levels: change.levels })
    case 'set_equipped':
      return change.equipped
        ? i18n.t('game.mutationApprovalPanel.equipItem', { name: change.name })
        : i18n.t('game.mutationApprovalPanel.unequipItem', { name: change.name })
    case 'set_proficiency':
      return change.proficient
        ? i18n.t('game.mutationApprovalPanel.proficiencyOn', { category: change.category, name: change.name })
        : i18n.t('game.mutationApprovalPanel.proficiencyOff', { category: change.category, name: change.name })
    case 'set_skill_proficiency':
      if (change.expertise) return i18n.t('game.mutationApprovalPanel.skillExpertise', { skill: change.skill })
      return change.proficient
        ? i18n.t('game.mutationApprovalPanel.skillProficiencyOn', { skill: change.skill })
        : i18n.t('game.mutationApprovalPanel.skillProficiencyOff', { skill: change.skill })
    case 'set_save_proficiency':
      return change.proficient
        ? i18n.t('game.mutationApprovalPanel.saveProficiencyOn', { ability: (change.ability as string).toUpperCase() })
        : i18n.t('game.mutationApprovalPanel.saveProficiencyOff', { ability: (change.ability as string).toUpperCase() })
    case 'creature_set_resistance':
      return i18n.t('game.mutationApprovalPanel.creatureSetResistance', {
        target: change.targetLabel,
        types: (change.damageTypes as string[]).join(', ')
      })
    case 'creature_set_vulnerability':
      return i18n.t('game.mutationApprovalPanel.creatureSetVulnerability', {
        target: change.targetLabel,
        types: (change.damageTypes as string[]).join(', ')
      })
    case 'creature_set_immunity':
      return i18n.t('game.mutationApprovalPanel.creatureSetImmunity', {
        target: change.targetLabel,
        types: (change.damageTypes as string[]).join(', ')
      })
    case 'creature_expend_spell_slot':
      return i18n.t('game.mutationApprovalPanel.creatureExpendSpellSlot', {
        target: change.targetLabel,
        level: change.level,
        count: (change.count as number) > 1 ? ` ×${change.count}` : ''
      })
    case 'creature_restore_spell_slot':
      return i18n.t('game.mutationApprovalPanel.creatureRestoreSpellSlot', {
        target: change.targetLabel,
        level: change.level,
        count: (change.count as number) > 1 ? ` ×${change.count}` : ''
      })
    default:
      return type
  }
}

// Explicit harmful/beneficial sets, checked BEFORE any prefix rule — the old
// `type.startsWith('creature_')`-first logic wrongly painted creature_heal /
// creature_restore_spell_slot / creature_remove_condition red (F9).
const HARMFUL = new Set([
  'damage',
  'add_condition',
  'remove_item',
  'add_exhaustion',
  'expend_spell_slot',
  'use_class_resource',
  'revoke_feature',
  'creature_damage',
  'creature_add_condition',
  'creature_kill',
  'creature_expend_spell_slot',
  'creature_set_vulnerability'
])
const BENEFICIAL = new Set([
  'heal',
  'temp_hp',
  'remove_condition',
  'restore_spell_slot',
  'add_item',
  'xp',
  'grant_feature',
  'restore_class_resource',
  'reduce_exhaustion',
  'creature_heal',
  'creature_remove_condition',
  'creature_restore_spell_slot',
  'creature_set_resistance',
  'creature_set_immunity'
])

/** Color class for mutation type */
function changeColor(type: string): string {
  if (HARMFUL.has(type)) return 'text-red-400'
  if (BENEFICIAL.has(type)) return 'text-emerald-400'
  // Neutral (gold/death_save/npc_attitude/proficiency/equip/set_ability_score/...).
  return 'text-amber-300'
}

function CountdownTimer({ timestamp }: { timestamp: number }): JSX.Element {
  const { t } = useT()
  const [remaining, setRemaining] = useState(AUTO_REJECT_SECONDS)

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - timestamp) / 1000
      setRemaining(Math.max(0, Math.ceil(AUTO_REJECT_SECONDS - elapsed)))
    }, 1000)
    return () => clearInterval(interval)
  }, [timestamp])

  return (
    <span className={`text-xs font-mono ${remaining <= 10 ? 'text-red-400' : 'text-gray-500'}`}>
      {t('game.mutationApprovalPanel.countdown', { remaining })}
    </span>
  )
}

function MutationCard({
  set,
  onApprove,
  onReject
}: {
  set: PendingMutationSet
  onApprove: () => void
  onReject: () => void
}): JSX.Element {
  const { t } = useT()
  // Group by character/creature name
  const charName =
    (set.mutations[0]?.characterName as string) ||
    (set.mutations[0]?.targetLabel as string) ||
    t('game.mutationApprovalPanel.unknown')

  return (
    <div className="bg-surface-2/90 border border-border rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">{charName}</span>
        <CountdownTimer timestamp={set.timestamp} />
      </div>

      <div className="space-y-1">
        {set.mutations.map((m, i) => (
          <div key={i} className="space-y-0.5">
            <div className={`text-[11px] ${changeColor(m.type)} flex items-start gap-1.5`}>
              <span className="opacity-50 mt-px">•</span>
              <span>{changeLabel(m)}</span>
            </div>
            {m.reason ? (
              <div className="text-[10px] text-gray-500 break-words pl-3" title={String(m.reason)}>
                ({String(m.reason)})
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 pt-1">
        <button
          onClick={onApprove}
          className="flex-1 px-2 py-1 text-xs font-medium bg-emerald-700/60 hover:bg-emerald-600/80 text-emerald-200 border border-emerald-600/50 rounded cursor-pointer transition-colors"
        >
          {t('game.mutationApprovalPanel.approve')}
        </button>
        <button
          onClick={onReject}
          className="flex-1 px-2 py-1 text-xs font-medium bg-red-900/60 hover:bg-red-800/80 text-red-300 border border-red-700/50 rounded cursor-pointer transition-colors"
        >
          {t('game.mutationApprovalPanel.reject')}
        </button>
      </div>
    </div>
  )
}

export default function MutationApprovalPanel(): JSX.Element | null {
  const { t } = useT()
  const pendingMutations = useAiDmStore((s) => s.pendingMutations)
  const approveMutations = useAiDmStore((s) => s.approveMutations)
  const rejectMutations = useAiDmStore((s) => s.rejectMutations)
  const approveAllMutations = useAiDmStore((s) => s.approveAllMutations)
  const rejectAllMutations = useAiDmStore((s) => s.rejectAllMutations)

  // Announce newly-queued sets through the persistent global live region — slapping
  // aria-live on this panel's root is unreliable because it mounts WITH its content
  // (it returns null when empty), so the first set would not be announced (F12).
  const prevCount = useRef(0)
  useEffect(() => {
    if (pendingMutations.length > prevCount.current) {
      announce(t('game.mutationApprovalPanel.announceQueued', { count: pendingMutations.length }))
    }
    prevCount.current = pendingMutations.length
  }, [pendingMutations.length, t])

  if (pendingMutations.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 space-y-2"
      role="status"
      aria-label={t('game.mutationApprovalPanel.panelLabel')}
    >
      {/* Header with Approve All / Reject All */}
      {pendingMutations.length > 1 && (
        <div className="flex justify-end gap-1.5">
          <button
            onClick={rejectAllMutations}
            className="px-2.5 py-1 text-xs font-semibold bg-red-900/70 hover:bg-red-800/90 text-red-300 border border-red-700/50 rounded-lg cursor-pointer transition-colors"
          >
            {t('game.mutationApprovalPanel.rejectAll', { count: pendingMutations.length })}
          </button>
          <button
            onClick={approveAllMutations}
            className="px-2.5 py-1 text-xs font-semibold bg-emerald-700/70 hover:bg-emerald-600/90 text-emerald-200 border border-emerald-600/50 rounded-lg cursor-pointer transition-colors"
          >
            {t('game.mutationApprovalPanel.approveAll', { count: pendingMutations.length })}
          </button>
        </div>
      )}

      {/* Mutation cards */}
      {pendingMutations.map((set) => (
        <MutationCard
          key={set.id}
          set={set}
          onApprove={() => approveMutations(set.id)}
          onReject={() => rejectMutations(set.id)}
        />
      ))}
    </div>
  )
}
