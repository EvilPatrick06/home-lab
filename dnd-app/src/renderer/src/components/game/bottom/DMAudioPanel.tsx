import { useCallback, useEffect, useRef, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import {
  advance as advancePlaylist,
  createPlaylist,
  loadPlaylists,
  type Playlist,
  currentTrack as playlistCurrentTrack,
  savePlaylists
} from '../../../services/playlist-manager'
import type { AmbientSound, SoundEvent } from '../../../services/sound-manager'
import {
  fadeAmbient,
  getAmbientVolume,
  getVolume,
  play,
  playAmbient,
  playCustomAudio,
  setAmbientVolume,
  setCustomAudioVolume,
  setVolume,
  stopAmbient,
  stopCustomAudio
} from '../../../services/sound-manager'
import { useNetworkStore } from '../../../stores/network-store'
import { useGameStore } from '../../../stores/use-game-store'

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
  const { t } = useT()
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
  // Phase 29e — `isHost` here is a structural transport check used to gate
  // outbound `dm:` audio broadcasts to remote peers. The user-facing "should I
  // see the DM audio panel at all" decision is made upstream (this panel only
  // mounts behind a `manage_audio`/`use_dm_tools` gate). Phase 30 will revisit
  // role-as-string and may swap this for a network-layer helper.
  const isHost = useNetworkStore((s) => s.role === 'host')

  // Phase 27j — playlists
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null)
  const playingPlaylistRef = useRef<Playlist | null>(null)

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

  // Phase 27j — load playlists for the campaign.
  useEffect(() => {
    if (!campaignId) return
    setPlaylists(loadPlaylists(campaignId))
  }, [campaignId])

  const persistPlaylists = useCallback(
    (next: Playlist[]) => {
      setPlaylists(next)
      if (campaignId) savePlaylists(campaignId, next)
    },
    [campaignId]
  )

  // Play a single playlist track (preset → ambient with auto-advance; custom →
  // custom audio, manual skip). Advances via the ambient `ended` event.
  const playPlaylistTrack = useCallback(
    (pl: Playlist) => {
      const track = playlistCurrentTrack(pl)
      if (!track) {
        setPlayingPlaylistId(null)
        playingPlaylistRef.current = null
        return
      }
      playingPlaylistRef.current = pl
      if (track.kind === 'preset') {
        playAmbient(track.ref as AmbientSound, {
          loop: false,
          onEnded: () => {
            const active = playingPlaylistRef.current
            if (!active || active.id !== pl.id) return
            const { playlist: advanced, track: nextTrack } = advancePlaylist(active)
            if (!nextTrack) {
              setPlayingPlaylistId(null)
              playingPlaylistRef.current = null
              return
            }
            persistPlaylists(playlists.map((p) => (p.id === advanced.id ? advanced : p)))
            playPlaylistTrack(advanced)
          }
        })
        setActiveAmbient(track.ref as AmbientSound)
        if (isHost) sendMessage('dm:play-ambient', { ambient: track.ref, volume: ambientVol / 100 })
      }
    },
    [ambientVol, isHost, persistPlaylists, playlists, sendMessage]
  )

  const handlePlayPlaylist = useCallback(
    (id: string) => {
      const pl = playlists.find((p) => p.id === id)
      if (!pl || pl.tracks.length === 0) return
      const fresh = { ...pl, currentIndex: 0 }
      persistPlaylists(playlists.map((p) => (p.id === id ? fresh : p)))
      setPlayingPlaylistId(id)
      playPlaylistTrack(fresh)
    },
    [playlists, persistPlaylists, playPlaylistTrack]
  )

  const handleStopPlaylist = useCallback(() => {
    setPlayingPlaylistId(null)
    playingPlaylistRef.current = null
    stopAmbient()
    setActiveAmbient(null)
    if (isHost) sendMessage('dm:stop-ambient', {})
  }, [isHost, sendMessage])

  const handleSkipTrack = useCallback(() => {
    const active = playingPlaylistRef.current
    if (!active) return
    const { playlist: advanced, track } = advancePlaylist(active)
    if (!track) {
      handleStopPlaylist()
      return
    }
    persistPlaylists(playlists.map((p) => (p.id === advanced.id ? advanced : p)))
    playPlaylistTrack(advanced)
  }, [handleStopPlaylist, persistPlaylists, playlists, playPlaylistTrack])

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
            // Phase 27b — sound-playback keys tracks by absolute path, not fileName.
            const path = customAudioPathsRef.current.get(fileName)
            if (path) stopCustomAudio(path)
            // Phase 27i — tell clients to stop this track too.
            if (isHost) sendMessage('dm:stop-custom-audio', { fileName })
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

      // Phase 27i — stream the track to connected players. Files <1MB are
      // base64-encoded and broadcast; larger files stay DM-local with a hint.
      if (isHost) {
        try {
          const buffer = await window.api.readFileBinary(filePath)
          if (buffer.byteLength > 1024 * 1024) {
            addToast(t('game.dmAudioPanel.overSizeLimit', { name: entry.displayName }), 'info')
          } else {
            const bytes = new Uint8Array(buffer)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            const audioData = btoa(binary)
            const mimeType = fileName.endsWith('.ogg')
              ? 'audio/ogg'
              : fileName.endsWith('.wav')
                ? 'audio/wav'
                : 'audio/mpeg'
            sendMessage('dm:play-custom-audio', {
              fileName,
              loop: entry.loop,
              volume: entry.volume / 100,
              audioData,
              mimeType
            })
          }
        } catch (err) {
          logger.error('[DMAudioPanel] Failed to stream custom audio', err)
        }
      }
    },
    [campaignId, customAudioEntries, isHost, sendMessage, t]
  )

  const handleCustomVolumeChange = useCallback((fileName: string, vol: number) => {
    setCustomAudioEntries((prev) => prev.map((e) => (e.fileName === fileName ? { ...e, volume: vol } : e)))
    // Phase 27h — live-update the playing track's volume without a restart.
    const path = customAudioPathsRef.current.get(fileName)
    if (path) setCustomAudioVolume(path, vol / 100)
  }, [])

  const handleCustomLoopToggle = useCallback((fileName: string) => {
    setCustomAudioEntries((prev) => prev.map((e) => (e.fileName === fileName ? { ...e, loop: !e.loop } : e)))
  }, [])

  const handleDeleteCustom = useCallback(
    async (fileName: string) => {
      if (!campaignId) return
      // Phase 27b — stop by absolute path (the Map key), not fileName.
      const path = customAudioPathsRef.current.get(fileName)
      if (path) stopCustomAudio(path)
      await window.api.audioDeleteCustom(campaignId, fileName)
      customAudioPathsRef.current.delete(fileName)
      setCustomAudioEntries((prev) => prev.filter((e) => e.fileName !== fileName))
    },
    [campaignId]
  )

  const handleCreatePlaylist = useCallback(() => {
    if (!newPlaylistName.trim()) return
    persistPlaylists([...playlists, createPlaylist(newPlaylistName)])
    setNewPlaylistName('')
  }, [newPlaylistName, persistPlaylists, playlists])

  const handleDeletePlaylist = useCallback(
    (id: string) => {
      if (playingPlaylistId === id) handleStopPlaylist()
      persistPlaylists(playlists.filter((p) => p.id !== id))
    },
    [handleStopPlaylist, persistPlaylists, playingPlaylistId, playlists]
  )

  const handleAddTrack = useCallback(
    (id: string, kind: 'preset' | 'custom', ref: string) => {
      persistPlaylists(playlists.map((p) => (p.id === id ? { ...p, tracks: [...p.tracks, { kind, ref }] } : p)))
    },
    [persistPlaylists, playlists]
  )

  const handleRemoveTrack = useCallback(
    (id: string, index: number) => {
      persistPlaylists(
        playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((_, i) => i !== index) } : p))
      )
    },
    [persistPlaylists, playlists]
  )

  const handleTogglePlaylistFlag = useCallback(
    (id: string, flag: 'shuffle' | 'loopPlaylist') => {
      persistPlaylists(playlists.map((p) => (p.id === id ? { ...p, [flag]: !p[flag] } : p)))
    },
    [persistPlaylists, playlists]
  )

  const filteredCustom =
    customFilter === 'all' ? customAudioEntries : customAudioEntries.filter((e) => e.category === customFilter)

  return (
    <div className="flex flex-col gap-2">
      {/* Ambient tracks grid */}
      <div>
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 block">
          {t('game.dmAudioPanel.ambientMusic')}
        </span>
        <div className="grid grid-cols-3 gap-1">
          {AMBIENT_TRACKS.map((track) => {
            const isActive = activeAmbient === track.id
            return (
              <button
                key={track.id}
                onClick={() => handleAmbientToggle(track.id)}
                disabled={isFading}
                className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-600/30 border border-amber-500/50 text-amber-300 shadow-[0_0_6px_rgba(245,158,11,0.15)]'
                    : 'bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300'
                } ${isFading ? 'opacity-60' : ''}`}
                title={
                  isActive
                    ? t('game.dmAudioPanel.stopTrack', { label: track.label })
                    : t('game.dmAudioPanel.playTrack', { label: track.label })
                }
              >
                <span className="text-xs">{track.icon}</span>
                <span className="truncate">{track.label}</span>
                {isActive && <span className="ml-auto text-[8px] text-accent animate-pulse">{'\u25B6'}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Volume sliders */}
      <div className="border-t border-border/40 pt-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 block">
          {t('game.dmAudioPanel.volume')}
        </span>
        <div className="space-y-1.5">
          {/* Ambient volume */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-14 shrink-0">{t('game.dmAudioPanel.ambient')}</span>
            <input
              name="ambient-volume"
              type="range"
              min={0}
              max={100}
              value={ambientVol}
              onChange={(e) => handleAmbientVolumeChange(Number(e.target.value))}
              className="flex-1 h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs text-gray-500 w-8 text-right">{ambientVol}%</span>
          </div>
          {/* Master volume */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-14 shrink-0">{t('game.dmAudioPanel.master')}</span>
            <input
              name="master-volume"
              type="range"
              min={0}
              max={100}
              value={masterVol}
              onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
              className="flex-1 h-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs text-gray-500 w-8 text-right">{masterVol}%</span>
          </div>
        </div>
      </div>

      {/* Quick SFX buttons */}
      <div className="border-t border-border/40 pt-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 block">
          {t('game.dmAudioPanel.quickSfx')}
        </span>
        <div className="flex flex-wrap gap-1">
          {QUICK_SFX.map((sfx) => (
            <button
              key={sfx.event}
              onClick={() => handlePlaySfx(sfx.event)}
              className="px-2 py-1 text-xs font-medium rounded bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer"
            >
              {sfx.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Sounds */}
      <div className="border-t border-border/40 pt-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
            {t('game.dmAudioPanel.customSounds')}
          </span>
          <button
            onClick={handleUploadCustom}
            disabled={uploading || !campaignId}
            className="px-2 py-0.5 text-xs font-medium rounded bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? t('game.dmAudioPanel.uploading') : t('game.dmAudioPanel.upload')}
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
                  : 'bg-surface-2/40 text-muted border border-border/40 hover:text-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Custom audio list */}
        {filteredCustom.length === 0 ? (
          <p className="text-[9px] text-gray-600 italic">
            {customAudioEntries.length === 0
              ? t('game.dmAudioPanel.noCustomSounds')
              : t('game.dmAudioPanel.noSoundsInCategory')}
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {filteredCustom.map((entry) => (
              <div key={entry.fileName} className="flex items-center gap-1 bg-surface-2/40 rounded px-1.5 py-1">
                {/* Play/Stop toggle */}
                <button
                  onClick={() => handleToggleCustomPlay(entry.fileName)}
                  className={`w-5 h-5 shrink-0 flex items-center justify-center rounded text-xs transition-all cursor-pointer ${
                    entry.playing ? 'bg-amber-600/40 text-amber-300' : 'bg-gray-700/60 text-muted hover:text-gray-200'
                  }`}
                  title={entry.playing ? t('game.dmAudioPanel.stop') : t('game.dmAudioPanel.play')}
                >
                  {entry.playing ? '\u25A0' : '\u25B6'}
                </button>

                {/* Name */}
                <span className="text-xs text-gray-300 truncate flex-1 min-w-0">{entry.displayName}</span>

                {/* Volume slider */}
                <input
                  name="custom-audio-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={entry.volume}
                  onChange={(e) => handleCustomVolumeChange(entry.fileName, Number(e.target.value))}
                  className="w-12 h-1 accent-amber-500 cursor-pointer"
                  title={t('game.dmAudioPanel.volumePercent', { value: entry.volume })}
                />

                {/* Loop toggle */}
                <button
                  onClick={() => handleCustomLoopToggle(entry.fileName)}
                  className={`text-[9px] px-1 py-0.5 rounded transition-all cursor-pointer ${
                    entry.loop
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                      : 'bg-gray-700/40 text-gray-500 border border-border/40 hover:text-muted'
                  }`}
                  title={entry.loop ? t('game.dmAudioPanel.loopOn') : t('game.dmAudioPanel.loopOff')}
                >
                  {'\u21BB'}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteCustom(entry.fileName)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
                  title={t('common.actions.delete')}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Playlists (Phase 27j) */}
      <div className="border-t border-border/40 pt-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
            {t('game.dmAudioPanel.playlists')}
          </span>
        </div>
        <div className="flex gap-1 mb-1.5">
          <input
            name="new-playlist-name"
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
            placeholder={t('game.dmAudioPanel.newPlaylistPlaceholder')}
            className="flex-1 min-w-0 px-2 py-0.5 text-xs bg-surface-2/60 border border-border/50 rounded text-gray-200 placeholder-gray-600"
          />
          <button
            onClick={handleCreatePlaylist}
            disabled={!newPlaylistName.trim()}
            className="px-2 py-0.5 text-xs font-medium rounded bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {t('game.dmAudioPanel.newPlaylist')}
          </button>
        </div>

        {playlists.length === 0 ? (
          <p className="text-[9px] text-gray-600 italic">{t('game.dmAudioPanel.noPlaylists')}</p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {playlists.map((pl) => {
              const isPlaying = playingPlaylistId === pl.id
              return (
                <div key={pl.id} className="bg-surface-2/40 rounded px-1.5 py-1">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => (isPlaying ? handleStopPlaylist() : handlePlayPlaylist(pl.id))}
                      disabled={pl.tracks.length === 0}
                      className={`w-5 h-5 shrink-0 flex items-center justify-center rounded text-xs cursor-pointer disabled:opacity-40 ${
                        isPlaying ? 'bg-amber-600/40 text-amber-300' : 'bg-gray-700/60 text-muted hover:text-gray-200'
                      }`}
                      title={isPlaying ? t('game.dmAudioPanel.stop') : t('game.dmAudioPanel.play')}
                    >
                      {isPlaying ? '■' : '▶'}
                    </button>
                    <span className="text-xs text-gray-300 truncate flex-1 min-w-0">
                      {pl.name} <span className="text-gray-600">({pl.tracks.length})</span>
                    </span>
                    {isPlaying && (
                      <button
                        onClick={handleSkipTrack}
                        className="text-[9px] px-1 py-0.5 rounded bg-gray-700/60 text-gray-300 hover:text-amber-300 cursor-pointer"
                        title={t('game.dmAudioPanel.skip')}
                      >
                        {'⏭'}
                      </button>
                    )}
                    <button
                      onClick={() => handleTogglePlaylistFlag(pl.id, 'shuffle')}
                      className={`text-[9px] px-1 py-0.5 rounded cursor-pointer ${
                        pl.shuffle ? 'bg-blue-600/30 text-blue-300' : 'bg-gray-700/40 text-gray-500'
                      }`}
                      title={t('game.dmAudioPanel.shuffle')}
                    >
                      {'\u{1F500}'}
                    </button>
                    <button
                      onClick={() => handleTogglePlaylistFlag(pl.id, 'loopPlaylist')}
                      className={`text-[9px] px-1 py-0.5 rounded cursor-pointer ${
                        pl.loopPlaylist ? 'bg-blue-600/30 text-blue-300' : 'bg-gray-700/40 text-gray-500'
                      }`}
                      title={t('game.dmAudioPanel.loopPlaylist')}
                    >
                      {'↻'}
                    </button>
                    <button
                      onClick={() => handleDeletePlaylist(pl.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
                      title={t('game.dmAudioPanel.deletePlaylist')}
                    >
                      &times;
                    </button>
                  </div>

                  {/* Tracks */}
                  {pl.tracks.length > 0 && (
                    <div className="mt-1 pl-6 space-y-0.5">
                      {pl.tracks.map((t, i) => (
                        <div key={i} className="flex items-center gap-1 text-[9px] text-muted">
                          <span
                            className={`truncate flex-1 ${isPlaying && pl.currentIndex === i ? 'text-amber-300' : ''}`}
                          >
                            {t.kind === 'preset' ? t.ref.replace('ambient-', '') : t.ref}
                          </span>
                          <button
                            onClick={() => handleRemoveTrack(pl.id, i)}
                            className="text-gray-600 hover:text-red-400 cursor-pointer"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add-track controls */}
                  <div className="mt-1 pl-6 flex gap-1">
                    <select
                      name="add-preset-track"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleAddTrack(pl.id, 'preset', e.target.value)
                      }}
                      className="flex-1 min-w-0 px-1 py-0.5 text-[9px] bg-surface-2/60 border border-border/50 rounded text-gray-300"
                    >
                      <option value="">{t('game.dmAudioPanel.addAmbient')}</option>
                      {AMBIENT_TRACKS.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.label}
                        </option>
                      ))}
                    </select>
                    {customAudioEntries.length > 0 && (
                      <select
                        name="add-custom-track"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleAddTrack(pl.id, 'custom', e.target.value)
                        }}
                        className="flex-1 min-w-0 px-1 py-0.5 text-[9px] bg-surface-2/60 border border-border/50 rounded text-gray-300"
                      >
                        <option value="">{t('game.dmAudioPanel.addCustom')}</option>
                        {customAudioEntries.map((entry) => (
                          <option key={entry.fileName} value={entry.fileName}>
                            {entry.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
