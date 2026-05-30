import { useT } from '../../i18n'
import type { RegistryGameEntry } from '../../network/registry-client'
import { Button } from '../ui'

export interface GameCardProps {
  game: RegistryGameEntry
  onJoin: () => void
  onSpectate: () => void
}

export default function GameCard({ game, onJoin, onSpectate }: GameCardProps): JSX.Element {
  const { t } = useT()
  const playersFull = game.current_players >= game.max_players
  const spectatorsFull = game.current_spectators >= game.max_spectators
  const isBanned = game.banned_from_this_game

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 flex flex-col gap-3 hover:border-amber-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-100 truncate">{game.name}</h3>
          <p className="text-xs text-gray-400 truncate">{t('lobby.gameCard.host', { name: game.host_display_name })}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {game.is_private && (
            <span
              className="text-xs uppercase tracking-wide bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full"
              title={t('lobby.gameCard.privateTooltip')}
            >
              {t('lobby.gameCard.private')}
            </span>
          )}
          <span className="text-xs uppercase tracking-wide bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
            {game.game_system}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span title={t('lobby.gameCard.playersTooltip')}>
          <span className={playersFull ? 'text-red-300' : 'text-gray-300'}>
            {game.current_players}/{game.max_players}
          </span>{' '}
          {t('lobby.gameCard.players')}
        </span>
        <span className="text-gray-700">·</span>
        <span title={t('lobby.gameCard.spectatorsTooltip')}>
          <span className={spectatorsFull ? 'text-red-300' : 'text-gray-300'}>
            {game.current_spectators}/{game.max_spectators}
          </span>{' '}
          {t('lobby.gameCard.spectators')}
        </span>
      </div>

      {isBanned ? (
        <div className="rounded-md bg-red-900/30 border border-red-800/40 px-3 py-2 text-center">
          <p className="text-xs text-red-300 font-medium">{t('lobby.gameCard.banned')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onJoin} disabled={playersFull} className="text-sm py-2">
            {playersFull ? t('lobby.gameCard.full') : t('lobby.gameCard.join')}
          </Button>
          <Button onClick={onSpectate} disabled={spectatorsFull} className="text-sm py-2" variant="secondary">
            {spectatorsFull ? t('lobby.gameCard.spectatorFull') : t('lobby.gameCard.spectate')}
          </Button>
        </div>
      )}
    </div>
  )
}
