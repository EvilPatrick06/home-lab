import { trigger3dDice } from '../../components/game/dice3d'
import { useNetworkStore } from '../../stores/network-store'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { rollSingle } from '../dice/dice-service'
import { exportCampaignToFile, importCampaignFromFile } from '../io/campaign-io'
import { exportCharacterToFile, importCharacterFromFile } from '../io/character-io'
// PHASE-09 09H — undo/redo operate the real undo-manager. Scope today is DM map-editor
// actions (terrain/fog/token pushes); the player Ctrl+Z stays a no-op until more push()
// sites exist (factories: createTokenMoveAction, createFogAction).
import * as UndoManager from '../undo-manager'
import { getLatestCharacter } from './helpers'
import type { ChatCommand } from './types'

const undoCommand: ChatCommand = {
  name: 'undo',
  aliases: ['z'],
  description: 'Undo the last DM map action',
  usage: '/undo',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    if (!ctx.isDM) {
      return { type: 'error', content: 'Undo is DM-only — only DM map actions are undoable.' }
    }
    if (!UndoManager.canUndo()) {
      return { type: 'system', content: 'Nothing to undo.' }
    }
    UndoManager.undo()
    return { type: 'system', content: 'Undid the last map action.' }
  }
}

const redoCommand: ChatCommand = {
  name: 'redo',
  aliases: ['y'],
  description: 'Redo the last undone DM map action',
  usage: '/redo',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    if (!ctx.isDM) {
      return { type: 'error', content: 'Redo is DM-only — only DM map actions are undoable.' }
    }
    if (!UndoManager.canRedo()) {
      return { type: 'system', content: 'Nothing to redo.' }
    }
    UndoManager.redo()
    return { type: 'system', content: 'Redid the last map action.' }
  }
}

const latencyCommand: ChatCommand = {
  name: 'latency',
  aliases: ['lat'],
  description: 'Show measured network latency (round-trip time)',
  usage: '/latency',
  dmOnly: false,
  category: 'player',
  execute: () => {
    const net = useNetworkStore.getState()
    if (net.role === 'none') {
      return { type: 'system', content: 'Solo session — no network connection.' }
    }
    const mode = net.connectionMode === 'cloud' ? 'cloud relay' : 'direct/LAN'
    if (net.role === 'client') {
      const rtt = net.latencyMs == null ? 'measuring…' : `${net.latencyMs} ms`
      return { type: 'system', content: `Latency to host (${mode}): ${rtt}` }
    }
    // host — one line per connected peer
    const peers = net.peers
    if (peers.length === 0) {
      return { type: 'system', content: `Hosting (${mode}) — no players connected yet.` }
    }
    const lines = peers
      .map((p) => `  ${p.displayName}: ${p.latencyMs == null ? 'measuring…' : `${p.latencyMs} ms`}`)
      .join('\n')
    return {
      type: 'system',
      content: `Latency to ${peers.length} player${peers.length === 1 ? '' : 's'} (${mode}):\n${lines}`
    }
  }
}

const clearCommand: ChatCommand = {
  name: 'clear',
  aliases: [],
  description: 'Clear chat, combat state, or active effects',
  usage: '/clear <chat|combat|effects>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    switch (sub) {
      case 'chat': {
        // Wipe locally, then tell every peer to clear (host relays; client→host routes).
        useLobbyStore.getState().clearChatHistory()
        useNetworkStore.getState().sendMessage('chat:clear', {})
        return { type: 'system', content: 'Chat cleared for everyone.' }
      }
      case 'combat': {
        const game = useGameStore.getState()
        game.endInitiative()
        game.clearAllConditions()
        game.clearCombatLog()
        return { type: 'broadcast', content: 'Combat state cleared (initiative, conditions, combat log).' }
      }
      case 'effects': {
        useGameStore.getState().clearAllEffects()
        return { type: 'broadcast', content: 'All active effects cleared.' }
      }
      default:
        return { type: 'error', content: 'Usage: /clear <chat|combat|effects>' }
    }
  }
}

const logCommand: ChatCommand = {
  name: 'log',
  aliases: ['combatlog'],
  description: 'Show or clear the combat log',
  usage: '/log <show|clear>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const sub = args.trim().toLowerCase()
    if (sub === 'show' || !sub) {
      const log = useGameStore.getState().combatLog
      if (log.length === 0) {
        return { type: 'system', content: 'Combat log is empty.' }
      }
      const lines = log
        .slice(-10)
        .map((e) => `[R${e.round}] ${e.description}`)
        .join('\n')
      return { type: 'system', content: `Combat log (last ${Math.min(10, log.length)}):\n${lines}` }
    }
    if (sub === 'clear') {
      if (!ctx.isDM) {
        return { type: 'error', content: 'Only the DM can clear the combat log.' }
      }
      useGameStore.getState().clearCombatLog()
      return { type: 'system', content: 'Combat log cleared.' }
    }
    return { type: 'error', content: 'Usage: /log <show|clear>' }
  }
}

