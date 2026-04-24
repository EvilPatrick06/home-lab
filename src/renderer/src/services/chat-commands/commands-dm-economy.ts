import { useLobbyStore } from '../../stores/use-lobby-store'
import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import { getLatestCharacter, saveAndBroadcastCharacter } from './helpers'
import type { ChatCommand } from './types'

const dmgoldCommand: ChatCommand = {
  name: 'dmgold',
  aliases: ['award'],
  description: 'Award gold to a player',
  usage: '/dmgold <player> <amount>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const match = args.match(/^(\S+)\s+([+-]?\d+)$/)
    if (!match) {
      ctx.addSystemMessage('Usage: /dmgold <player> <amount>')
      return
    }

    const [, playerQuery, amountStr] = match
    const amount = parseInt(amountStr, 10)

    const lobbyState = useLobbyStore.getState()
    const player = lobbyState.players?.find((p) => p.displayName?.toLowerCase().startsWith(playerQuery.toLowerCase()))

    if (!player || !player.characterId) {
      ctx.addSystemMessage(`Player not found or has no character: "${playerQuery}"`)
      return
    }

    const character = getLatestCharacter(player.characterId)
    if (!character || !is5eCharacter(character)) {
      ctx.addSystemMessage(`Could not find 5e character for ${player.displayName}.`)
      return
    }

    const char5e = character as Character5e
    const currentGold = char5e.treasure?.gp ?? 0
    const newGold = Math.max(0, currentGold + amount)

    const updated = { ...char5e, treasure: { ...char5e.treasure, gp: newGold } }
    saveAndBroadcastCharacter(updated)

    if (amount >= 0) {
      ctx.broadcastSystemMessage(`${player.displayName} received ${amount} gold. (Total: ${newGold} gp)`)
    } else {
      ctx.broadcastSystemMessage(`${player.displayName} lost ${Math.abs(amount)} gold. (Total: ${newGold} gp)`)
    }
  }
}

const xpCommand: ChatCommand = {
  name: 'xp',
  aliases: [],
  description: 'Award XP to players',
  usage: '/xp <amount> [player|all]',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 1) {
      ctx.addSystemMessage('Usage: /xp <amount> [player|all]')
      return
    }

    const amount = parseInt(parts[0], 10)
    if (Number.isNaN(amount) || amount <= 0) {
      ctx.addSystemMessage('XP amount must be a positive number.')
      return
    }

    const target = parts[1]?.toLowerCase()
    const lobbyState = useLobbyStore.getState()
    const players = lobbyState.players || []

    if (!target || target === 'all') {
      // Award to all player characters
      let awarded = 0
      for (const player of players) {
        if (!player.characterId) continue
        const character = getLatestCharacter(player.characterId)
        if (!character || !is5eCharacter(character)) continue

        const char5e = character as Character5e
        const currentXp = char5e.xp ?? 0
        const updated = { ...char5e, xp: currentXp + amount }
        saveAndBroadcastCharacter(updated)
        awarded++
      }

      ctx.broadcastSystemMessage(`${amount} XP awarded to ${awarded} player(s).`)
    } else {
      // Award to specific player
      const player = players.find((p) => p.displayName?.toLowerCase().startsWith(target))

      if (!player || !player.characterId) {
        ctx.addSystemMessage(`Player not found or has no character: "${target}"`)
        return
      }

      const character = getLatestCharacter(player.characterId)
      if (!character || !is5eCharacter(character)) {
        ctx.addSystemMessage(`Could not find 5e character for ${player.displayName}.`)
        return
      }

      const char5e = character as Character5e
      const currentXp = char5e.xp ?? 0
      const updated = { ...char5e, xp: currentXp + amount }
      saveAndBroadcastCharacter(updated)

      ctx.broadcastSystemMessage(`${player.displayName} received ${amount} XP. (Total: ${currentXp + amount})`)
    }
  }
}

