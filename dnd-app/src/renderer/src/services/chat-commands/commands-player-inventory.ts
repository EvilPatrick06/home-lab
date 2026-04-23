import { useCharacterStore } from '../../stores/use-character-store'
import { is5eCharacter } from '../../types/character'
import type { ChatCommand, CommandReturn } from './types'

function findEquipmentItem(characterId: string, itemName: string) {
  const char = useCharacterStore.getState().characters.find((c) => c.id === characterId)
  if (!char || !is5eCharacter(char)) return null
  const lower = itemName.toLowerCase()
  const idx = char.equipment.findIndex((e) => e.name.toLowerCase() === lower)
  return idx >= 0 ? { char, idx, item: char.equipment[idx] } : null
}

function findMagicItem(characterId: string, itemName: string) {
  const char = useCharacterStore.getState().characters.find((c) => c.id === characterId)
  if (!char || !is5eCharacter(char) || !char.magicItems) return null
  const lower = itemName.toLowerCase()
  const idx = char.magicItems.findIndex((e) => e.name.toLowerCase() === lower)
  return idx >= 0 ? { char, idx, item: char.magicItems[idx] } : null
}

const equipCommand: ChatCommand = {
  name: 'equip',
  aliases: [],
  description: 'Equip an item from inventory',
  usage: '/equip <item name>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const item = args.trim()
    if (!item) {
      return { type: 'error', content: 'Usage: /equip <item name>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const found = findEquipmentItem(ctx.character.id, item)
    if (!found) {
      return { type: 'error', content: `Item "${item}" not found in inventory.` }
    }
    if (found.item.equipped) {
      return { type: 'error', content: `**${found.item.name}** is already equipped.` }
    }
    const updatedEquipment = [...found.char.equipment]
    updatedEquipment[found.idx] = { ...found.item, equipped: true }
    useCharacterStore.getState().saveCharacter({ ...found.char, equipment: updatedEquipment })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** equips **${found.item.name}**.`
    }
  }
}

const unequipCommand: ChatCommand = {
  name: 'unequip',
  aliases: ['doff'],
  description: 'Unequip/doff an item',
  usage: '/unequip <item name>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const item = args.trim()
    if (!item) {
      return { type: 'error', content: 'Usage: /unequip <item name>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const found = findEquipmentItem(ctx.character.id, item)
    if (!found) {
      return { type: 'error', content: `Item "${item}" not found in inventory.` }
    }
    if (!found.item.equipped) {
      return { type: 'error', content: `**${found.item.name}** is not equipped.` }
    }
    const updatedEquipment = [...found.char.equipment]
    updatedEquipment[found.idx] = { ...found.item, equipped: false }
    useCharacterStore.getState().saveCharacter({ ...found.char, equipment: updatedEquipment })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** unequips **${found.item.name}**.`
    }
  }
}

const attuneCommand: ChatCommand = {
  name: 'attune',
  aliases: [],
  description: 'Attune to a magic item (requires short rest)',
  usage: '/attune <item name>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const item = args.trim()
    if (!item) {
      return { type: 'error', content: 'Usage: /attune <item name>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const found = findMagicItem(ctx.character.id, item)
    if (!found) {
      return { type: 'error', content: `Magic item "${item}" not found.` }
    }
    if (!found.item.attunement) {
      return { type: 'error', content: `**${found.item.name}** does not require attunement.` }
    }
    if (found.item.attuned) {
      return { type: 'error', content: `Already attuned to **${found.item.name}**.` }
    }
    const attunedCount = found.char.magicItems?.filter((m) => m.attuned).length ?? 0
    if (attunedCount >= 3) {
      return { type: 'error', content: 'Already attuned to 3 items (maximum). Unattune one first.' }
    }
    const updatedMagicItems = [...(found.char.magicItems ?? [])]
    updatedMagicItems[found.idx] = { ...found.item, attuned: true }
    useCharacterStore.getState().saveCharacter({ ...found.char, magicItems: updatedMagicItems })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attunes to **${found.item.name}** (requires short rest).`
    }
  }
}

const unattuneCommand: ChatCommand = {
  name: 'unattune',
  aliases: [],
  description: 'End attunement with a magic item',
  usage: '/unattune <item name>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const item = args.trim()
    if (!item) {
      return { type: 'error', content: 'Usage: /unattune <item name>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const found = findMagicItem(ctx.character.id, item)
    if (!found) {
      return { type: 'error', content: `Magic item "${item}" not found.` }
    }
    if (!found.item.attuned) {
      return { type: 'error', content: `Not attuned to **${found.item.name}**.` }
    }
    const updatedMagicItems = [...(found.char.magicItems ?? [])]
    updatedMagicItems[found.idx] = { ...found.item, attuned: false }
    useCharacterStore.getState().saveCharacter({ ...found.char, magicItems: updatedMagicItems })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** ends attunement with **${found.item.name}**.`
    }
  }
}

const masteryCommand: ChatCommand = {
  name: 'mastery',
  aliases: ['weaponmastery', 'wm'],
  description: 'Declare or switch weapon mastery property',
  usage: '/mastery <weapon> <property>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      return { type: 'error', content: 'Usage: /mastery <weapon> <property>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const weapon = parts.slice(0, -1).join(' ')
    const property = parts[parts.length - 1]
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** sets **${weapon}** mastery property to **${property}**.`
    }
  }
}

const useitemCommand: ChatCommand = {
  name: 'useitem',
  aliases: ['use'],
  description: 'Use a consumable item from inventory',
  usage: '/useitem <item name>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx): CommandReturn => {
    const item = args.trim()
    if (!item) {
      return { type: 'error', content: 'Usage: /useitem <item name>' }
    }
    if (!ctx.character) {
      return { type: 'error', content: 'No character selected.' }
    }
    const found = findEquipmentItem(ctx.character.id, item)
    if (!found) {
      return { type: 'error', content: `Item "${item}" not found in inventory.` }
    }
    if (found.item.quantity <= 1) {
      const updatedEquipment = found.char.equipment.filter((_, i) => i !== found.idx)
      useCharacterStore.getState().saveCharacter({ ...found.char, equipment: updatedEquipment })
    } else {
      const updatedEquipment = [...found.char.equipment]
      updatedEquipment[found.idx] = { ...found.item, quantity: found.item.quantity - 1 }
      useCharacterStore.getState().saveCharacter({ ...found.char, equipment: updatedEquipment })
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** uses **${found.item.name}**.`
    }
  }
}

const inventoryCommand: ChatCommand = {
  name: 'inventory',
  aliases: ['inv', 'bag'],
  description: 'Show inventory summary',
  usage: '/inventory',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    ctx.openModal?.('item')
  }
}

export const commands: ChatCommand[] = [
  equipCommand,
  unequipCommand,
  attuneCommand,
  unattuneCommand,
  masteryCommand,
  useitemCommand,
  inventoryCommand
]
