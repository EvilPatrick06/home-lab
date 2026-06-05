/**
 * Magic-item attunement DM actions (P6.18 — G35).
 *
 * The engine toggles attunement via character.state.magicItemAttuned[instanceId]
 * (the /attune chat command does exactly this), but the AI DM had no verb for it.
 * These executors resolve the character + magic item by name (using the same
 * library-hydrated getEffectiveMagicItems path the UI uses), enforce the 5e rules
 * (attunement-required, not-already-attuned, 3-item limit), and persist.
 *
 * This must live renderer-side because magic items are library refs hydrated with a
 * runtime __instanceId — the main-process stat-mutation pipeline can't resolve them.
 *
 * Renderer-side `DmAction` is the loose `{ action: string; [k]: unknown }` shape, so
 * fields are read with explicit `as` casts, matching the other executors here.
 */

import { useCharacterStore } from '../../stores/use-character-store'
import { is5eCharacter } from '../../types/character'
import { getEffectiveMagicItems } from '../character/effective-character-5e'
import { postDmMessage } from './broadcast-helpers'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function resolveCharacterAndItem(characterName: string, itemName: string) {
  const char = useCharacterStore
    .getState()
    .characters.find((c) => c.name.toLowerCase() === characterName.toLowerCase() && is5eCharacter(c))
  if (!char || !is5eCharacter(char)) return { error: `Character "${characterName}" not found` as const }
  const magicItems = getEffectiveMagicItems(char)
  const item = magicItems.find((m) => m.name.toLowerCase() === itemName.toLowerCase())
  if (!item) return { error: `Magic item "${itemName}" not found on ${char.name}` as const }
  const instanceId = (item as unknown as { __instanceId: string }).__instanceId
  return { char, magicItems, item, instanceId }
}

export function executeAttuneItem(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterName = action.characterName as string
  const itemName = action.itemName as string
  if (!characterName || !itemName) throw new Error('Missing params for attune_item')

  const resolved = resolveCharacterAndItem(characterName, itemName)
  if ('error' in resolved) throw new Error(resolved.error)
  const { char, magicItems, item, instanceId } = resolved

  if (!item.attunement) throw new Error(`${item.name} does not require attunement`)
  if (item.attuned) return true // already attuned — idempotent no-op
  const attunedCount = magicItems.filter((m) => m.attuned).length
  if (attunedCount >= 3) throw new Error(`${char.name} is already attuned to 3 items (the maximum)`)

  useCharacterStore.getState().saveCharacter({
    ...char,
    state: {
      ...char.state,
      magicItemAttuned: { ...char.state?.magicItemAttuned, [instanceId]: true }
    }
  })
  postDmMessage(stores, 'attune', `🔗 ${char.name} attunes to ${item.name}.`)
  return true
}

export function executeUnattuneItem(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterName = action.characterName as string
  const itemName = action.itemName as string
  if (!characterName || !itemName) throw new Error('Missing params for unattune_item')

  const resolved = resolveCharacterAndItem(characterName, itemName)
  if ('error' in resolved) throw new Error(resolved.error)
  const { char, item, instanceId } = resolved

  useCharacterStore.getState().saveCharacter({
    ...char,
    state: {
      ...char.state,
      magicItemAttuned: { ...char.state?.magicItemAttuned, [instanceId]: false }
    }
  })
  postDmMessage(stores, 'unattune', `⛓️ ${char.name} ends attunement with ${item.name}.`)
  return true
}
