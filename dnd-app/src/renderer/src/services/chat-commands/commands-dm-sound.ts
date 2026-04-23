import {
  type AmbientSound,
  getAllAmbientSounds,
  getCurrentAmbient,
  playAmbient,
  setAmbientVolume,
  setEnabled,
  setMuted,
  setVolume,
  stopAmbient
} from '../../services/sound-manager'
import type { ChatCommand } from './types'

const soundCommand: ChatCommand = {
  name: 'sound',
  aliases: ['sfx'],
  description: 'Control sound effects and ambient audio',
  usage: '/sound <mute|unmute|volume|ambient|stop>',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    switch (sub) {
      case 'mute':
        setMuted(true)
        return { type: 'system', content: 'Sound muted.' }

      case 'unmute':
        setMuted(false)
        return { type: 'system', content: 'Sound unmuted.' }

      case 'on':
        setEnabled(true)
        return { type: 'system', content: 'Sound effects enabled.' }

      case 'off':
        setEnabled(false)
        return { type: 'system', content: 'Sound effects disabled.' }

      case 'volume': {
        const val = parseFloat(parts[1])
        if (Number.isNaN(val) || val < 0 || val > 1) {
          return { type: 'error', content: 'Usage: /sound volume <0.0-1.0>' }
        }
        setVolume(val)
        return { type: 'system', content: `Sound volume set to ${Math.round(val * 100)}%.` }
      }

      case 'ambientvolume': {
        const val = parseFloat(parts[1])
        if (Number.isNaN(val) || val < 0 || val > 1) {
          return { type: 'error', content: 'Usage: /sound ambientvolume <0.0-1.0>' }
        }
        setAmbientVolume(val)
        return { type: 'system', content: `Ambient volume set to ${Math.round(val * 100)}%.` }
      }

      case 'ambient': {
        const ambientName = parts.slice(1).join('-')
        if (!ambientName) {
          const current = getCurrentAmbient()
          const available = getAllAmbientSounds()
            .map((s) => s.replace('ambient-', ''))
            .join(', ')
          return {
            type: 'system',
            content: current
              ? `Now playing: ${current.replace('ambient-', '')}. Available: ${available}`
              : `No ambient playing. Available: ${available}`
          }
        }
        const fullName = `ambient-${ambientName}` as AmbientSound
        const all = getAllAmbientSounds()
        if (!all.includes(fullName)) {
          return {
            type: 'error',
            content: `Unknown ambient: "${ambientName}". Available: ${all.map((s) => s.replace('ambient-', '')).join(', ')}`
          }
        }
        playAmbient(fullName)
        return { type: 'broadcast', content: `Ambient sound: ${ambientName}` }
      }

      case 'stop':
        stopAmbient()
        return { type: 'system', content: 'Ambient sound stopped.' }

      default:
        return { type: 'system', content: 'Usage: /sound <mute|unmute|on|off|volume|ambientvolume|ambient|stop>' }
    }
  }
}

export const commands: ChatCommand[] = [soundCommand]
