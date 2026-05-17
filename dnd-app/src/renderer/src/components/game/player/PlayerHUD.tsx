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
    // Phase 15h — Player HUD accessibility. The HUD bar is a region with
    // discrete stat groups (HP / AC / Init / Speed / Conditions); we wrap
    // it in a labelled region and give every stat group an aria-label so a
    // screen-reader user can navigate one stat at a time instead of
    // hearing a soup of decorative "HP" / "AC" / "Init" labels followed
    // by numbers.
    <section
      className="bg-gray-900/90 border-t border-gray-700 px-4 py-2"
      role="region"
      aria-label={`${character.name}'s status`}
    >
      <div className="flex items-center gap-6">
        {/* Name and level */}
        <div className="flex-shrink-0" aria-label={`Character: ${character.name}, level ${character.level}`}>
          <span className="text-sm font-semibold text-gray-100">{character.name}</span>
          <span className="text-xs text-gray-500 ml-2">Lv {character.level}</span>
        </div>

        {/* HP bar */}
        <div
          className="flex items-center gap-2 min-w-[200px]"
          aria-label={`Hit Points: ${hp.current} of ${hp.maximum}${hp.temporary > 0 ? `, plus ${hp.temporary} temporary` : ''}`}
        >
          <span className="text-xs text-gray-500" aria-hidden="true">
            HP
          </span>
          <div className="flex-1 relative">
            <div
              className="h-4 bg-gray-800 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={hp.current}
              aria-valuemin={0}
              aria-valuemax={hp.maximum}
              aria-label="Hit points remaining"
            >
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
        <div className="flex items-center gap-1 flex-shrink-0" aria-label={`Armor Class ${ac}`}>
          <span className="text-xs text-gray-500" aria-hidden="true">
            AC
          </span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5" aria-hidden="true">
            {ac}
          </span>
        </div>

        {/* Initiative */}
        <div className="flex items-center gap-1 flex-shrink-0" aria-label={`Initiative modifier ${formatMod(dexMod)}`}>
          <span className="text-xs text-gray-500" aria-hidden="true">
            Init
          </span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5" aria-hidden="true">
            {formatMod(dexMod)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 flex-shrink-0" aria-label={`Speed ${speed} feet`}>
          <span className="text-xs text-gray-500" aria-hidden="true">
            Speed
          </span>
          <span className="text-sm font-semibold text-gray-100 bg-gray-800 rounded px-2 py-0.5" aria-hidden="true">
            {speed} ft
          </span>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <div
            className="flex items-center gap-1 flex-shrink-0"
            aria-label={`Active conditions: ${conditions.map((c) => `${c.condition}${c.value ? ` ${c.value}` : ''}`).join(', ')}`}
          >
            <span className="text-xs text-gray-500" aria-hidden="true">
              Cond
            </span>
            <div className="flex gap-1" role="list">
              {conditions.map((cond) => (
                <span
                  key={cond.id}
                  role="listitem"
                  className="text-[10px] bg-purple-600/30 text-purple-300 border border-purple-500/50
                    rounded px-1.5 py-0.5"
                  aria-label={`Condition: ${cond.condition}${cond.value ? ` ${cond.value}` : ''}, ${
                    cond.duration === 'permanent' ? 'permanent' : `${cond.duration} rounds remaining`
                  }`}
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
    </section>
  )
}
