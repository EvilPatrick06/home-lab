import { useCallback, useEffect, useRef, useState } from 'react'
import type { AmbientSound, SoundEvent } from '../../../services/sound-manager'
import {
  fadeAmbient,
  getAmbientVolume,
  getVolume,
  play,
  playAmbient,
  playCustomAudio,
  setAmbientVolume,
  setVolume,
  stopAmbient,
  stopCustomAudio
} from '../../../services/sound-manager'
import { useGameStore } from '../../../stores/use-game-store'
import { useNetworkStore } from '../../../stores/use-network-store'

type CustomAudioCategory = 'all' | 'ambient' | 'effect' | 'music'

interface CustomAudioEntry {
  fileName: string
  displayName: string
  category: 'ambient' | 'effect' | 'music'
  playing: boolean
  loop: boolean
  volume: number
}

import ambientTracksJson from '@data/audio/ambient-tracks.json'
import { load5eAmbientTracks } from '../../../services/data-provider'
import { logger } from '../../../utils/logger'

const AMBIENT_TRACKS = ambientTracksJson.ambientTracks as Array<{ id: AmbientSound; label: string; icon: string }>
const QUICK_SFX = ambientTracksJson.quickSfx as Array<{ event: SoundEvent; label: string }>

/** Load ambient track definitions from the data store (includes plugin tracks). */
export async function loadAmbientTrackData(): Promise<unknown> {
  return load5eAmbientTracks()
}