const exportCommand: ChatCommand = {
  name: 'export',
  aliases: [],
  description: 'Export your character or the active campaign to a file',
  usage: '/export <character|campaign>',
  dmOnly: false,
  category: 'player',
  execute: async (args, ctx) => {
    const sub = args.trim().toLowerCase()
    try {
      if (sub === 'character') {
        if (!ctx.character) return { type: 'error', content: 'No active character to export.' }
        const char = getLatestCharacter(ctx.character.id)
        if (!char) return { type: 'error', content: 'No active character to export.' }
        const saved = await exportCharacterToFile(char)
        return saved
          ? { type: 'system', content: `Exported character "${char.name}".` }
          : { type: 'system', content: 'Export cancelled.' }
      }
      if (sub === 'campaign') {
        const { activeCampaignId, campaigns } = useCampaignStore.getState()
        const campaign = campaigns.find((c) => c.id === activeCampaignId)
        if (!campaign) return { type: 'error', content: 'No active campaign to export.' }
        const saved = await exportCampaignToFile(campaign)
        return saved
          ? { type: 'system', content: `Exported campaign "${campaign.name}".` }
          : { type: 'system', content: 'Export cancelled.' }
      }
    } catch (err) {
      return { type: 'error', content: `Export failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { type: 'error', content: 'Usage: /export <character|campaign>' }
  }
}

const importCommand: ChatCommand = {
  name: 'import',
  aliases: [],
  description: 'Import a character or campaign from a file',
  usage: '/import <character|campaign>',
  dmOnly: false,
  category: 'player',
  execute: async (args) => {
    const sub = args.trim().toLowerCase()
    try {
      if (sub === 'character') {
        const character = await importCharacterFromFile()
        if (!character) return { type: 'system', content: 'Import cancelled.' }
        await useCharacterStore.getState().saveCharacter(character)
        return { type: 'system', content: `Imported character "${character.name}".` }
      }
      if (sub === 'campaign') {
        const result = await importCampaignFromFile()
        if (!result?.campaign) return { type: 'system', content: 'Import cancelled.' }
        await useCampaignStore.getState().saveCampaign(result.campaign)
        if (result.gameState) {
          await window.api.saveGameState(result.campaign.id, result.gameState)
        }
        return {
          type: 'system',
          content: `Campaign "${result.campaign.name}" imported — open it from the campaign list.`
        }
      }
    } catch (err) {
      return { type: 'error', content: `Import failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { type: 'error', content: 'Usage: /import <character|campaign>' }
  }
}

const shortcutsCommand: ChatCommand = {
  name: 'shortcuts',
  aliases: ['keys', 'hotkeys'],
  description: 'Show keyboard shortcuts reference',
  usage: '/shortcuts',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    ctx.openModal?.('shortcutRef')
  }
}

const versionCommand: ChatCommand = {
  name: 'version',
  aliases: ['ver', 'about'],
  description: 'Show application version information',
  usage: '/version',
  dmOnly: false,
  category: 'player',
  execute: () => {
    const ver = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'Local Dev'
    return {
      type: 'system',
      content: `D&D VTT — 5e 2024 Edition | Version: ${ver} | Electron + React 19 + PixiJS`
    }
  }
}

const rollinitiativeCommand: ChatCommand = {
  name: 'rollinitiative',
  aliases: ['ri'],
  description: 'Roll initiative for your character',
  usage: '/rollinitiative [modifier]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const mod = parseInt(args.trim(), 10)
    const modifier = Number.isNaN(mod) ? 0 : mod
    const roll = rollSingle(20)
    const total = roll + modifier
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** rolls Initiative: d20 (${roll}) ${modifier >= 0 ? '+' : ''}${modifier} = **${total}**${tag}`
    }
  }
}

const coinflipCommand: ChatCommand = {
  name: 'coinflip',
  aliases: ['coin', 'flip'],
  description: 'Flip a coin',
  usage: '/coinflip',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const coinRoll = rollSingle(2)
    const result = coinRoll === 1 ? 'Heads' : 'Tails'
    trigger3dDice({ formula: '1d2', rolls: [coinRoll], total: coinRoll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** flips a coin: **${result}!**`
    }
  }
}

const percentileCommand: ChatCommand = {
  name: 'percentile',
  aliases: ['d100', 'percent'],
  description: 'Roll percentile dice (d100)',
  usage: '/percentile',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const tensRoll = rollSingle(10) - 1
    const onesRoll = rollSingle(10) - 1
    const tens = tensRoll * 10
    const ones = onesRoll
    const total = tens + ones === 0 ? 100 : tens + ones
    trigger3dDice({ formula: '1d100', rolls: [total], total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** rolls d100: **${total}** (${tens} + ${ones})`
    }
  }
}

const stabilizeCommand: ChatCommand = {
  name: 'stabilize',
  aliases: ['stab'],
  description: 'Attempt to stabilize a dying creature (DC 10 Medicine)',
  usage: '/stabilize [target]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'a dying creature'
    const roll = rollSingle(20)
    const passed = roll >= 10
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    const result = passed ? `Success! ${target} is stabilized.` : `Failed. ${target} remains dying.`
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to stabilize ${target} — Medicine check: **${roll}**${tag} vs DC 10. ${result}`
    }
  }
}

const massiveDamageCommand: ChatCommand = {
  name: 'massivedamage',
  aliases: ['md'],
  description: 'Check massive damage threshold (PHB 2024: damage >= max HP = instant death)',
  usage: '/massivedamage <damage> <maxHP>',
  dmOnly: false,
  category: 'player',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const damage = parseInt(parts[0], 10)
    const maxHP = parseInt(parts[1], 10)
    if (Number.isNaN(damage) || Number.isNaN(maxHP)) {
      return { type: 'error', content: 'Usage: /massivedamage <damage> <maxHP>' }
    }
    if (damage >= maxHP) {
      return {
        type: 'broadcast',
        content: `**Massive Damage!** ${damage} damage >= ${maxHP} max HP. Instant death per PHB 2024.`
      }
    }
    return {
      type: 'system',
      content: `${damage} damage < ${maxHP} max HP. No massive damage.`
    }
  }
}

export const commands: ChatCommand[] = [
  undoCommand,
  redoCommand,
  latencyCommand,
  clearCommand,
  logCommand,
  exportCommand,
  importCommand,
  shortcutsCommand,
  versionCommand,
  rollinitiativeCommand,
  coinflipCommand,
  percentileCommand,
  stabilizeCommand,
  massiveDamageCommand
]
