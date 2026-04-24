import type { Character5e } from '../../../types/character-5e'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import ArmorManager5e from './ArmorManager5e'
import ResistancePanel5e from './ResistancePanel5e'
import ToolProficiencies5e from './ToolProficiencies5e'

interface DefenseSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function DefenseSection5e({ character, readonly }: DefenseSection5eProps): JSX.Element {
  return (
    <SheetSectionWrapper title="Defense">
      <ArmorManager5e character={character} readonly={readonly} />
      <ResistancePanel5e character={character} readonly={readonly} />
      <ToolProficiencies5e character={character} readonly={readonly} />
    </SheetSectionWrapper>
  )
}
