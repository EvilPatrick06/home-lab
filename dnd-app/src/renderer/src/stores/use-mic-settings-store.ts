import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Phase 17r — Microphone preferences persisted to localStorage so the user
 * keeps their device + gain + push-to-talk binding across sessions. The
 * settings are configuration-only for now (no live voice-chat consumer);
 * future phases that wire voice into the gameplay surface can read from
 * this store as the single source of truth.
 */
export interface MicSettings {
  /** `deviceId` from `navigator.mediaDevices.enumerateDevices()` for the
   *  user's chosen `audioinput`. `null` = let the browser default. */
  deviceId: string | null
  /** Linear input gain, 0–2.0 (rendered to the user as 0–200%). */
  gain: number
  /** KeyboardEvent.code (e.g. `'Space'`, `'KeyV'`) bound to push-to-talk.
   *  `null` = no PTT binding set yet. */
  pttKey: string | null
  setDeviceId: (id: string | null) => void
  setGain: (value: number) => void
  setPttKey: (code: string | null) => void
  reset: () => void
}

const DEFAULTS = {
  deviceId: null as string | null,
  gain: 1,
  pttKey: null as string | null
}

export const useMicSettingsStore = create<MicSettings>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setDeviceId: (deviceId) => set({ deviceId }),
      setGain: (gain) => set({ gain: Math.max(0, Math.min(2, gain)) }),
      setPttKey: (pttKey) => set({ pttKey }),
      reset: () => set({ ...DEFAULTS })
    }),
    {
      name: 'mic-settings',
      version: 1
    }
  )
)
