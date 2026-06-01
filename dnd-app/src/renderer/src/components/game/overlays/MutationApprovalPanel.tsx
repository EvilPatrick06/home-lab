import { useEffect, useState } from 'react'
import { i18n, useT } from '../../../i18n'
import { type PendingMutationSet, useAiDmStore } from '../../../stores/use-ai-dm-store'

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
    default:
      return type
  }
}

/** Color class for mutation type */
function changeColor(type: string): string {
  if (type.startsWith('creature_') || type === 'damage' || type === 'add_condition' || type === 'remove_item') {
    return 'text-red-400'
  }
  if (
    type === 'heal' ||
    type === 'restore_spell_slot' ||
    type === 'add_item' ||
    type === 'xp' ||
    type === 'grant_feature'
  ) {
    return 'text-emerald-400'
  }
  return 'text-amber-300'
}

function CountdownTimer({ timestamp }: { timestamp: number }): JSX.Element {
  const { t } = useT()
  const [remaining, setRemaining] = useState(60)

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - timestamp) / 1000
      setRemaining(Math.max(0, Math.ceil(60 - elapsed)))
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

      <div className="space-y-0.5">
        {set.mutations.map((m, i) => (
          <div key={i} className={`text-[11px] ${changeColor(m.type)} flex items-start gap-1.5`}>
            <span className="opacity-50 mt-px">•</span>
            <span>{changeLabel(m)}</span>
            {m.reason ? (
              <span className="text-gray-500 ml-auto truncate max-w-[120px]">({String(m.reason)})</span>
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

  if (pendingMutations.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
      {/* Header with Approve All */}
      {pendingMutations.length > 1 && (
        <div className="flex justify-end">
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
