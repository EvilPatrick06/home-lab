import { useT } from '../../../i18n'
import type { Character } from '../../../types/character'
import { abilityModifier, formatMod } from '../../../types/character-common'
import type { EntityCondition } from '../../../types/game-state'

interface PlayerHUDProps {
  character: Character | null
  conditions: EntityCondition[]
}

export default function PlayerHUD({ character, conditions }: PlayerHUDProps): JSX.Element {
  const { t } = useT()
  if (!character) {
    return (
      <div className="bg-surface/90 border-t border-border px-4 py-2">
        <p className="text-sm text-gray-500">{t('game.playerHud.noCharacterLoaded')}</p>
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
      className="bg-surface/90 border-t border-border px-4 py-2"
      role="region"
      aria-label={t('game.playerHud.statusLabel', { name: character.name })}
    >
      <div className="flex items-center gap-6">
        {/* Name and level */}
        <div
          className="flex-shrink-0"
          aria-label={t('game.playerHud.characterLabel', { name: character.name, level: character.level })}
        >
          <span className="text-sm font-semibold text-fg">{character.name}</span>
          <span className="text-xs text-gray-500 ml-2">{t('game.playerHud.level', { level: character.level })}</span>
        </div>

        {/* HP bar */}
        <div
          className="flex items-center gap-2 min-w-[200px]"
          aria-label={`${t('game.playerHud.hitPointsLabel', { current: hp.current, max: hp.maximum })}${
            hp.temporary > 0 ? t('game.playerHud.temporaryHpSuffix', { temp: hp.temporary }) : ''
          }`}
        >
          <span className="text-xs text-gray-500" aria-hidden="true">
            {t('game.playerHud.hp')}
          </span>
          <div className="flex-1 relative">
            <div
              className="h-4 bg-surface-2 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={hp.current}
              aria-valuemin={0}
              aria-valuemax={hp.maximum}
              aria-label={t('game.playerHud.hitPointsRemaining')}
            >
              <div
                className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
                style={{ width: `${hpPercent}%` }}
              />
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow">
              {hp.current} / {hp.maximum}
              {hp.temporary > 0 && <span className="text-blue-300 ml-1">(+{hp.temporary})</span>}
            </span>
          </div>
        </div>

        {/* AC */}
        <div className="flex items-center gap-1 flex-shrink-0" aria-label={t('game.playerHud.armorClassLabel', { ac })}>
          <span className="text-xs text-gray-500" aria-hidden="true">
            {t('game.playerHud.ac')}
          </span>
          <span className="text-sm font-semibold text-fg bg-surface-2 rounded px-2 py-0.5" aria-hidden="true">
            {ac}
          </span>
        </div>

        {/* Initiative */}
        <div
          className="flex items-center gap-1 flex-shrink-0"
          aria-label={t('game.playerHud.initiativeLabel', { mod: formatMod(dexMod) })}
        >
          <span className="text-xs text-gray-500" aria-hidden="true">
            {t('game.playerHud.init')}
          </span>
          <span className="text-sm font-semibold text-fg bg-surface-2 rounded px-2 py-0.5" aria-hidden="true">
            {formatMod(dexMod)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1 flex-shrink-0" aria-label={t('game.playerHud.speedLabel', { speed })}>
          <span className="text-xs text-gray-500" aria-hidden="true">
            {t('game.playerHud.speed')}
          </span>
          <span className="text-sm font-semibold text-fg bg-surface-2 rounded px-2 py-0.5" aria-hidden="true">
            {t('game.playerHud.speedFeet', { speed })}
          </span>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <div
            className="flex items-center gap-1 flex-shrink-0"
            aria-label={t('game.playerHud.activeConditionsLabel', {
              list: conditions.map((c) => `${c.condition}${c.value ? ` ${c.value}` : ''}`).join(', ')
            })}
          >
            <span className="text-xs text-gray-500" aria-hidden="true">
              {t('game.playerHud.cond')}
            </span>
            <div className="flex gap-1" role="list">
              {conditions.map((cond) => (
                <span
                  key={cond.id}
                  role="listitem"
                  className="text-xs bg-purple-600/30 text-purple-300 border border-purple-500/50
                    rounded px-1.5 py-0.5"
                  aria-label={t('game.playerHud.conditionAriaLabel', {
                    name: cond.value ? `${cond.condition} ${cond.value}` : cond.condition,
                    duration:
                      cond.duration === 'permanent'
                        ? t('game.playerHud.permanent')
                        : t('game.playerHud.roundsRemaining', { count: cond.duration })
                  })}
                  title={t('game.playerHud.conditionTitle', {
                    name: cond.value ? `${cond.condition} ${cond.value}` : cond.condition,
                    duration:
                      cond.duration === 'permanent'
                        ? t('game.playerHud.permAbbrev')
                        : t('game.playerHud.roundsAbbrev', { count: cond.duration })
                  })}
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
