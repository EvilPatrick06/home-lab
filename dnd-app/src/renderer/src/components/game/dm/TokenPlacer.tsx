import { useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { load5eMonsters, searchMonsters } from '../../../services/data-provider'
import { getTokenStats } from '../../../services/game/token-stats'
import { monsterToTokenData } from '../../../services/map/monster-to-token'
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
  const { t } = useT()
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
  const [imagePath, setImagePath] = useState<string | undefined>()

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
    const base = selectedMonster
      ? monsterToTokenData(selectedMonster)
      : {
          entityId: crypto.randomUUID(),
          entityType: 'enemy' as const,
          label: '',
          sizeX: 1,
          sizeY: 1,
          visibleToPlayers: false,
          conditions: []
        }
    onPlaceToken({
      ...base,
      entityType,
      label: name.trim(),
      sizeX,
      sizeY,
      currentHP: currentHP ? parseInt(currentHP, 10) : base.currentHP,
      maxHP: maxHP ? parseInt(maxHP, 10) : base.maxHP,
      ac: ac ? parseInt(ac, 10) : base.ac,
      walkSpeed: walkSpeed ? parseInt(walkSpeed, 10) : base.walkSpeed,
      flySpeed: flySpeed ? parseInt(flySpeed, 10) : base.flySpeed,
      swimSpeed: swimSpeed ? parseInt(swimSpeed, 10) : base.swimSpeed,
      climbSpeed: climbSpeed ? parseInt(climbSpeed, 10) : base.climbSpeed,
      imagePath: imagePath ?? base.imagePath
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
    setImagePath(undefined)
    setSelectedMonster(null)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      alert(t('game.tokenPlacer.imageTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setImagePath(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  // 2024 PHB creature size presets
  const sizeOptions = [
    { label: 'Tiny', x: 1, y: 1, labelText: t('game.tokenPlacer.sizeTiny'), desc: t('game.tokenPlacer.sizeTinyDesc') },
    {
      label: 'Small',
      x: 1,
      y: 1,
      labelText: t('game.tokenPlacer.sizeSmall'),
      desc: t('game.tokenPlacer.sizeSmallDesc')
    },
    {
      label: 'Medium',
      x: 1,
      y: 1,
      labelText: t('game.tokenPlacer.sizeMedium'),
      desc: t('game.tokenPlacer.sizeMediumDesc')
    },
    {
      label: 'Large',
      x: 2,
      y: 2,
      labelText: t('game.tokenPlacer.sizeLarge'),
      desc: t('game.tokenPlacer.sizeLargeDesc')
    },
    { label: 'Huge', x: 3, y: 3, labelText: t('game.tokenPlacer.sizeHuge'), desc: t('game.tokenPlacer.sizeHugeDesc') },
    {
      label: 'Gargantuan',
      x: 4,
      y: 4,
      labelText: t('game.tokenPlacer.sizeGargantuan'),
      desc: t('game.tokenPlacer.sizeGargantuanDesc')
    }
  ]

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{t('game.tokenPlacer.title')}</h3>

      {/* Monster Search */}
      {allMonsters.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.searchMonsters')}</label>
          <input
            aria-label={t('game.tokenPlacer.searchPlaceholder')}
            type="text"
            placeholder={t('game.tokenPlacer.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true)
            }}
            className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
          {showDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-surface-2 border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMonster(m)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm text-gray-200">{m.name}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {m.size} {m.type}
                    </span>
                  </div>
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span>{t('game.tokenPlacer.crValue', { cr: m.cr })}</span>
                    <span>{t('game.tokenPlacer.hpValue', { hp: m.hp })}</span>
                    <span>{t('game.tokenPlacer.acValue', { ac: m.ac })}</span>
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
            <span className="text-xs text-accent font-semibold">{selectedMonster.name}</span>
            <span className="text-xs text-gray-500">{t('game.tokenPlacer.crValue', { cr: selectedMonster.cr })}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowStatBlock(!showStatBlock)}
              className="text-xs text-muted hover:text-accent transition-colors cursor-pointer px-1"
              title={t('game.tokenPlacer.toggleStatBlock')}
            >
              {showStatBlock ? t('game.tokenPlacer.hide') : t('game.tokenPlacer.stats')}
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
              title={t('game.tokenPlacer.clearSelection')}
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
          aria-label={t('game.tokenPlacer.tokenNamePlaceholder')}
          type="text"
          placeholder={t('game.tokenPlacer.tokenNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
            placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="block text-xs text-gray-500">{t('game.tokenPlacer.tokenImage')}</label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageUpload}
            className="text-xs text-muted file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-surface-2 file:text-gray-300 hover:file:bg-gray-700 w-full"
          />
          {imagePath && (
            <button
              onClick={() => setImagePath(undefined)}
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-900/20 rounded border border-red-900/50 cursor-pointer flex-shrink-0"
              title={t('game.tokenPlacer.removeImage')}
            >
              &#x2715;
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.entityType')}</label>
        <div className="flex gap-1">
          {(['player', 'npc', 'enemy'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setEntityType(type)}
              className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-colors cursor-pointer
                ${entityType === type ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.hp')}</label>
          <input
            aria-label={t('game.tokenPlacer.currentPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.currentPlaceholder')}
            value={currentHP}
            onChange={(e) => setCurrentHP(e.target.value)}
            className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>
          <input
            aria-label={t('game.tokenPlacer.maxPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.maxPlaceholder')}
            value={maxHP}
            onChange={(e) => setMaxHP(e.target.value)}
            className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.ac')}</label>
          <input
            aria-label={t('game.tokenPlacer.acPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.acPlaceholder')}
            value={ac}
            onChange={(e) => setAc(e.target.value)}
            className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.walkSpeed')}</label>
          <input
            aria-label="30"
            type="number"
            placeholder="30"
            value={walkSpeed}
            onChange={(e) => setWalkSpeed(e.target.value)}
            className="w-full p-2 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-amber-500 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.creatureSize')}</label>
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
                  creatureSize === opt.label ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
                }`}
            >
              {opt.labelText}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-1">{sizeOptions.find((o) => o.label === creatureSize)?.desc}</p>
      </div>

      {/* Special speeds (optional) */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('game.tokenPlacer.speedsOptional')}</label>
        <div className="flex gap-2">
          <input
            aria-label={t('game.tokenPlacer.flyPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.flyPlaceholder')}
            value={flySpeed}
            onChange={(e) => setFlySpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-blue-500 text-xs"
          />
          <input
            aria-label={t('game.tokenPlacer.swimPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.swimPlaceholder')}
            value={swimSpeed}
            onChange={(e) => setSwimSpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-cyan-500 text-xs"
          />
          <input
            aria-label={t('game.tokenPlacer.climbPlaceholder')}
            type="number"
            placeholder={t('game.tokenPlacer.climbPlaceholder')}
            value={climbSpeed}
            onChange={(e) => setClimbSpeed(e.target.value)}
            className="flex-1 p-1.5 rounded-lg bg-surface-2 border border-border text-fg
              placeholder-gray-600 focus:outline-none focus:border-green-500 text-xs"
          />
        </div>
      </div>

      <button
        onClick={handlePlace}
        disabled={!name.trim()}
        className="w-full py-2 rounded-lg bg-amber-600 hover:bg-accent-strong text-white text-sm
          font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {placingActive ? t('game.tokenPlacer.clickToPlace') : t('game.tokenPlacer.prepareToken')}
      </button>

      {placingActive && <p className="text-xs text-accent text-center">{t('game.tokenPlacer.clickMapInstruction')}</p>}

      {tokens.length > 0 && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            {t('game.tokenPlacer.existingTokens', { count: tokens.length })}
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tokens.map((token) => {
              const stats = getTokenStats(token)
              return (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface-2/50 text-sm"
                >
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
                    {stats.maxHP !== undefined && token.currentHP !== undefined && (
                      <span className="text-xs text-gray-500">
                        {token.currentHP}/{stats.maxHP}
                      </span>
                    )}
                    {stats.specialSenses && stats.specialSenses.length > 0 && (
                      <span
                        className="text-xs text-accent"
                        title={stats.specialSenses.map((s) => `${s.type} ${s.range}ft`).join(', ')}
                      >
                        {stats.specialSenses.map((s) => s.type.charAt(0).toUpperCase()).join('')}
                      </span>
                    )}
                    {stats.flySpeed && stats.flySpeed > 0 && (
                      <span className="text-xs text-blue-400" title={`Fly ${stats.flySpeed}ft`}>
                        F
                      </span>
                    )}
                    {stats.swimSpeed && stats.swimSpeed > 0 && (
                      <span className="text-xs text-cyan-400" title={`Swim ${stats.swimSpeed}ft`}>
                        S
                      </span>
                    )}
                    {stats.climbSpeed && stats.climbSpeed > 0 && (
                      <span className="text-xs text-green-400" title={`Climb ${stats.climbSpeed}ft`}>
                        C
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveToken(token.id)}
                    className="text-gray-500 hover:text-red-400 text-xs cursor-pointer ml-2 flex-shrink-0"
                    title={t('game.tokenPlacer.removeToken')}
                  >
                    &#x2715;
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