const levelCommand: ChatCommand = {
  name: 'level',
  aliases: ['lvl'],
  description: 'Level up a character',
  usage: '/level <player>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const playerQuery = args.trim()
    if (!playerQuery) {
      ctx.addSystemMessage('Usage: /level <player>')
      return
    }

    const lobbyState = useLobbyStore.getState()
    const player = lobbyState.players?.find((p) => p.displayName?.toLowerCase().startsWith(playerQuery.toLowerCase()))

    if (!player || !player.characterId) {
      ctx.addSystemMessage(`Player not found or has no character: "${playerQuery}"`)
      return
    }

    const character = getLatestCharacter(player.characterId)
    if (!character || !is5eCharacter(character)) {
      ctx.addSystemMessage(`Could not find 5e character for ${player.displayName}.`)
      return
    }

    const char5e = character as Character5e
    const currentLevel = char5e.level ?? 1
    if (currentLevel >= 20) {
      ctx.addSystemMessage(`${player.displayName} is already at max level (20).`)
      return
    }

    const updated = { ...char5e, level: currentLevel + 1 }
    saveAndBroadcastCharacter(updated)

    ctx.broadcastSystemMessage(`${player.displayName} leveled up to ${currentLevel + 1}!`)
  }
}

const lootCommand: ChatCommand = {
  name: 'loot',
  aliases: ['treasure'],
  description: 'Open treasure generator',
  usage: '/loot [cr]',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('treasureGenerator')
  }
}

const encounterCommand: ChatCommand = {
  name: 'encounter',
  aliases: ['enc'],
  description: 'Open encounter builder',
  usage: '/encounter',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('encounterBuilder')
  }
}

const shopAddCommand: ChatCommand = {
  name: 'shopadd',
  aliases: [],
  description: 'Add an item to the current shop inventory',
  usage: '/shopadd <item name> <price in gp> [quantity]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const match = args.match(/^(.+?)\s+(\d+)\s*(?:gp)?\s*(?:x(\d+))?$/i)
    if (!match) {
      ctx.addSystemMessage('Usage: /shopadd <item name> <price> [xQuantity]  e.g. /shopadd Longsword 15 x5')
      return
    }
    const [, itemName, priceStr, qtyStr] = match
    const price = parseInt(priceStr, 10)
    const qty = qtyStr ? parseInt(qtyStr, 10) : 1
    ctx.broadcastSystemMessage(`Shop: Added **${itemName.trim()}** (${price} gp${qty > 1 ? `, x${qty}` : ''}).`)
  }
}

const shopRemoveCommand: ChatCommand = {
  name: 'shopremove',
  aliases: [],
  description: 'Remove an item from the current shop inventory',
  usage: '/shopremove <item name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const itemName = args.trim()
    if (!itemName) {
      ctx.addSystemMessage('Usage: /shopremove <item name>')
      return
    }
    ctx.broadcastSystemMessage(`Shop: Removed **${itemName}** from inventory.`)
  }
}

const identifyCommand: ChatCommand = {
  name: 'identify',
  aliases: [],
  description: 'Identify a magic item on a character',
  usage: '/identify <character> <item name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const match = args.match(/^(\S+)\s+(.+)$/)
    if (!match) {
      ctx.addSystemMessage('Usage: /identify <character> <item name>')
      return
    }
    const [, charQuery, itemQuery] = match
    const lobbyState = useLobbyStore.getState()
    const player = lobbyState.players?.find((p) => p.displayName?.toLowerCase().startsWith(charQuery.toLowerCase()))
    if (!player?.characterId) {
      ctx.addSystemMessage(`Character not found: "${charQuery}"`)
      return
    }
    const character = getLatestCharacter(player.characterId)
    if (!character) {
      ctx.addSystemMessage(`Character data not found for "${charQuery}"`)
      return
    }
    const itemIndex = (character.magicItems ?? []).findIndex(
      (mi) => mi.name.toLowerCase().includes(itemQuery.toLowerCase()) && mi.identified === false
    )
    if (itemIndex < 0) {
      ctx.addSystemMessage(`No unidentified magic item matching "${itemQuery}" found on ${character.name}.`)
      return
    }
    const updated: Character5e = {
      ...character,
      magicItems: (character.magicItems ?? []).map((mi, idx) => (idx === itemIndex ? { ...mi, identified: true } : mi)),
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcastCharacter(updated)
    ctx.broadcastSystemMessage(
      `**${ctx.playerName}** identified **${character.magicItems![itemIndex].name}** for ${character.name}!`
    )
  }
}

export const commands: ChatCommand[] = [
  dmgoldCommand,
  xpCommand,
  levelCommand,
  lootCommand,
  encounterCommand,
  shopAddCommand,
  shopRemoveCommand,
  identifyCommand
]
