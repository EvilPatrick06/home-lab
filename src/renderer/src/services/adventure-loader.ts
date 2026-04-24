import type { Encounter } from '../types/encounter'
import type { GameSystem } from '../types/game-system'

export interface AdventureChapter {
  title: string
  description: string
  readAloudText?: string
  maps: string[]
  encounters: string[]
  locations?: string[]
  levelRange?: { min: number; max: number }
  keyEvents?: string[]
}

export interface AdventureNPC {
  id: string
  name: string
  description: string
  location: string
  role: 'ally' | 'enemy' | 'neutral' | 'patron' | 'shopkeeper'
  statBlockId?: string
  personality?: string
  motivation?: string
}

export interface AdventureLore {
  id: string
  title: string
  content: string
  category: 'location' | 'faction' | 'item' | 'world' | 'other'
}

export interface AdventureMapAssignment {
  chapterIndex: number
  mapId: string
  builtInMapId: string
}

export interface Adventure {
  id: string
  name: string
  system: GameSystem
  description: string
  icon: string
  levelRange?: { min: number; max: number }
  chapters: AdventureChapter[]
  npcs?: AdventureNPC[]
  encounters?: Encounter[]
  lore?: AdventureLore[]
  mapAssignments?: AdventureMapAssignment[]
}

let cachedAdventures: Adventure[] | null = null

export async function loadAdventures(): Promise<Adventure[]> {
  if (cachedAdventures) return cachedAdventures

  try {
    const res = await fetch('./data/5e/adventures/adventures.json')
    if (!res.ok) return []
    const data: Adventure[] = await res.json()
    cachedAdventures = data
    return data
  } catch {
    return []
  }
}
