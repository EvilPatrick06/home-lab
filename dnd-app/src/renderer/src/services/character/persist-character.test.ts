import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkStore } from '../../stores/network-store'
import { useCharacterStore } from '../../stores/use-character-store'
import type { Character } from '../../types/character'
import { persistCharacterIfOwned } from './persist-character'

// No window.api needed — saveCharacter is replaced with a spy below.
vi.stubGlobal('window', { api: {} })

function char(playerId: string): Character {
  return { id: 'c1', playerId } as unknown as Character
}

describe('persistCharacterIfOwned (CH-2b)', () => {
  let saveSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    saveSpy = vi.fn().mockResolvedValue(undefined)
    useCharacterStore.setState({ saveCharacter: saveSpy } as never)
    useNetworkStore.setState({ role: 'none' })
  })

  it('persists a single-player (non-networked) character', () => {
    expect(persistCharacterIfOwned(char('local'))).toBe(true)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it("persists the host's OWN character (playerId 'local')", () => {
    useNetworkStore.setState({ role: 'host' })
    expect(persistCharacterIfOwned(char('local'))).toBe(true)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it("does NOT persist a player's PC opened by the DM (foreign playerId)", () => {
    useNetworkStore.setState({ role: 'host' })
    expect(persistCharacterIfOwned(char('peer-7'))).toBe(false)
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('a client editing its own sheet still persists locally', () => {
    useNetworkStore.setState({ role: 'client' })
    expect(persistCharacterIfOwned(char('peer-7'))).toBe(true)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })
})
