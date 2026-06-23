import { Settings } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AI_PROVIDER_LABELS } from '../../../constants'
import { PRESET_LABELS } from '../../../data/calendar-presets'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import {
  type AmbientSound,
  getAllSoundEvents,
  getCustomSounds,
  registerCustomSound,
  reinit as reinitSound,
  removeCustomSound,
  type SoundEvent,
  stopAllCustomAudio
} from '../../../services/sound-manager'
import { useNetworkStore } from '../../../stores/network-store'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import type { AiDmConfig, Campaign } from '../../../types/campaign'
import { formatInGameTime } from '../../../utils/calendar-utils'
import { logger } from '../../../utils/logger'
import { ConfirmDialog, Tooltip } from '../../ui'
import type { DiceColors } from '../dice3d'
import { clearDmAlerts } from './DmAlertTray'

const DiceColorPicker = lazy(() => import('../dice3d/DiceColorPicker'))
const ThemeSelector = lazy(() => import('./ThemeSelector'))

interface SettingsDropdownProps {
  campaign: Campaign
  isDM: boolean
  isOpen: boolean
  onToggle: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
  onLeaveGame: (destination: string) => void
  /** Non-destructive: go back to the ready-up lobby, keeping the session alive.
   * Distinct from End Session / Leave Game (which tear the session down). */
  onReturnToLobby: () => void
  onSaveCampaign?: () => Promise<void>
  onEndSession?: () => void
  onCreateCharacter?: () => void
}

