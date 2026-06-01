import { useState } from 'react'
import { useT } from '../../i18n'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { Campaign, PlayerOverride } from '../../types/campaign'
import {
  getPermissionLabel,
  PERMISSION_GROUPS,
  type Permission,
  type PermissionCategory
} from '../../types/permissions'

type TriState = 'grant' | 'default' | 'deny'

/**
 * Phase 29g — per-player permission overrides. Each player expands to a list of
 * tri-state switches (grant / role-default / deny) per permission. Overrides are
 * keyed by the player's stable id. A warning chip surfaces if a key is somehow
 * both granted and denied (shouldn't happen via the UI, but guards imported data).
 *
 * Note: runtime permission checks key overrides by peer `clientId`; the campaign
 * roster exposes `userId`, so this panel keys by `userId`. When a peer's
 * `clientId` differs from its `userId` the override won't resolve at runtime —
 * tracked as a reconciliation gap with the lobby peer identity.
 */
export default function PlayerOverridesPanel({ campaign }: { campaign: Campaign }): JSX.Element {
  const { t } = useT()
  const setPlayerOverride = useCampaignStore((s) => s.setPlayerOverride)
  const clearPlayerOverride = useCampaignStore((s) => s.clearPlayerOverride)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const overrides = campaign.permissions?.playerOverrides ?? {}

  if (campaign.players.length === 0) {
    return <p className="text-xs text-gray-500 italic">{t('campaign.playerOverridesPanel.noPlayers')}</p>
  }

  return (
    <div className="space-y-2">
      {campaign.players.map((player) => {
        const ov = overrides[player.userId]
        const grantSet = new Set(ov?.grant ?? [])
        const denySet = new Set(ov?.deny ?? [])
        const conflicts = [...grantSet].filter((k) => denySet.has(k as Permission))
        const expanded = expandedId === player.userId
        const count = grantSet.size + denySet.size

        const setState = (key: Permission, state: TriState): void => {
          const grant = new Set(grantSet)
          const deny = new Set(denySet)
          grant.delete(key)
          deny.delete(key)
          if (state === 'grant') grant.add(key)
          else if (state === 'deny') deny.add(key)
          const next: PlayerOverride = { grant: [...grant] as Permission[], deny: [...deny] as Permission[] }
          if (next.grant.length === 0 && next.deny.length === 0) clearPlayerOverride(campaign.id, player.userId)
          else setPlayerOverride(campaign.id, player.userId, next)
        }

        return (
          <div key={player.userId} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-surface-2/60">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : player.userId)}
                className="text-muted hover:text-amber-300 cursor-pointer text-sm"
              >
                {expanded ? '▼' : '▶'}
              </button>
              <span className="text-sm font-semibold text-fg">{player.displayName}</span>
              {count > 0 && (
                <span className="text-xs text-gray-500">
                  {t('campaign.playerOverridesPanel.overrideCount', { count })}
                </span>
              )}
              {conflicts.length > 0 && (
                <span className="text-[10px] text-red-400 border border-red-700 rounded px-1">
                  {t('campaign.playerOverridesPanel.conflict')}
                </span>
              )}
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => clearPlayerOverride(campaign.id, player.userId)}
                  className="ml-auto text-xs text-muted hover:text-red-300 cursor-pointer"
                >
                  {t('campaign.playerOverridesPanel.clear')}
                </button>
              )}
            </div>

            {expanded && (
              <div className="p-3 space-y-3">
                {(Object.keys(PERMISSION_GROUPS) as PermissionCategory[]).map((category) => (
                  <div key={category}>
                    <span className="text-xs font-semibold text-accent uppercase tracking-wide capitalize">
                      {category}
                    </span>
                    <div className="mt-1 space-y-1">
                      {(PERMISSION_GROUPS[category] as readonly Permission[]).map((key) => {
                        const state: TriState = grantSet.has(key) ? 'grant' : denySet.has(key) ? 'deny' : 'default'
                        return (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-gray-300">{getPermissionLabel(key)}</span>
                            {(['grant', 'default', 'deny'] as TriState[]).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setState(key, opt)}
                                className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer capitalize ${
                                  state === opt
                                    ? opt === 'grant'
                                      ? 'bg-green-600/40 text-green-300'
                                      : opt === 'deny'
                                        ? 'bg-red-600/40 text-red-300'
                                        : 'bg-gray-600/40 text-gray-200'
                                    : 'bg-surface-2 text-gray-500 hover:text-gray-300'
                                }`}
                              >
                                {t(`campaign.playerOverridesPanel.triState.${opt}`)}
                              </button>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
