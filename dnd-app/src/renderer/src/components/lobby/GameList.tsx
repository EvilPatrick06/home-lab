import { useMemo, useState } from 'react'
import { useT } from '../../i18n'
import type { RegistryGameEntry } from '../../network/registry-client'
import { GameCard } from '.'

export type SortOption = 'name-asc' | 'players-desc' | 'newest'

export interface GameListProps {
  games: RegistryGameEntry[]
  registryConnected: boolean
  onJoin: (game: RegistryGameEntry) => void
  onSpectate: (game: RegistryGameEntry) => void
}

export default function GameList({ games, registryConnected, onJoin, onSpectate }: GameListProps): JSX.Element {
  const { t } = useT()
  const [search, setSearch] = useState('')
  const [systemFilter, setSystemFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortOption>('newest')
  const [hideFull, setHideFull] = useState(false)

  const systems = useMemo(() => {
    const set = new Set(games.map((g) => g.game_system))
    return ['all', ...Array.from(set).sort()]
  }, [games])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return games
      .filter((g) => {
        if (systemFilter !== 'all' && g.game_system !== systemFilter) return false
        if (hideFull && g.current_players >= g.max_players && g.current_spectators >= g.max_spectators) return false
        if (q) {
          const hay = `${g.name} ${g.host_display_name}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sort === 'name-asc') return a.name.localeCompare(b.name)
        if (sort === 'players-desc') return b.current_players - a.current_players
        return b.created_at - a.created_at
      })
  }, [games, search, systemFilter, sort, hideFull])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('lobby.gameList.searchPlaceholder')}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-fg placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            className="px-2 py-2 bg-surface border border-border rounded-md text-sm text-gray-200"
          >
            {systems.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? t('lobby.gameList.allSystems') : s}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="px-2 py-2 bg-surface border border-border rounded-md text-sm text-gray-200"
          >
            <option value="newest">{t('lobby.gameList.sortNewest')}</option>
            <option value="name-asc">{t('lobby.gameList.sortNameAsc')}</option>
            <option value="players-desc">{t('lobby.gameList.sortPlayersDesc')}</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-muted select-none cursor-pointer">
            <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)} />
            {t('lobby.gameList.hideFull')}
          </label>
        </div>
      </div>

      {!registryConnected && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-900/20 border border-amber-700/40">
          <span className="text-xs text-amber-300">{t('lobby.gameList.noRegistry')}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-gray-500 text-sm">{t('lobby.gameList.noGames')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((game) => (
            <GameCard
              key={`${game.invite_code}-${game.peer_id}`}
              game={game}
              onJoin={() => onJoin(game)}
              onSpectate={() => onSpectate(game)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
