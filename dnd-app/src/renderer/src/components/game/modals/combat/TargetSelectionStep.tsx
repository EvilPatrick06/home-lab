import type { CoverType } from '../../../../services/combat/combat-rules'
import type { MapToken } from '../../../../types/map'
import type { AttackWeapon, UnarmedMode } from './attack-utils'

/* ──────────────────────── Step 2: Target Selection ──────────────────────── */

interface TargetSelectionStepProps {
  selectedWeapon: AttackWeapon
  isUnarmed: boolean
  unarmedMode: UnarmedMode
  targetableTokens: MapToken[]
  attackerToken: MapToken | null
  cover: CoverType
  setCover: (c: CoverType) => void
  onSelectTarget: (token: MapToken) => void
  onBack: () => void
  rangeChecker: (token: MapToken) => { status: string; color: string }
  grappleShoveChecker: (token: MapToken) => boolean
  charmedChecker: (token: MapToken) => boolean
}

export function TargetSelectionStep({
  selectedWeapon,
  isUnarmed,
  unarmedMode,
  targetableTokens,
  attackerToken,
  cover,
  setCover,
  onSelectTarget,
  onBack,
  rangeChecker,
  grappleShoveChecker,
  charmedChecker
}: TargetSelectionStepProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2">
        {isUnarmed ? (
          <>
            Unarmed Strike:{' '}
            <span
              className={`font-semibold ${unarmedMode === 'grapple' ? 'text-blue-400' : unarmedMode === 'shove' ? 'text-orange-400' : 'text-amber-400'}`}
            >
              {unarmedMode === 'damage' ? 'Damage' : unarmedMode === 'grapple' ? 'Grapple' : 'Shove'}
            </span>
          </>
        ) : (
          <>
            Attacking with: <span className="text-amber-400 font-semibold">{selectedWeapon.name}</span>
            <span className="ml-2 text-gray-500">
              ({selectedWeapon.damage} {selectedWeapon.damageType})
            </span>
          </>
        )}
      </div>

      {/* Range check info */}
      {selectedWeapon.range && attackerToken && (
        <div className="text-[10px] text-gray-500">Range: {selectedWeapon.range}</div>
      )}

      <div className="space-y-1.5">
        {targetableTokens.length === 0 ? (
          <p className="text-sm text-gray-500">No targets on the map</p>
        ) : (
          targetableTokens.map((token) => {
            const { status: rangeStatus, color: rangeColor } = rangeChecker(token)
            const grappleShoveBlocked = grappleShoveChecker(token)
            const charmedBlocked = charmedChecker(token)

            return (
              <button
                key={token.id}
                onClick={() => {
                  if (grappleShoveBlocked || charmedBlocked) return
                  onSelectTarget(token)
                }}
                disabled={grappleShoveBlocked || charmedBlocked}
                className={`w-full text-left px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg ${
                  grappleShoveBlocked || charmedBlocked
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-gray-700 cursor-pointer'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-200">{token.label}</span>
                  {token.currentHP != null && (
                    <span className="text-xs text-gray-500">
                      HP: {token.currentHP}/{token.maxHP}
                    </span>
                  )}
                </div>
                {rangeStatus && <div className={`text-[10px] mt-0.5 ${rangeColor}`}>{rangeStatus}</div>}
                {grappleShoveBlocked && (
                  <div className="text-[10px] mt-0.5 text-red-400">Too large to {unarmedMode}</div>
                )}
                {charmedBlocked && <div className="text-[10px] mt-0.5 text-pink-400">Charmed - cannot attack</div>}
              </button>
            )
          })
        )}
      </div>

      {/* Cover selector */}
      <div className="mt-3">
        <span className="text-xs text-gray-400">
          Cover: <span className="text-gray-600">(auto-calculated, click to override)</span>
        </span>
        <div className="flex gap-1 mt-1">
          {(['none', 'half', 'three-quarters', 'total'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCover(c)}
              className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
                cover === c ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {c === 'none' ? 'None' : c === 'half' ? 'Half (+2)' : c === 'three-quarters' ? '3/4 (+5)' : 'Total'}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
        Back
      </button>
    </div>
  )
}