function SaveCampaignButton({ onSave }: { onSave: () => Promise<void> }): JSX.Element {
  const { t } = useT()
  const [saving, setSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave()
      addToast(t('game.settingsDropdown.campaignSaved'), 'success')
    } catch (err) {
      logger.error('[SettingsDropdown] Save failed:', err)
      addToast(t('game.settingsDropdown.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{t('game.settingsDropdown.campaign')}</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-amber-600/30 text-accent hover:bg-amber-600/50 disabled:opacity-50"
        >
          {saving ? t('game.settingsDropdown.saving') : t('common.actions.save')}
        </button>
      </div>
    </div>
  )
}

function CalendarSettingsSection({
  calendar
}: {
  calendar: import('../../../types/campaign').CalendarConfig
}): JSX.Element {
  const { t } = useT()
  const inGameTime = useGameStore((s) => s.inGameTime)

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">{t('game.settingsDropdown.calendar')}</span>
        <span className="text-xs text-accent">{PRESET_LABELS[calendar.preset]}</span>
      </div>
      {inGameTime && <div className="text-xs text-gray-500">{formatInGameTime(inGameTime.totalSeconds, calendar)}</div>}
    </div>
  )
}

function AiDmSettingsSection({ aiDm }: { aiDm: AiDmConfig | undefined }): JSX.Element {
  const { t } = useT()
  const aiPaused = useAiDmStore((s) => s.paused)
  // PHASE-10 10A — show the configured provider's model (or provider label), not "Ollama".
  const aiModel = aiDm?.model ?? aiDm?.ollamaModel ?? AI_PROVIDER_LABELS[aiDm?.provider ?? 'ollama'] ?? 'AI'
  const aiIsTyping = useAiDmStore((s) => s.isTyping)
  const setPaused = useAiDmStore((s) => s.setPaused)

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">{t('game.settingsDropdown.aiDm')}</span>
        <span className="text-xs text-purple-400">{aiModel}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {aiIsTyping
            ? t('game.settingsDropdown.aiResponding')
            : aiPaused
              ? t('game.settingsDropdown.aiPaused')
              : t('game.settingsDropdown.aiActive')}
        </span>
        <button
          onClick={() => setPaused(!aiPaused)}
          aria-label={aiPaused ? t('game.settingsDropdown.resumeAiDm') : t('game.settingsDropdown.pauseAiDm')}
          className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${
            aiPaused
              ? 'bg-green-600/30 text-green-400 hover:bg-green-600/50'
              : 'bg-yellow-600/30 text-yellow-400 hover:bg-yellow-600/50'
          }`}
        >
          {aiPaused ? t('game.settingsDropdown.resume') : t('game.settingsDropdown.pause')}
        </button>
      </div>
    </div>
  )
}

function DiceColorSection(): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const diceColors = useLobbyStore((s) => s.getLocalDiceColors(localPeerId))
  const setDiceColors = useLobbyStore((s) => s.setDiceColors)

  const handleChange = (colors: DiceColors): void => {
    if (localPeerId) setDiceColors(localPeerId, colors)
  }

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{t('game.settingsDropdown.diceColors')}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-surface-2 text-gray-300 hover:text-fg hover:bg-gray-700"
        >
          {expanded ? t('common.actions.close') : t('game.settingsDropdown.edit')}
        </button>
      </div>
      {expanded && (
        <div className="mt-2">
          <Suspense fallback={null}>
            <DiceColorPicker colors={diceColors} onChange={handleChange} />
          </Suspense>
        </div>
      )}
    </div>
  )
}

function SoundCustomizationSection(): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const [version, setVersion] = useState(0)
  const customSounds = getCustomSounds()
  const allEvents = getAllSoundEvents()

  // version is used to force re-render after add/remove mutations
  void version

  const handleRemove = (event: SoundEvent | AmbientSound): void => {
    removeCustomSound(event)
    reinitSound()
    setVersion((v) => v + 1)
  }

  const handleAdd = (event: SoundEvent | AmbientSound): void => {
    registerCustomSound(event, `/sounds/custom/${event}.mp3`)
    reinitSound()
    setVersion((v) => v + 1)
  }

  const unusedEvents = allEvents.filter((e) => !customSounds.has(e))

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{t('game.settingsDropdown.soundOverrides')}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-surface-2 text-gray-300 hover:text-fg hover:bg-gray-700"
        >
          {expanded ? t('common.actions.close') : t('game.settingsDropdown.editCount', { count: customSounds.size })}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {Array.from(customSounds.entries()).map(([event, path]) => (
            <div key={event} className="flex items-center justify-between text-xs">
              <span className="text-gray-300 truncate">
                {event}: {path}
              </span>
              <button
                onClick={() => handleRemove(event as SoundEvent)}
                className="text-red-400 hover:text-red-300 cursor-pointer ml-1"
              >
                x
              </button>
            </div>
          ))}
          {customSounds.size === 0 && (
            <p className="text-xs text-gray-500">{t('game.settingsDropdown.noSoundOverrides')}</p>
          )}
          {unusedEvents.length > 0 && (
            <select
              name="sound-override"
              className="w-full mt-1 p-1 text-xs rounded bg-surface-2 border border-border text-gray-300"
              value=""
              onChange={(e) => {
                if (e.target.value) handleAdd(e.target.value as SoundEvent)
              }}
            >
              <option value="">{t('game.settingsDropdown.addOverride')}</option>
              {unusedEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  )
}

// Phase 17u — small inline component so the navigate/location hooks
// only run inside this scope (kept out of the top-level prop list).
function GlobalSettingsLink(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <button
      onClick={() => navigate('/settings', { state: { returnTo: location.pathname } })}
      className="w-full px-4 py-2 text-left text-xs text-amber-300 hover:bg-surface-2 hover:text-amber-200 transition-colors cursor-pointer flex items-center justify-between"
    >
      <span>{t('game.settingsDropdown.globalSettings')}</span>
      <span aria-hidden className="text-gray-500">
        &rarr;
      </span>
    </button>
  )
}

function ThemeSection(): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{t('game.settingsDropdown.theme')}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-surface-2 text-gray-300 hover:text-fg hover:bg-gray-700"
        >
          {expanded ? t('common.actions.close') : t('game.settingsDropdown.edit')}
        </button>
      </div>
      {expanded && (
        <div className="mt-2">
          <Suspense fallback={null}>
            <ThemeSelector />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export default function SettingsDropdown({
  campaign,
  isDM,
  isOpen,
  onToggle,
  onToggleFullscreen,
  isFullscreen,
  onLeaveGame,
  onReturnToLobby,
  onSaveCampaign,
  onEndSession,
  onCreateCharacter
}: SettingsDropdownProps): JSX.Element {
  const { t } = useT()
  const turnMode = useGameStore((s) => s.turnMode)
  const isPaused = useGameStore((s) => s.isPaused)
  const setPaused = useGameStore((s) => s.setPaused)
  const setTurnMode = useGameStore((s) => s.setTurnMode)
  const endInitiative = useGameStore((s) => s.endInitiative)
  const dropdownRef = useRef<HTMLDivElement>(null)
  // GM-1 — End Session ends the game for everyone; confirm first (the lobby's
  // "Leave Lobby" already confirms, so a stray click here shouldn't be destructive).
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false)

  const playerCount = campaign.players.filter((p) => p.isActive).length

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (isOpen) onToggle()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onToggle])

  return (
    <div className="relative" ref={dropdownRef}>
      <Tooltip text={t('game.settingsDropdown.gameSettingsTooltip')}>
        <button
          onClick={onToggle}
          aria-label={t('game.settingsDropdown.gameSettingsAria')}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="w-9 h-9 bg-surface/70 backdrop-blur-sm border border-border/50 rounded-xl
            flex items-center justify-center text-muted hover:text-gray-200 cursor-pointer transition-colors"
        >
          <Settings className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 top-11 w-64 bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl overflow-hidden shadow-xl">
          {/* Campaign info */}
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="text-sm font-semibold text-fg truncate">{campaign.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {t('game.settingsDropdown.playerCount', { count: playerCount })}
            </div>
          </div>

          {/* Turn mode (DM only) */}
          {isDM && (
            <div className="px-4 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{t('game.settingsDropdown.turnMode')}</span>
                <select
                  name="turn-mode"
                  value={turnMode}
                  onChange={(e) => {
                    const val = e.target.value as 'initiative' | 'free'
                    if (val === 'free') {
                      endInitiative()
                    } else {
                      setTurnMode(val)
                    }
                  }}
                  className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-gray-200"
                >
                  <option value="free">{t('game.settingsDropdown.turnModeFree')}</option>
                  <option value="initiative">{t('game.settingsDropdown.turnModeInitiative')}</option>
                </select>
              </div>
            </div>
          )}

          {/* Pause toggle (DM only) */}
          {isDM && (
            <div className="px-4 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{t('game.settingsDropdown.gameStatus')}</span>
                <button
                  onClick={() => setPaused(!isPaused)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${
                    isPaused
                      ? 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
                      : 'bg-green-600/30 text-green-400 hover:bg-green-600/50'
                  }`}
                >
                  {isPaused ? t('game.settingsDropdown.paused') : t('game.settingsDropdown.running')}
                </button>
              </div>
            </div>
          )}

          {/* Sound customization */}
          <SoundCustomizationSection />

          {/* AI DM (when enabled) */}
          {campaign.aiDm?.enabled && isDM && <AiDmSettingsSection aiDm={campaign.aiDm} />}

          {/* Calendar info (DM only) */}
          {isDM && campaign.calendar && <CalendarSettingsSection calendar={campaign.calendar} />}

          {/* Save Campaign (DM only) */}
          {isDM && onSaveCampaign && <SaveCampaignButton onSave={onSaveCampaign} />}

          {/* Dice Colors */}
          <DiceColorSection />

          {/* Theme */}
          <ThemeSection />

          {/* Fullscreen toggle */}
          <div className="px-4 py-2 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{t('game.settingsDropdown.fullscreen')}</span>
              <button
                onClick={onToggleFullscreen}
                aria-label={
                  isFullscreen ? t('game.settingsDropdown.exitFullscreen') : t('game.settingsDropdown.enterFullscreen')
                }
                className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-surface-2 text-gray-300 hover:text-fg hover:bg-gray-700"
              >
                {isFullscreen ? t('game.settingsDropdown.exitF11') : t('game.settingsDropdown.enterF11')}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="py-1">
            {/* Phase 17u — link to the global Settings page from inside the
                in-game settings dropdown. Previously the global gear was
                hidden on /game/ routes so users had no way to reach the
                full Settings page (theme, accessibility, mic, etc.)
                without leaving the game first. */}
            <GlobalSettingsLink />
            {isDM && onCreateCharacter && (
              <button
                onClick={onCreateCharacter}
                className="w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
              >
                {t('game.settingsDropdown.createCharacter')}
              </button>
            )}
            <button
              onClick={onReturnToLobby}
              className="w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg transition-colors cursor-pointer"
            >
              {t('game.settingsDropdown.returnToLobby')}
            </button>
            {isDM && onEndSession ? (
              <button
                onClick={() => setShowEndSessionConfirm(true)}
                className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors cursor-pointer font-semibold"
              >
                {t('game.settingsDropdown.endSession')}
              </button>
            ) : (
              <button
                onClick={() => {
                  clearDmAlerts()
                  stopAllCustomAudio()
                  onLeaveGame('/')
                }}
                className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors cursor-pointer"
              >
                {t('game.settingsDropdown.leaveGame')}
              </button>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={showEndSessionConfirm}
        title={t('game.settingsDropdown.endSessionConfirmTitle')}
        message={t('game.settingsDropdown.endSessionConfirmMessage')}
        confirmLabel={t('game.settingsDropdown.endSession')}
        variant="danger"
        onConfirm={() => {
          setShowEndSessionConfirm(false)
          clearDmAlerts()
          onEndSession?.()
        }}
        onCancel={() => setShowEndSessionConfirm(false)}
      />
    </div>
  )
}
