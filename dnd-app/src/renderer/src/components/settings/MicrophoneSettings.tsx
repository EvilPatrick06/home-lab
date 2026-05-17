import { useCallback, useEffect, useRef, useState } from 'react'
import { useMicSettingsStore } from '../../stores/use-mic-settings-store'
import { logger } from '../../utils/logger'

/**
 * Phase 17r — Microphone configuration panel.
 *
 * The user can pick an input device, see a live level meter that confirms
 * the mic is being read, bind a push-to-talk key, and tune input gain.
 * Selections persist via `useMicSettingsStore`. This panel does NOT yet
 * route the mic into a voice-chat consumer — that wiring is out of scope
 * this phase. Settings are saved and ready for a future voice integration.
 */
export default function MicrophoneSettings(): JSX.Element {
  const { deviceId, gain, pttKey, setDeviceId, setGain, setPttKey, reset } = useMicSettingsStore()

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [bindingPtt, setBindingPtt] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)

  // Enumerate audio-input devices on mount (and whenever the OS adds/removes
  // a mic). Browsers withhold device labels until we hold a permission, so
  // we may show "Microphone" without a name until the user clicks Test.
  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === 'audioinput'))
    } catch (err) {
      logger.warn('[MicSettings] enumerateDevices failed:', err)
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    const onChange = (): void => {
      void refreshDevices()
    }
    navigator.mediaDevices.addEventListener?.('devicechange', onChange)
    return () => {
      navigator.mediaDevices.removeEventListener?.('devicechange', onChange)
    }
  }, [refreshDevices])

  // Open the selected mic, route through a GainNode and AnalyserNode, and
  // drive the level meter via rAF. Re-opens whenever deviceId or gain
  // changes. Cleanup releases the stream + AudioContext.
  useEffect(() => {
    let cancelled = false

    async function start(): Promise<void> {
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        streamRef.current = stream

        const ctx = new (
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )()
        audioContextRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const gainNode = ctx.createGain()
        gainNode.gain.value = gain
        gainNodeRef.current = gainNode
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyserRef.current = analyser

        source.connect(gainNode)
        gainNode.connect(analyser)
        // NOTE: we intentionally do NOT connect to ctx.destination — that
        // would echo the user's mic to their speakers.

        const buf = new Uint8Array(analyser.frequencyBinCount)
        const tick = (): void => {
          if (!analyserRef.current) return
          analyserRef.current.getByteTimeDomainData(buf)
          // RMS amplitude → 0–1 normalized level.
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          setLevel(Math.min(1, rms * 3)) // scale up for visibility
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)

        // After getting permission, device labels become available — refresh.
        void refreshDevices()
        setPermissionError(null)
      } catch (err) {
        logger.warn('[MicSettings] getUserMedia failed:', err)
        setPermissionError(
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : 'Microphone permission denied or no input device available.'
        )
      }
    }

    void start()

    return () => {
      cancelled = true
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop()
        streamRef.current = null
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined)
        audioContextRef.current = null
      }
      analyserRef.current = null
      gainNodeRef.current = null
      setLevel(0)
    }
  }, [deviceId, gain, refreshDevices])

  // Push-to-talk capture: when bindingPtt is true, the next key the user
  // presses becomes the binding. Escape cancels without changing.
  useEffect(() => {
    if (!bindingPtt) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setBindingPtt(false)
        return
      }
      setPttKey(e.code)
      setBindingPtt(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bindingPtt, setPttKey])

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Pick the mic to use, see live input levels, set a push-to-talk key, and tune input gain. Settings persist across
        sessions and will feed a future voice-chat integration.
      </p>

      {/* Permission / error banner */}
      {permissionError && (
        <div className="rounded-lg border border-red-700/40 bg-red-900/20 p-3 text-xs text-red-300">
          <strong className="text-red-200">Microphone unavailable</strong>
          <p className="mt-1">{permissionError}</p>
        </div>
      )}

      {/* Device selector */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Input device</label>
        <select
          value={deviceId ?? ''}
          onChange={(e) => setDeviceId(e.target.value || null)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="">System default</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || `dev-${i}`} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      </div>

      {/* Live level meter */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Live level</label>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
          <div
            className="h-full transition-[width] duration-75 ease-linear"
            style={{
              width: `${Math.round(level * 100)}%`,
              background:
                level > 0.85
                  ? 'linear-gradient(90deg, #facc15, #ef4444)'
                  : level > 0.5
                    ? 'linear-gradient(90deg, #22c55e, #facc15)'
                    : '#22c55e'
            }}
            aria-label={`Microphone level ${Math.round(level * 100)}%`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-1">Speak into the mic — the bar should move with your voice.</p>
      </div>

      {/* Gain slider */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
          Input gain ({Math.round(gain * 100)}%)
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={gain}
          onChange={(e) => setGain(Number(e.target.value))}
          className="w-full"
          aria-label="Microphone input gain"
        />
        <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* Push-to-talk binding */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Push-to-talk</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBindingPtt(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-600 hover:border-amber-500 text-gray-200 hover:text-amber-300 transition-colors cursor-pointer"
          >
            {bindingPtt ? 'Press any key… (Esc to cancel)' : pttKey ? `Key: ${pttKey}` : 'Bind a key'}
          </button>
          {pttKey && !bindingPtt && (
            <button
              type="button"
              onClick={() => setPttKey(null)}
              className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-500 mt-1">Held while the bound key is pressed; released otherwise.</p>
      </div>

      {/* Reset to defaults */}
      <div className="pt-2 border-t border-gray-800">
        <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
          Reset microphone settings
        </button>
      </div>
    </div>
  )
}
