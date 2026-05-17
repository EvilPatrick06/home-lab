import { memo, useState } from 'react'
import { PLAYER_COLORS } from '../../network'
import type { LobbyPlayer } from '../../stores/use-lobby-store'

interface PlayerCardProps {
  player: LobbyPlayer
  isLocal: boolean
  isLocallyMuted?: boolean
  onToggleLocalMute?: () => void
  isHostView?: boolean
  onViewCharacter?: () => void
  onKick?: () => void
  onBan?: () => void
  onChatTimeout?: () => void
  onPromoteCoDM?: () => void
  onDemoteCoDM?: () => void
  onColorChange?: (color: string) => void
  /** Phase 29d: colors currently held by *other* peers — disable those in the picker. */
  usedByOtherPeers?: ReadonlySet<string>
  /** Phase 29e: DM-only — promote a spectator to player. Only rendered for spectators in host view. */
  onPromoteToPlayer?: () => void
  /** Phase 29e: DM-only — demote a player to spectator. Only rendered for players in host view. */
  onDemoteToSpectator?: () => void
}

export default memo(function PlayerCard({
  player,
  isLocal,
  isLocallyMuted,
  onToggleLocalMute,
  isHostView,
  onViewCharacter,
  onKick,
  onBan,
  onChatTimeout,
  onPromoteCoDM,
  onDemoteCoDM,
  onColorChange,
  usedByOtherPeers,
  onPromoteToPlayer,
  onDemoteToSpectator
}: PlayerCardProps): JSX.Element {
  const isSpectator = player.role === 'spectator'
  const avatarLetter = player.displayName.charAt(0).toUpperCase()
  const [showColorPicker, setShowColorPicker] = useState(false)

  // MP-10 (v2.1.31 QA): card border is driven by stable role (host vs.
  // not-host), not the viewer-relative isLocal flag. Otherwise the host's
  // own card looked amber to themselves and gray to everyone else.
  // isLocal still adds a subtle inner ring so "this is your card" stays
  // recognizable without overriding the host styling.
  const cardBorderClass = player.isHost ? 'border-amber-700/50 bg-amber-900/10' : 'border-gray-800 bg-gray-900/30'
  const localRingClass = isLocal ? 'ring-1 ring-inset ring-amber-500/30' : ''

  return (
    <div className={`flex flex-col gap-1 p-3 rounded-lg border transition-colors ${cardBorderClass} ${localRingClass}`}>
      {/* Main row: avatar, info, status */}
      <div className="flex items-center gap-3">
        {/* Avatar: color is a BORDER, not the fill. The fill is either the
            chosen character's portrait or a default dark circle with the
            player's initial. For the local player the avatar is also the
            color-picker trigger — pulsing border + palette icon hint until
            a color is confirmed; quiet hover ring after that. */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            className={`w-11 h-11 rounded-full flex items-center justify-center overflow-hidden bg-gray-800 text-white font-bold text-sm transition-all border-[3px] focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-gray-900 ${
              isLocal && onColorChange
                ? `cursor-pointer hover:scale-105 ${player.colorConfirmed ? '' : 'animate-pulse hover:animate-none'}`
                : 'cursor-default'
            }`}
            style={{
              // Phase 17d — symmetric live preview. If this peer is mid-pick
              // (has a previewColor and hasn't confirmed yet), render the
              // pending swatch dashed + slightly dimmed so it's visually
              // distinct from a confirmed border. Otherwise fall back to the
              // confirmed `color`, then the default grey.
              borderColor:
                !player.colorConfirmed && player.previewColor ? player.previewColor : player.color || '#475569',
              borderStyle: !player.colorConfirmed && player.previewColor ? 'dashed' : undefined,
              opacity: !player.colorConfirmed && player.previewColor ? 0.85 : undefined
            }}
            onClick={isLocal && onColorChange ? () => setShowColorPicker(!showColorPicker) : undefined}
            disabled={!isLocal || !onColorChange}
            aria-label={
              isLocal
                ? `Your avatar — click to pick your border color (currently ${player.color || 'default'})`
                : `${player.displayName}'s avatar`
            }
            title={isLocal && onColorChange ? 'Click to pick your color' : undefined}
          >
            {player.characterPortraitUrl ? (
              <img
                src={player.characterPortraitUrl}
                alt=""
                aria-hidden="true"
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <span aria-hidden="true">{avatarLetter}</span>
            )}
          </button>
          {/* MP-11 (v2.1.31 QA): the palette overlay only renders on the
              local player's own card because it's the color-picker trigger,
              not a permanent avatar decoration. To make that intent obvious
              (the QA reporter mistook it for a static badge) we render a
              pencil-edit icon (universal "this is interactive") instead of
              the previous palette-circle, scoped strictly to the local-
              editable path. Other viewers' cards intentionally have no
              corner overlay — the avatar border (color) is the entire
              cross-viewer-visible identity. */}
          {isLocal && onColorChange && (
            <div
              className="pointer-events-none absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gray-900 border border-amber-500 flex items-center justify-center"
              aria-hidden="true"
              title="Click avatar to change color"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-2.5 h-2.5 text-amber-400"
              >
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.501a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
              </svg>
            </div>
          )}
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm truncate ${player.isHost ? 'font-bold text-amber-400' : 'font-medium text-gray-200'}`}
            >
              {player.displayName}
              {isLocal && <span className="text-gray-500 font-normal"> (you)</span>}
            </span>
            {player.isHost && (
              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-400 uppercase tracking-wide">
                DM
              </span>
            )}
            {player.isCoDM && !player.isHost && (
              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-400 uppercase tracking-wide">
                Co-DM
              </span>
            )}
            {isSpectator && (
              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-700/40 text-sky-300 uppercase tracking-wide">
                Spectator
              </span>
            )}
          </div>
          {player.characterName && onViewCharacter ? (
            <button
              onClick={onViewCharacter}
              className="text-xs text-amber-400/80 hover:text-amber-300 hover:underline truncate cursor-pointer block"
            >
              {player.characterName}
            </button>
          ) : (
            <p className="text-xs text-gray-500 truncate">{player.characterName || 'No character selected'}</p>
          )}
          {player.status === 'reconnecting' ? (
            <span className="text-[10px] text-amber-400 animate-pulse">Reconnecting...</span>
          ) : player.status === 'disconnected' ? (
            // Phase 17e — explicit disconnected (set by Kick) renders as a
            // red pill, not the yellow "Reconnecting" used for transient
            // drops. The card is removed after a short grace.
            <span className="text-[10px] text-red-400 font-semibold">Disconnected</span>
          ) : (
            player.latencyMs != null && (
              <span
                className={`text-[10px] ${
                  player.latencyMs < 100
                    ? 'text-green-400'
                    : player.latencyMs < 250
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                Ping: {player.latencyMs}ms
              </span>
            )
          )}
        </div>

        {/* Status icons & controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Local mute button (visible on non-self players).
              MP-9 (v2.1.31 QA): QA reported "no observable effect" because
              the icon-only toggle went from a very-dark-gray speaker to an
              amber muted-speaker — visually subtle, no explicit pressed
              state, no text. Adding aria-pressed, a contrast-strong active
              ring, and visible state-change scaling so the toggle reads as
              an actual toggle, not a dead button. */}
          {!isLocal && onToggleLocalMute && (
            <button
              type="button"
              onClick={onToggleLocalMute}
              aria-pressed={isLocallyMuted}
              aria-label={
                isLocallyMuted ? `Unmute ${player.displayName} (local)` : `Mute ${player.displayName} (local)`
              }
              title={
                isLocallyMuted
                  ? `Unmute ${player.displayName} for your audio (local-only)`
                  : `Mute ${player.displayName} for your audio (local-only)`
              }
              className={`p-1 rounded transition-all cursor-pointer ${
                isLocallyMuted
                  ? 'text-amber-300 bg-amber-900/40 ring-1 ring-amber-500/60 hover:bg-amber-900/60'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              {isLocallyMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.047 3.062a.75.75 0 0 1 .453.688v12.5a.75.75 0 0 1-1.264.546L5.203 13H2.667a.75.75 0 0 1-.7-.48A6.985 6.985 0 0 1 1.5 10c0-.85.152-1.663.43-2.417A.75.75 0 0 1 2.667 7h2.536l4.033-3.796a.75.75 0 0 1 .811-.142Z" />
                  <path d="M13.26 7.74a.75.75 0 0 1 1.06 0L16 9.42l1.68-1.68a.75.75 0 1 1 1.06 1.06L17.06 10.5l1.68 1.68a.75.75 0 0 1-1.06 1.06L16 11.56l-1.68 1.68a.75.75 0 0 1-1.06-1.06l1.68-1.68-1.68-1.68a.75.75 0 0 1 0-1.06Z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.5 3.75a.75.75 0 0 0-1.264-.546L5.203 7H2.667a.75.75 0 0 0-.7.48A6.985 6.985 0 0 0 1.5 10c0 .887.165 1.737.468 2.52.111.29.39.48.699.48h2.536l4.033 3.796a.75.75 0 0 0 1.264-.546V3.75ZM14.325 10a4.49 4.49 0 0 1-.767 2.52.75.75 0 0 0 1.266.808A5.99 5.99 0 0 0 15.825 10a5.99 5.99 0 0 0-1.001-3.328.75.75 0 1 0-1.266.808c.493.772.767 1.682.767 2.52Z" />
                  <path d="M16.576 10a7.49 7.49 0 0 1-1.39 4.362.75.75 0 0 0 1.235.85A8.99 8.99 0 0 0 18.076 10c0-1.91-.597-3.682-1.614-5.138a.75.75 0 0 0-1.27.795A7.477 7.477 0 0 1 16.576 10Z" />
                </svg>
              )}
            </button>
          )}

          {/* Ready indicator */}
          {player.isReady ? (
            <div className="text-green-400" title="Ready">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          ) : (
            <div className="text-gray-600" title="Not ready">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Color picker — shown when local user clicks their avatar */}
      {showColorPicker && isLocal && onColorChange && (
        <div className="flex flex-wrap gap-1.5 ml-[3.25rem] mt-1">
          {PLAYER_COLORS.map((color) => {
            // Phase 29d: gray out colors taken by other peers (excluding self).
            const taken = usedByOtherPeers?.has(color) ?? false
            const isSelected = player.color === color
            return (
              <button
                key={color}
                onClick={() => {
                  if (taken) return
                  onColorChange(color)
                  setShowColorPicker(false)
                }}
                disabled={taken}
                title={taken ? `${color} (taken)` : color}
                className={`w-5 h-5 rounded-full border-2 transition-colors ${
                  isSelected
                    ? 'border-white cursor-pointer'
                    : taken
                      ? 'border-transparent opacity-30 cursor-not-allowed'
                      : 'border-transparent hover:border-gray-400 cursor-pointer'
                }`}
                style={{ backgroundColor: color }}
              />
            )
          })}
        </div>
      )}

      {/* DM moderation controls — second row */}
      {isHostView && !isLocal && !player.isHost && (
        <div className="flex flex-wrap items-center gap-1 ml-[3.25rem] overflow-hidden">
          {/* Chat timeout (5 min) */}
          {onChatTimeout && (
            <button
              onClick={onChatTimeout}
              title="Timeout chat (5 min)"
              className="p-1.5 rounded transition-colors cursor-pointer text-gray-600 hover:text-amber-400 hover:bg-gray-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          {/* Co-DM toggle */}
          {player.isCoDM
            ? onDemoteCoDM && (
                <button
                  onClick={onDemoteCoDM}
                  title="Demote from Co-DM"
                  className="p-1.5 rounded transition-colors cursor-pointer bg-purple-900/40 text-purple-400 hover:bg-purple-900/60"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM3 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3 8ZM14 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 14 8ZM7.172 12.828a.75.75 0 0 1 0 1.061l-1.06 1.06a.75.75 0 0 1-1.061-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM13.889 12.828a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.061l-1.06-1.06a.75.75 0 0 1 0-1.06ZM10 14a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 14Z" />
                    <path fillRule="evenodd" d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                </button>
              )
            : onPromoteCoDM && (
                <button
                  onClick={onPromoteCoDM}
                  title="Promote to Co-DM"
                  className="p-1.5 rounded transition-colors cursor-pointer text-gray-600 hover:text-purple-400 hover:bg-gray-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.061-1.06a.75.75 0 0 1 1.06 0ZM3 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3 8ZM14 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 14 8ZM7.172 12.828a.75.75 0 0 1 0 1.061l-1.06 1.06a.75.75 0 0 1-1.061-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM13.889 12.828a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.061l-1.06-1.06a.75.75 0 0 1 0-1.06ZM10 14a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 14Z" />
                    <path fillRule="evenodd" d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                </button>
              )}

          <div className="w-px h-5 bg-gray-700 mx-0.5" />

          {/* Kick button */}
          {onKick && (
            <button
              onClick={onKick}
              title="Kick player"
              className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300"
            >
              Kick
            </button>
          )}

          {/* Ban button */}
          {onBan && (
            <button
              onClick={onBan}
              title="Ban player"
              className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-red-950/40 text-red-500 hover:bg-red-900/60 hover:text-red-300"
            >
              Ban
            </button>
          )}

          {/* Phase 29e: spectator/player role toggle (DM-only) */}
          {isSpectator && onPromoteToPlayer && (
            <button
              type="button"
              onClick={onPromoteToPlayer}
              title="Promote to player"
              className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-sky-900/40 text-sky-300 hover:bg-sky-900/60 hover:text-sky-200"
            >
              Promote
            </button>
          )}
          {!isSpectator && onDemoteToSpectator && (
            <button
              type="button"
              onClick={onDemoteToSpectator}
              title="Demote to spectator"
              className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            >
              Demote
            </button>
          )}
        </div>
      )}
    </div>
  )
})