export default function DMAudioPanel(): JSX.Element {
  const [activeAmbient, setActiveAmbient] = useState<AmbientSound | null>(null)
  const [ambientVol, setAmbientVol] = useState(() => Math.round(getAmbientVolume() * 100))
  const [masterVol, setMasterVol] = useState(() => Math.round(getVolume() * 100))
  const [isFading, setIsFading] = useState(false)

  // Custom audio state
  const [customAudioEntries, setCustomAudioEntries] = useState<CustomAudioEntry[]>([])
  const [customFilter, setCustomFilter] = useState<CustomAudioCategory>('all')
  const [uploading, setUploading] = useState(false)
  const customAudioPathsRef = useRef<Map<string, string>>(new Map())

  const campaignId = useGameStore((s) => s.campaignId)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  // Load custom audio entries for the current campaign
  useEffect(() => {
    if (!campaignId) return
    window.api.audioListCustom(campaignId).then((result) => {
      if (result.success && result.data) {
        setCustomAudioEntries(
          result.data.map((fileName) => ({
            fileName,
            displayName: fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            category: 'effect' as const,
            playing: false,
            loop: false,
            volume: 80
          }))
        )
      }
    })
  }, [campaignId])

  // Sync local volume state when the component mounts
  useEffect(() => {
    setAmbientVol(Math.round(getAmbientVolume() * 100))
    setMasterVol(Math.round(getVolume() * 100))
  }, [])

  const handleAmbientToggle = useCallback(
    async (ambient: AmbientSound) => {
      if (activeAmbient === ambient) {
        // Fade out then stop
        setIsFading(true)
        await fadeAmbient(0, 800)
        stopAmbient()
        setActiveAmbient(null)
        setIsFading(false)
        // Restore ambient volume to slider value after fade-out
        setAmbientVolume(ambientVol / 100)
        sendMessage('dm:stop-ambient', {})
      } else {
        // If something else is playing, fade out first
        if (activeAmbient) {
          setIsFading(true)
          await fadeAmbient(0, 400)
          stopAmbient()
          setIsFading(false)
        }
        // Restore target volume before playing
        setAmbientVolume(ambientVol / 100)
        playAmbient(ambient)
        setActiveAmbient(ambient)
        sendMessage('dm:play-ambient', { ambient, volume: ambientVol / 100 })
      }
    },
    [activeAmbient, ambientVol, sendMessage]
  )

  const handleAmbientVolumeChange = useCallback((value: number) => {
    setAmbientVol(value)
    setAmbientVolume(value / 100)
  }, [])

  const handleMasterVolumeChange = useCallback((value: number) => {
    setMasterVol(value)
    setVolume(value / 100)
  }, [])

  const handlePlaySfx = useCallback(
    (event: SoundEvent) => {
      play(event)
      sendMessage('dm:play-sound', { event })
    },
    [sendMessage]
  )

  // --- Custom audio handlers ---

  const handleUploadCustom = useCallback(async () => {
    if (!campaignId) return
    setUploading(true)
    try {
      const result = await window.api.audioPickFile()
      if (!result.success || !result.data) {
        setUploading(false)
        return
      }
      const { fileName, buffer } = result.data
      const displayName = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
      const uploadResult = await window.api.audioUploadCustom(campaignId, fileName, buffer, displayName, 'effect')
      if (uploadResult.success && uploadResult.data) {
        setCustomAudioEntries((prev) => [
          ...prev,
          {
            fileName: uploadResult.data!.fileName,
            displayName: uploadResult.data!.displayName,
            category: (uploadResult.data!.category as 'ambient' | 'effect' | 'music') ?? 'effect',
            playing: false,
            loop: false,
            volume: 80
          }
        ])
      }
    } catch (err) {
      logger.error('[DMAudioPanel] Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }, [campaignId])

  const handleToggleCustomPlay = useCallback(
    async (fileName: string) => {
      if (!campaignId) return

      setCustomAudioEntries((prev) =>
        prev.map((entry) => {
          if (entry.fileName !== fileName) return entry
          if (entry.playing) {
            stopCustomAudio(fileName)
            return { ...entry, playing: false }
          }
          return entry
        })
      )

      const entry = customAudioEntries.find((e) => e.fileName === fileName)
      if (!entry || entry.playing) return

      // Resolve path if not cached
      let filePath = customAudioPathsRef.current.get(fileName)
      if (!filePath) {
        const pathResult = await window.api.audioGetCustomPath(campaignId, fileName)
        if (!pathResult.success || !pathResult.data) return
        filePath = pathResult.data
        customAudioPathsRef.current.set(fileName, filePath)
      }

      playCustomAudio(filePath, { loop: entry.loop, volume: entry.volume / 100 })
      setCustomAudioEntries((prev) => prev.map((e) => (e.fileName === fileName ? { ...e, playing: true } : e)))
    },
    [campaignId, customAudioEntries]
  )

  const handleCustomVolumeChange = useCallback((fileName: string, vol: number) => {
    setCustomAudioEntries((prev) => prev.map((e) => (e.fileName === fileName ? { ...e, volume: vol } : e)))
  }, [])

  const handleCustomLoopToggle = useCallback((fileName: string) => {
    setCustomAudioEntries((prev) => prev.map((e) => (e.fileName === fileName ? { ...e, loop: !e.loop } : e)))
  }, [])

  const handleDeleteCustom = useCallback(
    async (fileName: string) => {
      if (!campaignId) return
      stopCustomAudio(fileName)
      await window.api.audioDeleteCustom(campaignId, fileName)
      customAudioPathsRef.current.delete(fileName)
      setCustomAudioEntries((prev) => prev.filter((e) => e.fileName !== fileName))
    },
    [campaignId]
  )

  const filteredCustom =
    customFilter === 'all' ? customAudioEntries : customAudioEntries.filter((e) => e.category === customFilter)

  return (
    <div className="flex flex-col gap-2">
      {/* Ambient tracks grid */}
      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">
          Ambient Music
        </span>
        <div className="grid grid-cols-3 gap-1">
          {AMBIENT_TRACKS.map((track) => {
            const isActive = activeAmbient === track.id
            return (
              <button
                key={track.id}
                onClick={() => handleAmbientToggle(track.id)}
                disabled={isFading}
                className={`flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-600/30 border border-amber-500/50 text-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.15)]'
                    : 'bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300'
                } ${isFading ? 'opacity-60' : ''}`}
                title={isActive ? `Stop ${track.label}` : `Play ${track.label}`}
              >
                <span className="text-xs">{track.icon}</span>
                <span className="truncate">{track.label}</span>
                {isActive && <span className="ml-auto text-[8px] text-amber-400 animate-pulse">{'\u25B6'}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Volume sliders */}
      <div className="border-t border-gray-700/40 pt-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Volume</span>
        <div className="space-y-1.5">
          {/* Ambient volume */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-14 shrink-0">Ambient</span>
            <input
              type="range"
              min={0}
              max={100}
              value={ambientVol}
              onChange={(e) => handleAmbientVolumeChange(Number(e.target.value))}
              className="flex-1 h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-gray-500 w-8 text-right">{ambientVol}%</span>
          </div>
          {/* Master volume */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 w-14 shrink-0">Master</span>
            <input
              type="range"
              min={0}
              max={100}
              value={masterVol}
              onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
              className="flex-1 h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-gray-500 w-8 text-right">{masterVol}%</span>
          </div>
        </div>
      </div>

      {/* Quick SFX buttons */}
      <div className="border-t border-gray-700/40 pt-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1 block">Quick SFX</span>
        <div className="flex flex-wrap gap-1">
          {QUICK_SFX.map((sfx) => (
            <button
              key={sfx.event}
              onClick={() => handlePlaySfx(sfx.event)}
              className="px-2 py-1 text-[10px] font-medium rounded bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer"
            >
              {sfx.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Sounds */}
      <div className="border-t border-gray-700/40 pt-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Custom Sounds</span>
          <button
            onClick={handleUploadCustom}
            disabled={uploading || !campaignId}
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : '+ Upload'}
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 mb-1.5">
          {(['all', 'ambient', 'effect', 'music'] as CustomAudioCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCustomFilter(cat)}
              className={`px-2 py-0.5 text-[9px] font-medium rounded transition-all cursor-pointer capitalize ${
                customFilter === cat
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                  : 'bg-gray-800/40 text-gray-400 border border-gray-700/40 hover:text-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Custom audio list */}
        {filteredCustom.length === 0 ? (
          <p className="text-[9px] text-gray-600 italic">
            {customAudioEntries.length === 0 ? 'No custom sounds uploaded yet.' : 'No sounds in this category.'}
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {filteredCustom.map((entry) => (
              <div key={entry.fileName} className="flex items-center gap-1 bg-gray-800/40 rounded px-1.5 py-1">
                {/* Play/Stop toggle */}
                <button
                  onClick={() => handleToggleCustomPlay(entry.fileName)}
                  className={`w-5 h-5 shrink-0 flex items-center justify-center rounded text-[10px] transition-all cursor-pointer ${
                    entry.playing
                      ? 'bg-amber-600/40 text-amber-300'
                      : 'bg-gray-700/60 text-gray-400 hover:text-gray-200'
                  }`}
                  title={entry.playing ? 'Stop' : 'Play'}
                >
                  {entry.playing ? '\u25A0' : '\u25B6'}
                </button>

                {/* Name */}
                <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0">{entry.displayName}</span>

                {/* Volume slider */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={entry.volume}
                  onChange={(e) => handleCustomVolumeChange(entry.fileName, Number(e.target.value))}
                  className="w-12 h-1 accent-amber-500 cursor-pointer"
                  title={`Volume: ${entry.volume}%`}
                />

                {/* Loop toggle */}
                <button
                  onClick={() => handleCustomLoopToggle(entry.fileName)}
                  className={`text-[9px] px-1 py-0.5 rounded transition-all cursor-pointer ${
                    entry.loop
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                      : 'bg-gray-700/40 text-gray-500 border border-gray-700/40 hover:text-gray-400'
                  }`}
                  title={entry.loop ? 'Loop: On' : 'Loop: Off'}
                >
                  {'\u21BB'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteCustom(entry.fileName)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer text-[10px]"
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
