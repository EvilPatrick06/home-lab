import type { Character } from '../../../types/character'
import { abilityModifier, formatMod } from '../../../types/character-common'
import type { EntityCondition } from '../../../types/game-state'

interface PlayerHUDProps {
  character: Character | null
  conditions: EntityCondition[]
}

export default function PlayerHUD({ character, conditions }: PlayerHUDProps): JSX.Element {
  if (!character) {
    return (
      <div className="bg-gray-900/90 border-t border-gray-700 px-4 py-2">
        <p className="text-sm text-gray-500">No character loaded</p>
      </div>
    )
  }

  const hp = character.hitPoints
  const hpPercent = hp.maximum > 0 ? Math.max(0, (hp.current / hp.maximum) * 100) : 0
  const hpColor = hpPercent > 50 ? 'bg-green-500' : hpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'

  const ac = character.armorClass
  const speed = character.speed
  const dexMod = abilityModifier(character.abilityScores.dexterity)

  return (
    <div className="bg-gray-900/90 border-t border-gray-700 px-4 py-2">
      <div className="flex items-center gap-6">
        {/* Name and level */}
        <div className="flex-shrink-0">
          <span className="text-sm font-semibold text-gray-100">{character.name}</span>
          <span className="text-xs text-gray-500 ml-2">Lv {character.level}</span>
        </div>

        {/* HP bar */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <span className="text-xs text-gray-500">HP</span>
          <div className="flex-1 relative">
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
                style={{ width: `${hpPercent}%` }}
              />
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow">
              {hp.current} / {hp.maximum}
              {hp.temporary > 0 && <span className="text-blue-300 ml-1">(+{hp.temporary})</span>}
            </span>
          </div>
        </div>

        {/* AC */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500">AC</span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5">{ac}</span>
        </div>

        {/* Initiative */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500">Init</span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5">
            {formatMod(dexMod)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-500">Speed</span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5">{speed} ft</span>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-gray-500">Cond</span>
            <div className="flex gap-1">
              {conditions.map((cond) => (
                <span
                  key={cond.id}
                  className="text-[10px] bg-purple-600/30 text-purple-300 border border-purple-500/50
                    rounded px-1.5 py-0.5"
                  title={`${cond.condition}${cond.value ? ` ${cond.value}` : ''} (${cond.duration === 'permanent' ? 'Perm' : `${cond.duration}r`})`}
                >
                  {cond.condition}
                  {cond.value ? ` ${cond.value}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
