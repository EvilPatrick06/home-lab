import { useT } from '../../../../i18n'
import type { ConditionEffectResult } from '../../../../services/combat/attack-condition-effects'
import { type CoverType, getCoverACBonus } from '../../../../services/combat/combat-rules'
import { formatMod } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'
import type { AttackWeapon, UnarmedMode } from './attack-utils'

/* ──────────────────────── Step 3: Attack Roll / Grapple-Shove ──────────────────────── */

interface AttackRollStepProps {
  selectedWeapon: AttackWeapon
  selectedTarget: MapToken
  isUnarmed: boolean
  unarmedMode: UnarmedMode
  isOffhandAttack: boolean
  cover: CoverType
  computedEffects: ConditionEffectResult | null
  conditionOverrides: Record<string, boolean>
  setConditionOverrides: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  attackMod: number
  shoveChoice: 'push' | 'prone'
  setShoveChoice: (c: 'push' | 'prone') => void
  grappleResult: { success: boolean; message: string } | null
  characterName: string
  unarmedStrikeDC: number
  onRollAttack: () => void
  onRollGrappleSave: () => void
  onManualFail: () => void
  onManualPass: () => void
  onGrappleDone: () => void
  onBack: () => void
}

export function AttackRollStep({
  selectedWeapon,
  selectedTarget,
  isUnarmed,
  unarmedMode,
  isOffhandAttack,
  cover,
  computedEffects,
  conditionOverrides,
  setConditionOverrides,
  attackMod,
  shoveChoice,
  setShoveChoice,
  grappleResult,
  unarmedStrikeDC,
  onRollAttack,
  onRollGrappleSave,
  onManualFail,
  onManualPass,
  onGrappleDone,
  onBack
}: AttackRollStepProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-3">
      {isUnarmed && (unarmedMode === 'grapple' || unarmedMode === 'shove') ? (
        /* Grapple / Shove: target makes a save */
        <>
          <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
            <span
              className={unarmedMode === 'grapple' ? 'text-blue-400 font-semibold' : 'text-orange-400 font-semibold'}
            >
              {unarmedMode === 'grapple' ? t('game.attackRollStep.grapple') : t('game.attackRollStep.shove')}
            </span>
            <span className="mx-2">&rarr;</span>
            <span className="text-red-400 font-semibold">{selectedTarget.label}</span>
          </div>

          <div className="px-3 py-2 bg-gray-800 rounded-lg">
            <div className="text-xs text-gray-300 mb-1">
              {t('game.attackRollStep.targetMustMake', { target: selectedTarget.label })}{' '}
              <span className="text-white font-semibold">{t('game.attackRollStep.strOrDexSave')}</span>
            </div>
            <div className="text-lg font-bold text-center text-white">
              {t('game.attackRollStep.dc', { dc: unarmedStrikeDC })}
            </div>
          </div>

          {unarmedMode === 'shove' && !grappleResult && (
            <div className="px-3 py-2 bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">{t('game.attackRollStep.onFailureChoose')}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShoveChoice('push')}
                  className={`flex-1 px-2 py-1 text-xs rounded cursor-pointer ${shoveChoice === 'push' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {t('game.attackRollStep.push5ft')}
                </button>
                <button
                  onClick={() => setShoveChoice('prone')}
                  className={`flex-1 px-2 py-1 text-xs rounded cursor-pointer ${shoveChoice === 'prone' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {t('game.attackRollStep.knockProne')}
                </button>
              </div>
            </div>
          )}

          {!grappleResult ? (
            <div className="flex gap-2">
              <button
                onClick={onRollGrappleSave}
                className={`flex-1 px-4 py-3 text-white font-semibold rounded-lg cursor-pointer text-sm ${
                  unarmedMode === 'grapple' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                {t('game.attackRollStep.rollTargetSave')}
              </button>
              <button
                onClick={onManualFail}
                className="px-3 py-3 text-xs font-semibold bg-red-700 hover:bg-red-600 text-white rounded-lg cursor-pointer"
              >
                {t('game.attackRollStep.fail')}
              </button>
              <button
                onClick={onManualPass}
                className="px-3 py-3 text-xs font-semibold bg-green-700 hover:bg-green-600 text-white rounded-lg cursor-pointer"
              >
                {t('game.attackRollStep.pass')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className={`text-center p-3 rounded-lg border ${grappleResult.success ? 'border-green-500 bg-green-900/20' : 'border-red-500 bg-red-900/20'}`}
              >
                <div className={`text-sm font-bold ${grappleResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {grappleResult.success ? t('game.attackRollStep.saveSucceeded') : t('game.attackRollStep.saveFailed')}
                </div>
                <div className="text-xs text-gray-400 mt-1">{grappleResult.message}</div>
                {!grappleResult.success && unarmedMode === 'grapple' && (
                  <div className="text-xs text-blue-400 mt-1">{t('game.attackRollStep.grappledApplied')}</div>
                )}
                {!grappleResult.success && unarmedMode === 'shove' && (
                  <div className="text-xs text-orange-400 mt-1">
                    {shoveChoice === 'push'
                      ? t('game.attackRollStep.targetPushed')
                      : t('game.attackRollStep.targetProne')}
                  </div>
                )}
              </div>
              <button
                onClick={onGrappleDone}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
              >
                {t('game.attackRollStep.done')}
              </button>
            </div>
          )}

          <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
            {t('game.attackRollStep.back')}
          </button>
        </>
      ) : (
        /* Normal attack roll (including Unarmed Strike damage mode) */
        <>
          <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
            <span className="text-amber-400 font-semibold">
              {isUnarmed ? t('game.attackRollStep.unarmedStrike') : selectedWeapon.name}
              {isOffhandAttack && <span className="text-cyan-400 ml-1">{t('game.attackRollStep.offhand')}</span>}
            </span>
            <span className="mx-2">{t('game.attackRollStep.vs')}</span>
            <span className="text-red-400 font-semibold">{selectedTarget.label}</span>
            {cover !== 'none' && (
              <span className="ml-2 text-blue-400">
                {t('game.attackRollStep.coverInfo', { cover, bonus: getCoverACBonus(cover) })}
              </span>
            )}
          </div>

          {/* Condition effect banners */}
          {computedEffects && (
            <div className="space-y-1">
              {computedEffects.attackerCannotAct && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/40 border border-red-500/50 rounded-lg">
                  <span className="text-xs text-red-300 font-semibold">{t('game.attackRollStep.cannotAttack')}</span>
                </div>
              )}
              {computedEffects.advantageSources.map((src, i) => (
                <div
                  key={`adv-${i}`}
                  className="flex items-center justify-between px-3 py-1 bg-green-900/30 border border-green-500/40 rounded-lg"
                >
                  <span className="text-[11px] text-green-300">{t('game.attackRollStep.adv', { source: src })}</span>
                  <button
                    onClick={() => setConditionOverrides((o) => ({ ...o, [`adv-${i}`]: !o[`adv-${i}`] }))}
                    className={`text-xs px-1.5 py-0.5 rounded cursor-pointer ${conditionOverrides[`adv-${i}`] ? 'bg-gray-700 text-gray-400 line-through' : 'bg-green-800 text-green-200'}`}
                  >
                    {conditionOverrides[`adv-${i}`]
                      ? t('game.attackRollStep.overridden')
                      : t('game.attackRollStep.active')}
                  </button>
                </div>
              ))}
              {computedEffects.disadvantageSources.map((src, i) => (
                <div
                  key={`disadv-${i}`}
                  className="flex items-center justify-between px-3 py-1 bg-red-900/30 border border-red-500/40 rounded-lg"
                >
                  <span className="text-[11px] text-red-300">{t('game.attackRollStep.disadv', { source: src })}</span>
                  <button
                    onClick={() => setConditionOverrides((o) => ({ ...o, [`disadv-${i}`]: !o[`disadv-${i}`] }))}
                    className={`text-xs px-1.5 py-0.5 rounded cursor-pointer ${conditionOverrides[`disadv-${i}`] ? 'bg-gray-700 text-gray-400 line-through' : 'bg-red-800 text-red-200'}`}
                  >
                    {conditionOverrides[`disadv-${i}`]
                      ? t('game.attackRollStep.overridden')
                      : t('game.attackRollStep.active')}
                  </button>
                </div>
              ))}
              {computedEffects.advantageSources.length > 0 && computedEffects.disadvantageSources.length > 0 && (
                <div className="px-3 py-1 bg-gray-800/50 border border-gray-600 rounded-lg">
                  <span className="text-[11px] text-gray-400">{t('game.attackRollStep.cancelOut')}</span>
                </div>
              )}
              {computedEffects.autoCrit && (
                <div className="px-3 py-1 bg-purple-900/30 border border-purple-500/40 rounded-lg">
                  <span className="text-[11px] text-purple-300">{t('game.attackRollStep.autoCrit')}</span>
                </div>
              )}
              {computedEffects.exhaustionPenalty !== 0 && (
                <div className="px-3 py-1 bg-orange-900/30 border border-orange-500/40 rounded-lg">
                  <span className="text-[11px] text-orange-300">
                    {t('game.attackRollStep.exhaustion', { penalty: computedEffects.exhaustionPenalty })}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onRollAttack}
            disabled={computedEffects?.attackerCannotAct}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('game.attackRollStep.rollAttack', { mod: formatMod(attackMod) })}
            {computedEffects?.rollMode === 'advantage'
              ? t('game.attackRollStep.advantageSuffix')
              : computedEffects?.rollMode === 'disadvantage'
                ? t('game.attackRollStep.disadvantageSuffix')
                : ''}
          </button>

          <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
            {t('game.attackRollStep.back')}
          </button>
        </>
      )}
    </div>
  )
}
