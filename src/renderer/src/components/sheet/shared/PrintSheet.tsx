import { useCallback } from 'react'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import PrintSheetHeader from './PrintSheetHeader'
import PrintSheetSpells from './PrintSheetSpells'
import PrintSheetStats from './PrintSheetStats'

interface PrintSheetProps {
  character: Character
  onClose: () => void
}

function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1
}

function PrintSheet5e({ character, onClose }: { character: Character5e; onClose: () => void }): JSX.Element {
  const pb = proficiencyBonus(character.level)

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-auto bg-white"
      style={{ fontFamily: 'Georgia, "Times New Roman", Times, serif', fontSize: '10pt', color: '#000' }}
    >
      {/* Toolbar - hidden when printing */}
      <div
        className="print:hidden sticky top-0 z-10 flex items-center gap-3 bg-gray-100 px-6 py-3 border-b border-gray-300 shadow-sm"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <button
          onClick={handlePrint}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Print
        </button>
        <button
          onClick={onClose}
          className="rounded bg-gray-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-600"
        >
          Close
        </button>
        <span className="ml-2 text-sm text-gray-600">Print preview for {character.name}</span>
      </div>

      {/* Sheet content */}
      <div className="mx-auto max-w-[8in] px-8 py-6 print:px-0 print:py-0 print:max-w-none">
        <PrintSheetHeader character={character} proficiencyBonus={pb} />
        <PrintSheetStats character={character} proficiencyBonus={pb} />
        <PrintSheetSpells character={character} />
      </div>
    </div>
  )
}

export default function PrintSheet({ character, onClose }: PrintSheetProps): JSX.Element {
  if (is5eCharacter(character)) {
    return <PrintSheet5e character={character} onClose={onClose} />
  }

  // Fallback - should not happen since only 5e is active
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
      <div className="text-center">
        <p className="text-lg font-semibold">Unsupported game system</p>
        <button onClick={onClose} className="mt-4 rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600">
          Close
        </button>
      </div>
    </div>
  )
}
