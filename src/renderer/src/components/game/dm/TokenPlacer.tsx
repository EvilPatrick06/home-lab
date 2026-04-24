import { useEffect, useRef, useState } from 'react'
import { load5eMonsters, searchMonsters } from '../../../services/data-provider'
import type { MapToken } from '../../../types/map'
import type { MonsterStatBlock } from '../../../types/monster'
import { logger } from '../../../utils/logger'
import MonsterStatBlockView from './MonsterStatBlockView'

interface TokenPlacerProps {
  tokens: MapToken[]
  onPlaceToken: (tokenData: Omit<MapToken, 'id' | 'gridX' | 'gridY'>) => void
  onRemoveToken: (tokenId: string) => void
  placingActive: boolean
}

export default function TokenPlacer({
  tokens,
  onPlaceToken,
  onRemoveToken,
  placingActive
}: TokenPlacerProps): JSX.Element {
  const [name, setName] = useState('')
  const [entityType, setEntityType] = useState<'player' | 'npc' | 'enemy'>('enemy')
  const [currentHP, setCurrentHP] = useState('')
  const [maxHP, setMaxHP] = useState('')
  const [ac, setAc] = useState('')
  const [walkSpeed, setWalkSpeed] = useState('')
  const [creatureSize, setCreatureSize] = useState<string>('Medium')
  const [sizeX, setSizeX] = useState(1)
  const [sizeY, setSizeY] = useState(1)
  const [flySpeed, setFlySpeed] = useState('')
  const [swimSpeed, setSwimSpeed] = useState('')
  const [climbSpeed, setClimbSpeed] = useState('')

  // Monster search
  const [allMonsters, setAllMonsters] = useState<MonsterStatBlock[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MonsterStatBlock[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedMonster, setSelectedMonster] = useState<MonsterStatBlock | null>(null)
  const [showStatBlock, setShowStatBlock] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load5eMonsters()
      .then(setAllMonsters)
      .catch((e) => logger.warn('[TokenPlacer] Failed to load monsters', e))
  }, [])

  useEffect(() => {
    if (searchQuery.trim().length >= 2 && allMonsters.length > 0) {
      const results = searchMonsters(allMonsters, searchQuery).slice(0, 10)
      setSearchResults(results)
      setShowDropdown(results.length > 0)
    } else {
      setSearchResults([])
      setShowDropdown(false)
    }
  }, [searchQuery, allMonsters])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelectMonster = (monster: MonsterStatBlock): void => {
    setSelectedMonster(monster)
    setName(monster.name)
    setSearchQuery('')
    setShowDropdown(false)
    setEntityType('enemy')

    // Auto-fill stats from monster
    setCurrentHP(String(monster.hp))
    setMaxHP(String(monster.hp))
    setAc(String(monster.ac))
    setWalkSpeed(String(monster.speed.walk))

    // Set size
    setCreatureSize(monster.size)
    setSizeX(monster.tokenSize.x)
    setSizeY(monster.tokenSize.y)

    // Set special speeds
    setFlySpeed(monster.speed.fly ? String(monster.speed.fly) : '')
    setSwimSpeed(monster.speed.swim ? String(monster.speed.swim) : '')
    setClimbSpeed(monster.speed.climb ? String(monster.speed.climb) : '')
  }

  const handlePlace = (): void => {
    if (!name.trim()) return
    onPlaceToken({
      entityId: crypto.randomUUID(),
      entityType,
      label: name.trim(),
      sizeX,
      sizeY,
      visibleToPlayers: false,
      conditions: [],
      currentHP: currentHP ? parseInt(currentHP, 10) : undefined,
      maxHP: maxHP ? parseInt(maxHP, 10) : undefined,
      ac: ac ? parseInt(ac, 10) : undefined,
      walkSpeed: walkSpeed ? parseInt(walkSpeed, 10) : undefined,
      monsterStatBlockId: selectedMonster?.id,
      initiativeModifier: selectedMonster?.initiative?.modifier,
      darkvision: selectedMonster?.senses.darkvision ? true : undefined,
      darkvisionRange: selectedMonster?.senses.darkvision || undefined,
      resistances: selectedMonster?.resistances,
      vulnerabilities: selectedMonster?.vulnerabilities,
      immunities: selectedMonster?.damageImmunities,
      flySpeed: flySpeed ? parseInt(flySpeed, 10) : undefined,
      swimSpeed: swimSpeed ? parseInt(swimSpeed, 10) : undefined,
      climbSpeed: climbSpeed ? parseInt(climbSpeed, 10) : undefined,
      specialSenses: selectedMonster
        ? [
            ...(selectedMonster.senses.blindsight
              ? [{ type: 'blindsight' as const, range: selectedMonster.senses.blindsight }]
              : []),
            ...(selectedMonster.senses.tremorsense
              ? [{ type: 'tremorsense' as const, range: selectedMonster.senses.tremorsense }]
              : []),
            ...(selectedMonster.senses.truesight
              ? [{ type: 'truesight' as const, range: selectedMonster.senses.truesight }]
              : [])
          ].length > 0
          ? [
              ...(selectedMonster.senses.blindsight
                ? [{ type: 'blindsight' as const, range: selectedMonster.senses.blindsight }]
                : []),
              ...(selectedMonster.senses.tremorsense
                ? [{ type: 'tremorsense' as const, range: selectedMonster.senses.tremorsense }]
                : []),
              ...(selectedMonster.senses.truesight
                ? [{ type: 'truesight' as const, range: selectedMonster.senses.truesight }]
                : [])
            ]
          : undefined
        : undefined
    })
    // Reset
    setName('')
    setCurrentHP('')
    setMaxHP('')
    setAc('')
    setWalkSpeed('')
    setFlySpeed('')
    setSwimSpeed('')
    setClimbSpeed('')
    setSelectedMonster(null)
  }

  // 2024 PHB creature size presets
  const sizeOptions = [
    { label: 'Tiny', x: 1, y: 1, desc: '2.5 ft (shares square)' },
    { label: 'Small', x: 1, y: 1, desc: '5 ft' },
    { label: 'Medium', x: 1, y: 1, desc: '5 ft' },
    { label: 'Large', x: 2, y: 2, desc: '10 ft (2\u00d72)' },
    { label: 'Huge', x: 3, y: 3, desc: '15 ft (3\u00d73)' },
    { label: 'Gargantuan', x: 4, y: 4, desc: '20 ft (4\u00d74)' }
  ]

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Place Token</h3>

      {/* Monster Search */}
      {allMonsters.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <label className="block text-xs text-gray-500 mb-1">Search Monsters</label>
          <input
            type="text"
            placeholder="Type to search (e.g. Goblin, Dragon)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true)
            }}
            className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
          {showDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMonster(m)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm text-gray-200">{m.name}</span>
                    <span className="text-[10px] text-gray-500 ml-2">
                      {m.size} {m.type}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-gray-500">
                    <span>CR {m.cr}</span>
                    <span>HP {m.hp}</span>
                    <span>AC {m.ac}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected monster indicator */}
      {selectedMonster && (
        <div className="flex items-center justify-between bg-amber-900/20 border border-amber-800/40 rounded-lg px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400 font-semibold">{selectedMonster.name}</span>
            <span className="text-[10px] text-gray-500">CR {selectedMonster.cr}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowStatBlock(!showStatBlock)}
              className="text-[10px] text-gray-400 hover:text-amber-400 transition-colors cursor-pointer px-1"
              title="Toggle stat block"
            >
              {showStatBlock ? 'Hide' : 'Stats'}
            </button>
            <button
              onClick={() => {
                setSelectedMonster(null)
                setName('')
                setCurrentHP('')
                setMaxHP('')
                setAc('')
                setWalkSpeed('')
              }}
              className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-xs"
              title="Clear selection"
            >
              &#x2715;
            </button>
          </div>
        </div>
      )}

      {/* Stat block preview */}
      {selectedMonster && showStatBlock && (
        <div className="max-h-80 overflow-y-auto">
          <MonsterStatBlockView monster={selectedMonster} />
        </div>
      )}

      <div>
        <input
          type="text"
          placeholder="Token name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
            placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Entity Type</label>
        <div className="flex gap-1">
          {(['player', 'npc', 'enemy'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setEntityType(type)}
              className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-colors cursor-pointer
                ${entityType === type ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">HP</label>
          <input
            type="number"
            placeholder="Current"
            value={currentHP}
            onChange={(e) => setCurrentHP(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>
          <input
            type="number"
            placeholder="Max"
            value={maxHP}
            onChange={(e) => setMaxHP(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">AC</label>
          <input
            type="number"
            placeholder="AC"
            value={ac}
            onChange={(e) => setAc(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Walk Speed (ft)</label>
          <input
            type="number"
            placeholder="30"
            value={walkSpeed}
            onChange={(e) => setWalkSpeed(e.target.value)}
            className="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Creature Size</label>
        <div className="grid grid-cols-3 gap-1">
          {sizeOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                setCreatureSize(opt.label)
                setSizeX(opt.x)
                setSizeY(opt.y)
              }}
              title={opt.desc}
              className={`py-1.5 text-xs rounded-lg transition-colors cursor-pointer
                ${
                  creatureSize === opt.label ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-gray-600 mt-1">{sizeOptions.find((o) => o.label === creatureSize)?.desc}</p>
      </div>

      {/* Special speeds (optional) */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Speeds (optional, ft)</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Fly"
            value={flySpeed}
            onChange={(e) => setFlySpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-blue-500 text-xs"
          />
          <input
            type="number"
            placeholder="Swim"
            value={swimSpeed}
            onChange={(e) => setSwimSpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-cyan-500 text-xs"
          />
          <input
            type="number"
            placeholder="Climb"
            value={climbSpeed}
            onChange={(e) => setClimbSpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-green-500 text-xs"
          />
        </div>
      </div>

      <button
        onClick={handlePlace}
        disabled={!name.trim()}
        className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm
          font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {placingActive ? 'Click map to place' : 'Prepare Token'}
      </button>

      {placingActive && <p className="text-xs text-amber-400 text-center">Click on the map to place the token</p>}

      {tokens.length > 0 && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Existing Tokens ({tokens.length})</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800/50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      token.entityType === 'player'
                        ? 'bg-blue-500'
                        : token.entityType === 'enemy'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                    }`}
                  />
                  <span className="text-gray-200 truncate">{token.label}</span>
                  {token.maxHP !== undefined && token.currentHP !== undefined && (
                    <span className="text-xs text-gray-500">
                      {token.currentHP}/{token.maxHP}
                    </span>
                  )}
                  {token.specialSenses && token.specialSenses.length > 0 && (
                    <span
                      className="text-[10px] text-amber-400"
                      title={token.specialSenses.map((s) => `${s.type} ${s.range}ft`).join(', ')}
                    >
                      {token.specialSenses.map((s) => s.type.charAt(0).toUpperCase()).join('')}
                    </span>
                  )}
                  {token.flySpeed && token.flySpeed > 0 && (
                    <span className="text-[10px] text-blue-400" title={`Fly ${token.flySpeed}ft`}>
                      F
                    </span>
                  )}
                  {token.swimSpeed && token.swimSpeed > 0 && (
                    <span className="text-[10px] text-cyan-400" title={`Swim ${token.swimSpeed}ft`}>
                      S
                    </span>
                  )}
                  {token.climbSpeed && token.climbSpeed > 0 && (
                    <span className="text-[10px] text-green-400" title={`Climb ${token.climbSpeed}ft`}>
                      C
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveToken(token.id)}
                  className="text-gray-500 hover:text-red-400 text-xs cursor-pointer ml-2 flex-shrink-0"
                  title="Remove token"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
