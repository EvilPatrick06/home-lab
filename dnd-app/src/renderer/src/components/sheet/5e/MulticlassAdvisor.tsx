import { useMemo } from 'react'
import {
  getMulticlassAdvice,
  type MulticlassAdvice,
  type MulticlassEligibility
} from '../../../services/character/multiclass-advisor'

type _MulticlassAdvice = MulticlassAdvice
type _MulticlassEligibility = MulticlassEligibility

import type { AbilityScoreSet } from '../../../types/character-common'
import { Modal } from '../../ui'

interface MulticlassAdvisorProps {
  open: boolean
  onClose: () => void
  abilityScores: AbilityScoreSet
  currentClasses: string[]
}

export default function MulticlassAdvisor({
  open,
  onClose,
  abilityScores,
  currentClasses
}: MulticlassAdvisorProps): JSX.Element {
  const advice = useMemo(() => getMulticlassAdvice(abilityScores, currentClasses), [abilityScores, currentClasses])

  return (
    <Modal open={open} onClose={onClose} title="Multiclass Advisor">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {/* Eligibility Table */}
        <div>
          <h4 className="text-sm font-semibold text-amber-400 mb-2">Class Eligibility</h4>
          <div className="space-y-1">
            {advice.eligible.map((e) => (
              <div
                key={e.className}
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  e.eligible ? 'bg-green-900/20 text-green-300' : 'bg-gray-800/50 text-gray-500'
                }`}
              >
                <span className="font-medium">{e.className}</span>
                <div className="flex items-center gap-2">
                  {e.requirements.map((r) => (
                    <span key={r.ability} className={`text-xs ${r.met ? 'text-green-400' : 'text-red-400'}`}>
                      {r.ability.slice(0, 3).toUpperCase()} {r.current}/{r.minimum}
                    </span>
                  ))}
                  <span className={`text-xs font-bold ${e.eligible ? 'text-green-400' : 'text-red-400'}`}>
                    {e.eligible ? 'Eligible' : 'Ineligible'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proficiency Gains */}
        {advice.gains.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-amber-400 mb-2">Proficiency Gains</h4>
            <div className="space-y-1">
              {advice.gains.map((g) => (
                <div key={g.className} className="text-sm">
                  <span className="text-gray-200 font-medium">{g.className}:</span>{' '}
                  <span className="text-gray-400">
                    {g.proficiencies.length > 0 ? g.proficiencies.join(', ') : 'None'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {advice.warnings.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-red-400 mb-2">Warnings</h4>
            <div className="space-y-2">
              {advice.warnings.map((w) => (
                <div key={w.className} className="p-2 rounded bg-red-900/20 border border-red-900/40">
                  <span className="text-sm text-red-300 font-medium">{w.className}:</span>{' '}
                  <span className="text-sm text-red-200/80">{w.warning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
