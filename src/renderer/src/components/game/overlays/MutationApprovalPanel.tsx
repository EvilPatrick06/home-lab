import { useEffect, useState } from 'react'
import { type PendingMutationSet, useAiDmStore } from '../../../stores/use-ai-dm-store'

/** Human-readable label for a stat change type */
function changeLabel(change: { type: string; [key: string]: unknown }): string {
  const type = change.type
  switch (type) {
    case 'damage':
      return `${change.value} ${change.damageType ?? ''} damage`
    case 'heal':
      return `Heal ${change.value} HP`
    case 'temp_hp':
      return `${change.value} temp HP`
    case 'add_condition':
      return `Add condition: ${change.name}`
    case 'remove_condition':
      return `Remove condition: ${change.name}`
    case 'death_save':
      return `Death save ${change.success ? '✓' : '✗'}`
    case 'reset_death_saves':
      return 'Reset death saves'
    case 'expend_spell_slot':
      return `Expend spell slot (level ${change.level})`
    case 'restore_spell_slot':
      return `Restore spell slot (level ${change.level})`
    case 'add_item':
      return `Gain: ${change.name}${(change.quantity as number) > 1 ? ` ×${change.quantity}` : ''}`
    case 'remove_item':
      return `Lose: ${change.name}${(change.quantity as number) > 1 ? ` ×${change.quantity}` : ''}`
    case 'gold':
      return `${(change.value as number) >= 0 ? '+' : ''}${change.value} ${change.denomination ?? 'gp'}`
    case 'xp':
      return `+${change.value} XP`
    case 'use_class_resource':
      return `Use: ${change.name}`
    case 'restore_class_resource':
      return `Restore: ${change.name}`
    case 'heroic_inspiration':
      return `Inspiration ${change.grant ? 'granted' : 'used'}`
    case 'hit_dice':
      return `Hit dice ${(change.value as number) >= 0 ? '+' : ''}${change.value}`
    case 'creature_damage':
      return `${change.targetLabel}: ${change.value} ${change.damageType ?? ''} dmg`
    case 'creature_heal':
      return `${change.targetLabel}: heal ${change.value}`
    case 'creature_add_condition':
      return `${change.targetLabel}: +${change.name}`
    case 'creature_remove_condition':
      return `${change.targetLabel}: -${change.name}`
    case 'creature_kill':
      return `${change.targetLabel}: killed`
    case 'set_ability_score':
      return `${(change.ability as string).toUpperCase()} → ${change.value}`
    case 'grant_feature':
      return `Grant: ${change.name}`
    case 'revoke_feature':
      return `Revoke: ${change.name}`
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
  const [remaining, setRemaining] = useState(60)

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - timestamp) / 1000
      setRemaining(Math.max(0, Math.ceil(60 - elapsed)))
    }, 1000)
    return () => clearInterval(interval)
  }, [timestamp])

  return (
    <span className={`text-[10px] font-mono ${remaining <= 10 ? 'text-red-400' : 'text-gray-500'}`}>{remaining}s</span>
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
  // Group by character/creature name
  const charName = (set.mutations[0]?.characterName as string) || (set.mutations[0]?.targetLabel as string) || 'Unknown'

  return (
    <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-2.5 space-y-2">
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
          className="flex-1 px-2 py-1 text-[10px] font-medium bg-emerald-700/60 hover:bg-emerald-600/80 text-emerald-200 border border-emerald-600/50 rounded cursor-pointer transition-colors"
        >
          ✓ Approve
        </button>
        <button
          onClick={onReject}
          className="flex-1 px-2 py-1 text-[10px] font-medium bg-red-900/60 hover:bg-red-800/80 text-red-300 border border-red-700/50 rounded cursor-pointer transition-colors"
        >
          ✗ Reject
        </button>
      </div>
    </div>
  )
}

export default function MutationApprovalPanel(): JSX.Element | null {
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
            className="px-2.5 py-1 text-[10px] font-semibold bg-emerald-700/70 hover:bg-emerald-600/90 text-emerald-200 border border-emerald-600/50 rounded-lg cursor-pointer transition-colors"
          >
            ✓ Approve All ({pendingMutations.length})
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
