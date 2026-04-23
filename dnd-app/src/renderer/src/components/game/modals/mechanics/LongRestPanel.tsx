import { getLongRestPreview } from '../../../../services/character/rest-service-5e'
import type { Character5e } from '../../../../types/character-5e'

export interface PCLongRestState {
  selected: boolean
}

interface LongRestPanelProps {
  pcs: Character5e[]
  states: Record<string, PCLongRestState>
  onStatesChange: (states: Record<string, PCLongRestState>) => void
}

export function initLongRestStates(pcs: Character5e[]): Record<string, PCLongRestState> {
  const states: Record<string, PCLongRestState> = {}
  for (const pc of pcs) {
    states[pc.id] = { selected: true }
  }
  return states
}

export default function LongRestPanel({ pcs, states, onStatesChange }: LongRestPanelProps): JSX.Element {
  const toggleSelected = (pcId: string): void => {
    const state = states[pcId]
    if (!state) return
    onStatesChange({ ...states, [pcId]: { selected: !state.selected } })
  }

  return (
    <>
      {pcs.map((pc) => {
        const state = states[pc.id]
        if (!state) return null
        const preview = getLongRestPreview(pc)

        return (
          <div
            key={pc.id}
            className={`border rounded-lg p-3 transition-colors ${
              state.selected ? 'border-blue-600/50 bg-gray-800/50' : 'border-gray-700/30 bg-gray-800/20 opacity-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={state.selected}
                onChange={() => toggleSelected(pc.id)}
                className="accent-blue-500"
              />
              <span className="text-sm font-semibold text-gray-200">{pc.name}</span>
              <span className="text-xs text-gray-500">
                Lv{pc.level} {pc.classes.map((c) => c.name).join('/')}
              </span>
            </div>

            {state.selected && (
              <div className="pl-6 space-y-1">
                <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-0.5">
                  {preview.currentHP < preview.maxHP && (
                    <span>
                      HP: {preview.currentHP} → <span className="text-green-400">{preview.maxHP}</span>
                    </span>
                  )}
                  {preview.currentHD < preview.maxHD && (
                    <span>
                      HD: {preview.currentHD} → <span className="text-green-400">{preview.maxHD}</span>
                    </span>
                  )}
                  {preview.spellSlotsToRestore.length > 0 && (
                    <span className="text-blue-400">Spell slots restored</span>
                  )}
                  {preview.pactSlotsToRestore.length > 0 && (
                    <span className="text-purple-400">Pact magic restored</span>
                  )}
                  {preview.classResourcesToRestore.length > 0 && (
                    <span>Resources: {preview.classResourcesToRestore.map((r) => r.name).join(', ')}</span>
                  )}
                  {preview.exhaustionReduction && (
                    <span className="text-yellow-400">
                      Exhaustion {preview.currentExhaustionLevel} → {preview.currentExhaustionLevel - 1}
                    </span>
                  )}
                  {preview.heroicInspirationGain && <span className="text-amber-400">Heroic Inspiration</span>}
                  {preview.wildShapeRestore && <span>Wild Shape restored</span>}
                  {preview.deathSavesReset && <span>Death saves reset</span>}
                  {preview.innateSpellsToRestore.length > 0 && (
                    <span>Innate spells: {preview.innateSpellsToRestore.join(', ')}</span>
                  )}
                </div>
                {preview.currentHP === preview.maxHP &&
                  preview.currentHD === preview.maxHD &&
                  preview.spellSlotsToRestore.length === 0 &&
                  preview.classResourcesToRestore.length === 0 &&
                  !preview.exhaustionReduction &&
                  !preview.deathSavesReset && (
                    <div className="text-[10px] text-gray-600 italic">Already fully rested</div>
                  )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
