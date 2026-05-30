import { useT } from '../../../i18n'
import type { GameMap } from '../../../types/map'

interface MapSelectorProps {
  maps: GameMap[]
  activeMapId: string | null
  /** Invoked with the chosen map id; the parent handles store update + broadcast. */
  onSelect: (mapId: string) => void
}

/**
 * Phase 14a (D1): quick map selector in the DM toolbar — no longer requires
 * drilling into Places / portal triggers / fullscreen editor just to flip the
 * active map. Extracted from GameLayout; the store update + dm:map-change
 * broadcast stay in the parent's onSelect handler (Phase 17x).
 */
export default function MapSelector({ maps, activeMapId, onSelect }: MapSelectorProps): JSX.Element {
  const { t } = useT()
  return (
    <select
      value={activeMapId ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      className="bg-gray-900/80 backdrop-blur-sm border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5
                 hover:border-amber-600/50 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
      title={t('game.mapSelector.switchMap')}
      aria-label={t('game.mapSelector.switchMap')}
    >
      {maps.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || t('game.mapSelector.untitledMap')}
        </option>
      ))}
    </select>
  )
}
