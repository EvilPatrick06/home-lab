/**
 * FloatingDMPanel — minimal DM quick-access panel shown when the DM is
 * previewing the Player view. (Phase 14c)
 *
 * The full DM toolset is hidden in Player view so the DM can see what
 * their players see. Without this panel the DM had to flip back to DM
 * view for any action — Next Turn, AI pause, opening initiative — and
 * lose the player-perspective they were trying to inspect. This panel
 * surfaces only the actions a DM is most likely to need while peeking;
 * everything else still requires switching back.
 *
 * Design constraints:
 * - Small, icon-only (no labels by default; hover shows title).
 * - Semi-transparent so it doesn't crowd the map.
 * - Pinned to a corner with pointer-events scoped to the buttons.
 * - Returning to DM view always wins — it's the first action.
 */

import { useT } from '../../../i18n'

interface FloatingDMPanelProps {
  onSwitchToDM: () => void
  onNextTurn?: () => void
  onTogglePauseAI?: () => void
  onOpenInitiative: () => void
  aiPaused?: boolean
  aiDmEnabled?: boolean
}

export default function FloatingDMPanel({
  onSwitchToDM,
  onNextTurn,
  onTogglePauseAI,
  onOpenInitiative,
  aiPaused = false,
  aiDmEnabled = false
}: FloatingDMPanelProps): JSX.Element {
  const { t } = useT()
  return (
    <div
      className="absolute bottom-3 end-3 z-40 pointer-events-none"
      role="region"
      aria-label={t('game.floatingDMPanel.regionLabel')}
    >
      <div className="pointer-events-auto flex flex-col gap-1 bg-surface/85 backdrop-blur-sm border border-amber-700/40 rounded-xl p-1.5 shadow-xl">
        <button
          onClick={onSwitchToDM}
          title={t('game.floatingDMPanel.switchToDMTitle')}
          aria-label={t('game.floatingDMPanel.switchToDM')}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg bg-amber-900/40 text-amber-300 hover:bg-amber-700/50 hover:text-white transition-colors cursor-pointer"
        >
          🎲
        </button>
        <button
          onClick={onOpenInitiative}
          title={t('game.floatingDMPanel.openInitiative')}
          aria-label={t('game.floatingDMPanel.openInitiative')}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg bg-surface-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
        >
          ⚔️
        </button>
        {onNextTurn && (
          <button
            onClick={onNextTurn}
            title={t('game.floatingDMPanel.nextTurn')}
            aria-label={t('game.floatingDMPanel.nextTurnAria')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg bg-surface-2 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          >
            ➡️
          </button>
        )}
        {aiDmEnabled && onTogglePauseAI && (
          <button
            onClick={onTogglePauseAI}
            title={aiPaused ? t('game.floatingDMPanel.resumeAI') : t('game.floatingDMPanel.pauseAI')}
            aria-label={aiPaused ? t('game.floatingDMPanel.resumeAI') : t('game.floatingDMPanel.pauseAI')}
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors cursor-pointer ${
              aiPaused
                ? 'bg-green-900/40 text-green-300 hover:bg-green-700/50 hover:text-white'
                : 'bg-surface-2 text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {aiPaused ? '▶️' : '⏸️'}
          </button>
        )}
      </div>
    </div>
  )
}
