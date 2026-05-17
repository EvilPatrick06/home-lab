import type { RegistryGameEntry } from '../../network/registry-client'
import { Button } from '../ui'

export interface GameCardProps {
  game: RegistryGameEntry
  onJoin: () => void
  onSpectate: () => void
}

export default function GameCard({ game, onJoin, onSpectate }: GameCardProps): JSX.Element {
  const playersFull = game.current_players >= game.max_players
  const spectatorsFull = game.current_spectators >= game.max_spectators
  const isBanned = game.banned_from_this_game

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 flex flex-col gap-3 hover:border-amber-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-100 truncate">{game.name}</h3>
          <p className="text-xs text-gray-400 truncate">Host: {game.host_display_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {game.is_private && (
            <span
              className="text-[10px] uppercase tracking-wide bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded-full"
              title="Private game — invite code required"
            >
              Private
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wide bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
            {game.game_system}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span title="Players">
          <span className={playersFull ? 'text-red-300' : 'text-gray-300'}>
            {game.current_players}/{game.max_players}
          </span>{' '}
          players
        </span>
        <span className="text-gray-700">·</span>
        <span title="Spectators">
          <span className={spectatorsFull ? 'text-red-300' : 'text-gray-300'}>
            {game.current_spectators}/{game.max_spectators}
          </span>{' '}
          spectators
        </span>
      </div>

      {isBanned ? (
        <div className="rounded-md bg-red-900/30 border border-red-800/40 px-3 py-2 text-center">
          <p className="text-xs text-red-300 font-medium">Banned from this game</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onJoin} disabled={playersFull} className="text-sm py-2">
            {playersFull ? 'Full' : 'Join'}
          </Button>
          <Button onClick={onSpectate} disabled={spectatorsFull} className="text-sm py-2" variant="secondary">
            {spectatorsFull ? 'Spectator full' : 'Spectate'}
          </Button>
        </div>
      )}
    </div>
  )
}
