export type GameSystem = 'dnd5e' | (string & {})

export interface GameSystemConfig {
  id: string
  name: string
  shortName: string
  maxLevel: number
  dataPath: string
  referenceLabel: string
}

const _gameSystems: Record<string, GameSystemConfig> = {
  dnd5e: {
    id: 'dnd5e',
    name: 'D&D 5th Edition',
    shortName: '5e',
    maxLevel: 20,
    dataPath: './data/5e',
    referenceLabel: 'SRD'
  }
}

export const GAME_SYSTEMS: Record<string, GameSystemConfig> = _gameSystems

export function registerGameSystem(config: GameSystemConfig): void {
  _gameSystems[config.id] = config
}

export function unregisterGameSystem(id: string): void {
  if (id === 'dnd5e') return // Cannot remove built-in system
  delete _gameSystems[id]
}
