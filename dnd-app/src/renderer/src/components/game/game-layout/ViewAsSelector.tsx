import { useT } from '../../../i18n'
import type { Campaign } from '../../../types/campaign'
import type { ViewAsTarget } from './use-view-mode'

interface ViewAsSelectorProps {
  campaign: Campaign
  viewAs: ViewAsTarget | null
  setViewAsTarget: (target: { roleId?: string; playerId?: string; label: string } | null) => void
}

/**
 * Phase 29f — View-as-role debug selector (DM only). Lets the DM preview the
 * game as any player or permission role. Extracted from GameLayout's inline
 * <select>; behavior is identical.
 */
export default function ViewAsSelector({ campaign, viewAs, setViewAsTarget }: ViewAsSelectorProps): JSX.Element {
  const { t } = useT()
  return (
    <select
      value={viewAs ? (viewAs.playerId ? `player:${viewAs.playerId}` : `role:${viewAs.roleId}`) : 'self'}
      onChange={(e) => {
        const v = e.target.value
        if (v === 'self') return setViewAsTarget(null)
        if (v.startsWith('player:')) {
          const pid = v.slice(7)
          const p = campaign.players.find((pl) => pl.userId === pid)
          return setViewAsTarget({ playerId: pid, label: p?.displayName ?? t('game.viewAsSelector.player') })
        }
        const rid = v.slice(5)
        const r = campaign.permissions?.roles.find((rr) => rr.id === rid)
        setViewAsTarget({ roleId: rid, label: r?.name ?? t('game.viewAsSelector.role') })
      }}
      className="bg-gray-800/80 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
      title={t('game.viewAsSelector.title')}
    >
      <option value="self">{t('game.viewAsSelector.viewSelf')}</option>
      {campaign.players.map((p) => (
        <option key={p.userId} value={`player:${p.userId}`}>
          {t('game.viewAsSelector.asPlayer', { name: p.displayName })}
        </option>
      ))}
      {(campaign.permissions?.roles ?? []).map((r) => (
        <option key={r.id} value={`role:${r.id}`}>
          {t('game.viewAsSelector.asRole', { name: r.name })}
        </option>
      ))}
    </select>
  )
}
