import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { PRESET_LABELS } from '../../../data/calendar-presets'
import { addToast } from '../../../hooks/use-toast'
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
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Campaign } from '../../../types/campaign'
import { formatInGameTime } from '../../../utils/calendar-utils'
import { logger } from '../../../utils/logger'
import { Tooltip } from '../../ui'
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
  onSaveCampaign?: () => Promise<void>
  onEndSession?: () => void
  onCreateCharacter?: () => void
}

function SaveCampaignButton({ onSave }: { onSave: () => Promise<void> }): JSX.Element {
  const [saving, setSaving] = useState(false)

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave()
      addToast('Campaign saved', 'success')
    } catch (err) {
      logger.error('[SettingsDropdown] Save failed:', err)
      addToast('Failed to save campaign', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Campaign</span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-amber-600/30 text-amber-400 hover:bg-amber-600/50 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
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
  const inGameTime = useGameStore((s) => s.inGameTime)

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">Calendar</span>
        <span className="text-[10px] text-amber-400">{PRESET_LABELS[calendar.preset]}</span>
      </div>
      {inGameTime && (
        <div className="text-[10px] text-gray-500">{formatInGameTime(inGameTime.totalSeconds, calendar)}</div>
      )}
    </div>
  )
}

function AiDmSettingsSection(): JSX.Element {
  const aiPaused = useAiDmStore((s) => s.paused)
  const aiModel = 'Ollama'
  const aiIsTyping = useAiDmStore((s) => s.isTyping)
  const setPaused = useAiDmStore((s) => s.setPaused)

  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">AI DM</span>
        <span className="text-[10px] text-purple-400 capitalize">{aiModel}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">
          {aiIsTyping ? 'Responding...' : aiPaused ? 'Paused' : 'Active'}
        </span>
        <button
          onClick={() => setPaused(!aiPaused)}
          aria-label={aiPaused ? 'Resume AI DM' : 'Pause AI DM'}
          className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${
            aiPaused
              ? 'bg-green-600/30 text-green-400 hover:bg-green-600/50'
              : 'bg-yellow-600/30 text-yellow-400 hover:bg-yellow-600/50'
          }`}
        >
          {aiPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  )
}

function DiceColorSection(): JSX.Element {
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
        <span className="text-xs text-gray-400">Dice Colors</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-gray-800 text-gray-300 hover:text-gray-100 hover:bg-gray-700"
        >
          {expanded ? 'Close' : 'Edit'}
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
        <span className="text-xs text-gray-400">Sound Overrides</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-gray-800 text-gray-300 hover:text-gray-100 hover:bg-gray-700"
        >
          {expanded ? 'Close' : `Edit (${customSounds.size})`}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {Array.from(customSounds.entries()).map(([event, path]) => (
            <div key={event} className="flex items-center justify-between text-[10px]">
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
          {customSounds.size === 0 && <p className="text-[10px] text-gray-500">No custom sound overrides</p>}
          {unusedEvents.length > 0 && (
            <select
              className="w-full mt-1 p-1 text-[10px] rounded bg-gray-800 border border-gray-700 text-gray-300"
              value=""
              onChange={(e) => {
                if (e.target.value) handleAdd(e.target.value as SoundEvent)
              }}
            >
              <option value="">Add override...</option>
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

function ThemeSection(): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="px-4 py-2 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Theme</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-gray-800 text-gray-300 hover:text-gray-100 hover:bg-gray-700"
        >
          {expanded ? 'Close' : 'Edit'}
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
  onSaveCampaign,
  onEndSession,
  onCreateCharacter
}: SettingsDropdownProps): JSX.Element {
  const turnMode = useGameStore((s) => s.turnMode)
  const isPaused = useGameStore((s) => s.isPaused)
  const setPaused = useGameStore((s) => s.setPaused)
  const setTurnMode = useGameStore((s) => s.setTurnMode)
  const endInitiative = useGameStore((s) => s.endInitiative)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
      <Tooltip text="Game Settings">
        <button
          onClick={onToggle}
          aria-label="Game settings"
          className="w-9 h-9 bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl
            flex items-center justify-center text-gray-400 hover:text-gray-200 cursor-pointer transition-colors text-lg"
        >
          &#9881;
        </button>
      </Tooltip>

      {isOpen && (
        <div className="absolute right-0 top-11 w-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden shadow-xl">
          {/* Campaign info */}
          <div className="px-4 py-3 border-b border-gray-800">
            <div className="text-sm font-semibold text-gray-100 truncate">{campaign.name}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              D&D 5e &middot; {playerCount} player{playerCount !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Turn mode (DM only) */}
          {isDM && (
            <div className="px-4 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Turn Mode</span>
                <select
                  value={turnMode}
                  onChange={(e) => {
                    const val = e.target.value as 'initiative' | 'free'
                    if (val === 'free') {
                      endInitiative()
                    } else {
                      setTurnMode(val)
                    }
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200"
                >
                  <option value="free">Free</option>
                  <option value="initiative">Initiative</option>
                </select>
              </div>
            </div>
          )}

          {/* Pause toggle (DM only) */}
          {isDM && (
            <div className="px-4 py-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Game Status</span>
                <button
                  onClick={() => setPaused(!isPaused)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors cursor-pointer ${
                    isPaused
                      ? 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
                      : 'bg-green-600/30 text-green-400 hover:bg-green-600/50'
                  }`}
                >
                  {isPaused ? 'Paused' : 'Running'}
                </button>
              </div>
            </div>
          )}

          {/* Sound customization */}
          <SoundCustomizationSection />

          {/* AI DM (when enabled) */}
          {campaign.aiDm?.enabled && isDM && <AiDmSettingsSection />}

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
              <span className="text-xs text-gray-400">Fullscreen</span>
              <button
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                className="px-2 py-0.5 text-xs rounded transition-colors cursor-pointer bg-gray-800 text-gray-300 hover:text-gray-100 hover:bg-gray-700"
              >
                {isFullscreen ? 'Exit (F11)' : 'Enter (F11)'}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="py-1">
            {isDM && onCreateCharacter && (
              <button
                onClick={onCreateCharacter}
                className="w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
              >
                Create Character
              </button>
            )}
            <button
              onClick={() => onLeaveGame(`/lobby/${campaign.id}`)}
              className="w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors cursor-pointer"
            >
              Return to Lobby
            </button>
            {isDM && onEndSession ? (
              <button
                onClick={() => {
                  clearDmAlerts()
                  onEndSession()
                }}
                className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors cursor-pointer font-semibold"
              >
                End Session
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
                Leave Game
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
