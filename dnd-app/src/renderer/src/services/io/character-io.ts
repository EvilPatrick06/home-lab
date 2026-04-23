import type { Character } from '../../types/character'

/**
 * Serialize a character to a portable JSON string.
 */
export function serializeCharacter(character: Character): string {
  return JSON.stringify(character, null, 2)
}

/**
 * Parse and validate a character JSON string from an imported file.
 * Validates that required fields exist: id, gameSystem, name.
 */
export function deserializeCharacter(json: string): Character {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid character file: malformed JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid character file: not a valid JSON object')
  }

  if (!parsed.id || typeof parsed.id !== 'string') {
    throw new Error('Invalid character file: missing or invalid "id" field')
  }

  if (!parsed.gameSystem || parsed.gameSystem !== 'dnd5e') {
    throw new Error('Invalid character file: missing or invalid "gameSystem" field (must be "dnd5e")')
  }

  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('Invalid character file: missing or invalid "name" field')
  }

  return parsed as unknown as Character
}

/**
 * Show a native "Save As" dialog and write the character JSON to disk.
 * Returns true if saved successfully, false if the user cancelled.
 */
export async function exportCharacterToFile(character: Character): Promise<boolean> {
  const filePath = await window.api.showSaveDialog({
    title: 'Export Character',
    filters: [{ name: 'D&D Character', extensions: ['dndchar'] }]
  })

  if (!filePath) return false

  const json = serializeCharacter(character)
  await window.api.writeFile(filePath, json)
  return true
}

/**
 * Show a native "Open" dialog and read a .dndchar file from disk.
 * Returns the parsed Character, or null if the user cancelled.
 */
export async function importCharacterFromFile(): Promise<Character | null> {
  const filePath = await window.api.showOpenDialog({
    title: 'Import Character',
    filters: [{ name: 'D&D Character', extensions: ['dndchar'] }]
  })

  if (!filePath) return null

  const json = await window.api.readFile(filePath)
  return deserializeCharacter(json)
}
