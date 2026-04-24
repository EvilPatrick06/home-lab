import { useEffect, useRef, useState } from 'react'
import { load5eMonsters } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import type { MonsterStatBlock } from '../../../types/monster'
import { logger } from '../../../utils/logger'

interface EmptyCellContextMenuProps {
  gridX: number
  gridY: number
  screenX: number
  screenY: number
  mapId: string
  onClose: () => void
  onPlaceToken: () => void
}

export default function EmptyCellContextMenu({
  gridX,
  gridY,
  screenX,
  screenY,
  mapId,
  onClose,
  onPlaceToken
}: EmptyCellContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [monsters, setMonsters] = useState<MonsterStatBlock[]>([])
  const [allMonsters, setAllMonsters] = useState<MonsterStatBlock[]>([])
  const addToken = useGameStore((s) => s.addToken)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  // Load monsters when search panel opens
  useEffect(() => {
    if (showSearch && allMonsters.length === 0) {
      load5eMonsters()
        .then(setAllMonsters)
        .catch((e) => logger.warn('Failed to load monsters for context menu', e))
    }
  }, [showSearch, allMonsters.length])

  // Filter monsters as user types
  useEffect(() => {
    if (!search.trim()) {
      setMonsters([])
      return
    }
    const term = search.toLowerCase()
    const filtered = allMonsters.filter((m) => m.name.toLowerCase().includes(term)).slice(0, 8)
    setMonsters(filtered)
  }, [search, allMonsters])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSelectMonster = (monster: MonsterStatBlock): void => {
    addToken(mapId, {
      id: crypto.randomUUID(),
      entityId: `npc-${crypto.randomUUID()}`,
      entityType: 'npc',
      label: monster.name,
      gridX,
      gridY,
      sizeX: monster.tokenSize?.x ?? 1,
      sizeY: monster.tokenSize?.y ?? 1,
      visibleToPlayers: false,
      nameVisible: false,
      conditions: [],
      currentHP: monster.hp,
      maxHP: monster.hp,
      ac: monster.ac,
      monsterStatBlockId: monster.id,
      walkSpeed: monster.speed.walk ?? 0,
      swimSpeed: monster.speed.swim,
      climbSpeed: monster.speed.climb,
      flySpeed: monster.speed.fly,
      initiativeModifier: monster.abilityScores ? Math.floor((monster.abilityScores.dex - 10) / 2) : 0,
      resistances: monster.resistances,
      vulnerabilities: monster.vulnerabilities,
      immunities: monster.damageImmunities,
      darkvision: !!(monster.senses.darkvision && monster.senses.darkvision > 0),
      darkvisionRange: monster.senses.darkvision || undefined
    })

    addChatMessage({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: 'System',
      content: `DM placed ${monster.name} on the map.`,
      timestamp: Date.now(),
      isSystem: true
    })

    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="absolute bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[180px]"
      style={{ left: screenX, top: screenY }}
    >
      {!showSearch ? (
        <>
          <button
            onClick={() => setShowSearch(true)}
            className="w-full px-4 py-2 text-xs text-left text-gray-200 hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Summon Monster
          </button>
          <button
            onClick={() => {
              onPlaceToken()
              onClose()
            }}
            className="w-full px-4 py-2 text-xs text-left text-gray-200 hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Place Token
          </button>
        </>
      ) : (
        <div className="p-2 w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search monsters..."
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-amber-500 mb-1.5"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {monsters.length === 0 && search.trim() && (
              <p className="text-[10px] text-gray-500 italic px-2 py-1">No matches</p>
            )}
            {monsters.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelectMonster(m)}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-200 hover:bg-gray-700 rounded transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>{m.name}</span>
                <span className="text-[10px] text-gray-500">CR {m.cr}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
