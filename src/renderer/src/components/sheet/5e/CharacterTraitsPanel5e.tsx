import { useCharacterEditor } from '../../../hooks/use-character-editor'
import type { Character5e } from '../../../types/character-5e'
import BackgroundPanel5e from './BackgroundPanel5e'
import TraitEditor5e from './TraitEditor5e'

export default function CharacterTraitsPanel5e({
  character,
  readonly
}: {
  character: Character5e
  readonly?: boolean
}): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)

  const getLatestTyped = (): Character5e | undefined => {
    const latest = getLatest()
    if (!latest || latest.gameSystem !== 'dnd5e') return undefined
    return latest as Character5e
  }

  const saveTyped = (updated: Character5e): void => {
    saveAndBroadcast(updated)
  }

  return (
    <>
      <TraitEditor5e
        character={character}
        readonly={readonly}
        getLatest={getLatestTyped}
        saveAndBroadcast={saveTyped}
      />
      <BackgroundPanel5e
        character={character}
        readonly={readonly}
        getLatest={getLatestTyped}
        saveAndBroadcast={saveTyped}
      />
    </>
  )
}
