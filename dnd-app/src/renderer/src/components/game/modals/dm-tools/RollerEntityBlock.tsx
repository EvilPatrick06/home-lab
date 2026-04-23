import type { Character5e } from '../../../../types/character-5e'
import { type AbilityName, abilityModifier as charAbilityMod, formatMod } from '../../../../types/character-common'
import type { MonsterAction, MonsterStatBlock } from '../../../../types/monster'
import { abilityModifier as monsterAbilityMod } from '../../../../types/monster'

interface RollerEntityBlockProps {
  characterData?: Character5e | null
  monsterData?: MonsterStatBlock | null
  onRoll: (entityName: string, label: string, modifier: number) => void
  onDamageRoll: (entityName: string, action: MonsterAction) => void
}

// ---------------------------------------------------------------------------
// PC stat block
// ---------------------------------------------------------------------------

function PCBlock({
  char,
  onRoll
}: {
  char: Character5e
  onRoll: (entityName: string, label: string, modifier: number) => void
}): JSX.Element {
  const profBonus = Math.floor((char.level - 1) / 4) + 2
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400">
        Level {char.level} {char.classes.map((c) => c.name).join('/')} | HP: {char.hitPoints.current}/
        {char.hitPoints.maximum} | AC: {char.armorClass}
      </div>

      {/* Ability Scores */}
      <div className="grid grid-cols-6 gap-1 text-center">
        {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as AbilityName[]).map(
          (ab) => {
            const score = char.abilityScores[ab]
            const mod = charAbilityMod(score)
            return (
              <div key={ab} className="bg-gray-800/50 rounded p-1">
                <div className="text-[9px] text-gray-500 uppercase">{ab.slice(0, 3)}</div>
                <div className="text-xs text-gray-200 font-semibold">{score}</div>
                <button
                  onClick={() => onRoll(char.name, `${ab.slice(0, 3).toUpperCase()} Check`, mod)}
                  className="text-[9px] text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  {formatMod(mod)}
                </button>
              </div>
            )
          }
        )}
      </div>

      {/* Saves */}
      <div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Saving Throws</div>
        <div className="flex flex-wrap gap-1">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as AbilityName[]).map(
            (ab) => {
              const mod = charAbilityMod(char.abilityScores[ab])
              const isProficient = char.proficiencies?.savingThrows?.includes(ab) ?? false
              const totalMod = mod + (isProficient ? profBonus : 0)
              return (
                <button
                  key={ab}
                  onClick={() => onRoll(char.name, `${ab.slice(0, 3).toUpperCase()} Save`, totalMod)}
                  className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                    isProficient ? 'bg-amber-600/30 text-amber-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {ab.slice(0, 3).toUpperCase()} {formatMod(totalMod)}
                </button>
              )
            }
          )}
        </div>
      </div>

      {/* Skills */}
      <div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Skills</div>
        <div className="flex flex-wrap gap-1">
          {(char.skills ?? [])
            .filter((s) => s.proficient || s.expertise)
            .map((skill) => {
              const ab = skill.ability
              const mod = charAbilityMod(char.abilityScores[ab])
              const totalMod = mod + profBonus + (skill.expertise ? profBonus : 0)
              return (
                <button
                  key={skill.name}
                  onClick={() => onRoll(char.name, `${skill.name}`, totalMod)}
                  className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                    skill.expertise ? 'bg-purple-600/30 text-purple-300' : 'bg-amber-600/30 text-amber-300'
                  }`}
                >
                  {skill.name} {formatMod(totalMod)}
                </button>
              )
            })}
        </div>
      </div>

      {/* Weapons */}
      {char.weapons.length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Attacks</div>
          <div className="space-y-1">
            {char.weapons.map((w) => (
              <div key={w.id} className="flex items-center gap-2 bg-gray-800/30 rounded px-2 py-1">
                <span className="text-xs text-gray-200 flex-1">
                  {w.name}: {formatMod(w.attackBonus)} to hit, {w.damage} {w.damageType}
                </span>
                <button
                  onClick={() => onRoll(char.name, `${w.name} Attack`, w.attackBonus)}
                  className="text-[9px] px-1.5 py-0.5 bg-red-600/30 text-red-300 rounded cursor-pointer hover:bg-red-600/50"
                >
                  Attack
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Monster stat block
// ---------------------------------------------------------------------------

function MonsterBlock({
  monster,
  onRoll,
  onDamageRoll
}: {
  monster: MonsterStatBlock
  onRoll: (entityName: string, label: string, modifier: number) => void
  onDamageRoll: (entityName: string, action: MonsterAction) => void
}): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400">
        {monster.size} {monster.type}
        {monster.subtype ? ` (${monster.subtype})` : ''} | CR {monster.cr} | HP: {monster.hp} | AC: {monster.ac}
        {monster.acType ? ` (${monster.acType})` : ''}
      </div>

      {/* Ability Scores */}
      <div className="grid grid-cols-6 gap-1 text-center">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
          const score = monster.abilityScores[ab]
          const mod = monsterAbilityMod(score)
          return (
            <div key={ab} className="bg-gray-800/50 rounded p-1">
              <div className="text-[9px] text-gray-500 uppercase">{ab}</div>
              <div className="text-xs text-gray-200 font-semibold">{score}</div>
              <button
                onClick={() => onRoll(monster.name, `${ab.toUpperCase()} Check`, mod)}
                className="text-[9px] text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                {formatMod(mod)}
              </button>
            </div>
          )
        })}
      </div>

      {/* Saves */}
      {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Saving Throws</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(monster.savingThrows).map(([ab, mod]) => (
              <button
                key={ab}
                onClick={() => onRoll(monster.name, `${ab.toUpperCase()} Save`, mod as number)}
                className="px-1.5 py-0.5 text-[10px] bg-amber-600/30 text-amber-300 rounded cursor-pointer"
              >
                {ab.toUpperCase()} {formatMod(mod as number)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {monster.skills && Object.keys(monster.skills).length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Skills</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(monster.skills).map(([skill, mod]) => (
              <button
                key={skill}
                onClick={() => onRoll(monster.name, skill, mod)}
                className="px-1.5 py-0.5 text-[10px] bg-amber-600/30 text-amber-300 rounded cursor-pointer"
              >
                {skill} {formatMod(mod)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Traits */}
      {monster.traits && monster.traits.length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Traits</div>
          {monster.traits.map((t, i) => (
            <div key={i} className="text-[10px] text-gray-400 mb-1">
              <span className="text-gray-200 font-semibold">{t.name}.</span> {t.description}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div>
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Actions</div>
        <div className="space-y-1">
          {monster.actions.map((action, i) => (
            <div key={i} className="bg-gray-800/30 rounded px-2 py-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-200 font-semibold">{action.name}</span>
                {action.toHit != null && (
                  <>
                    <span className="text-[10px] text-gray-500">{formatMod(action.toHit)} to hit</span>
                    <button
                      onClick={() => onRoll(monster.name, `${action.name} Attack`, action.toHit!)}
                      className="text-[9px] px-1.5 py-0.5 bg-red-600/30 text-red-300 rounded cursor-pointer hover:bg-red-600/50"
                    >
                      Roll Attack
                    </button>
                  </>
                )}
                {action.damageDice && (
                  <button
                    onClick={() => onDamageRoll(monster.name, action)}
                    className="text-[9px] px-1.5 py-0.5 bg-orange-600/30 text-orange-300 rounded cursor-pointer hover:bg-orange-600/50"
                  >
                    Roll Damage
                  </button>
                )}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {action.damageDice && `${action.damageDice} ${action.damageType ?? ''}`}
                {action.reach && ` | Reach ${action.reach}ft`}
                {action.rangeNormal &&
                  ` | Range ${action.rangeNormal}${action.rangeLong ? `/${action.rangeLong}` : ''}ft`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bonus Actions */}
      {monster.bonusActions && monster.bonusActions.length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Bonus Actions</div>
          {monster.bonusActions.map((ba, i) => (
            <div key={i} className="text-[10px] text-gray-400 mb-1">
              <span className="text-gray-200 font-semibold">{ba.name}.</span> {ba.description}
            </div>
          ))}
        </div>
      )}

      {/* Reactions */}
      {monster.reactions && monster.reactions.length > 0 && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Reactions</div>
          {monster.reactions.map((r, i) => (
            <div key={i} className="text-[10px] text-gray-400 mb-1">
              <span className="text-gray-200 font-semibold">{r.name}.</span> {r.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wrapper — picks the right sub-block or shows a placeholder
// ---------------------------------------------------------------------------

export default function RollerEntityBlock({
  characterData,
  monsterData,
  onRoll,
  onDamageRoll
}: RollerEntityBlockProps): JSX.Element {
  if (characterData) {
    return <PCBlock char={characterData} onRoll={onRoll} />
  }
  if (monsterData) {
    return <MonsterBlock monster={monsterData} onRoll={onRoll} onDamageRoll={onDamageRoll} />
  }
  return <p className="text-xs text-gray-500 text-center py-4">No stat block available for this entity.</p>
}
