import { useGameStore } from '../../stores/use-game-store'
import { findTokenByName } from './helpers'
import type { ChatCommand } from './types'

const initiativeCommand: ChatCommand = {
  name: 'initiative',
  aliases: ['init'],
  description: 'Open initiative tracker',
  usage: '/initiative',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('initiativeTracker')
  }
}

const timerCommand: ChatCommand = {
  name: 'timer',
  aliases: [],
  description: 'Start or stop a turn timer',
  usage: '/timer <seconds> or /timer stop',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const trimmed = args.trim().toLowerCase()
    if (trimmed === 'stop') {
      useGameStore.getState().stopTimer()
      ctx.broadcastSystemMessage('⏱️ Turn timer stopped.')
      return
    }

    const seconds = parseInt(trimmed, 10)
    if (Number.isNaN(seconds) || seconds <= 0) {
      ctx.addSystemMessage('Usage: /timer <seconds> or /timer stop')
      return
    }

    useGameStore.getState().startTimer(seconds, 'Turn')
    ctx.broadcastSystemMessage(`⏱️ Turn timer set to ${seconds} seconds.`)
  }
}

const rollforCommand: ChatCommand = {
  name: 'rollfor',
  aliases: ['rf'],
  description: 'Roll dice for an NPC or monster',
  usage: '/rollfor <name> <formula>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const match = args.match(/^(\S+)\s+(.+)$/s)
    if (!match) {
      ctx.addSystemMessage('Usage: /rollfor <name> <formula>')
      return
    }
    const [, name, formula] = match
    const trimmedFormula = formula.trim()

    // Parse and roll the dice formula
    const diceMatch = trimmedFormula.match(/^(\d+)?d(\d+)([+-]\d+)?$/)
    if (!diceMatch) {
      ctx.addSystemMessage(`Invalid dice formula: ${trimmedFormula}. Use format like 1d20+5, 2d6, d8-1`)
      return
    }

    const count = parseInt(diceMatch[1] || '1', 10)
    const sides = parseInt(diceMatch[2], 10)
    const modifier = parseInt(diceMatch[3] || '0', 10)

    const rolls: number[] = []
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1)
    }
    const sum = rolls.reduce((a, b) => a + b, 0)
    const total = sum + modifier

    const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''
    const rollDetail = count > 1 ? ` [${rolls.join(', ')}]` : ''

    ctx.broadcastSystemMessage(`🎲 ${name} rolled ${count}d${sides}${modStr}:${rollDetail} = ${total}`)
  }
}

const grouprollCommand: ChatCommand = {
  name: 'grouproll',
  aliases: ['gr'],
  description: 'Request a group ability check',
  usage: '/grouproll <type> <DC> [secret]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      ctx.addSystemMessage('Usage: /grouproll <type> <DC> [secret]')
      return
    }

    const type = parts[0].toLowerCase() as 'ability' | 'save' | 'skill'
    const dc = parseInt(parts[1], 10)
    const isSecret = parts[2]?.toLowerCase() === 'secret'

    if (Number.isNaN(dc) || dc < 1) {
      ctx.addSystemMessage('DC must be a positive number.')
      return
    }

    const gameState = useGameStore.getState()
    gameState.setPendingGroupRoll({
      id: crypto.randomUUID(),
      type,
      dc,
      scope: 'all',
      isSecret
    })

    if (isSecret) {
      ctx.addSystemMessage(`🎲 Secret group ${type} check requested (DC ${dc}).`)
    } else {
      ctx.broadcastSystemMessage(`🎲 Group ${type} check! Everyone roll ${type} (DC ${dc}).`)
    }
  }
}

const effectCommand: ChatCommand = {
  name: 'effect',
  aliases: ['fx'],
  description: 'Add or remove a custom effect on a token',
  usage: '/effect <add|remove> <target> <effect-name> [duration]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 3) {
      ctx.addSystemMessage('Usage: /effect <add|remove> <target> <effect-name> [duration]')
      return
    }

    const action = parts[0].toLowerCase()
    const target = parts[1]
    const effectName = parts[2]
    const duration = parts[3] ? parseInt(parts[3], 10) : undefined

    if (action !== 'add' && action !== 'remove') {
      ctx.addSystemMessage('First argument must be "add" or "remove".')
      return
    }

    const token = findTokenByName(target)

    if (!token) {
      ctx.addSystemMessage(`Token not found: ${target}`)
      return
    }

    const gameState = useGameStore.getState()

    if (action === 'add') {
      gameState.addCondition({
        id: crypto.randomUUID(),
        entityId: token.id,
        entityName: token.label,
        condition: effectName,
        duration: duration ?? 'permanent',
        source: 'command',
        appliedRound: gameState.round
      })
      const durationStr = duration ? ` for ${duration} rounds` : ''
      ctx.broadcastSystemMessage(`✨ ${effectName} applied to ${token.label}${durationStr}.`)
    } else {
      // Find the condition on this token to remove it
      const condition = gameState.conditions.find(
        (c) => c.entityId === token.id && c.condition.toLowerCase() === effectName.toLowerCase()
      )
      if (condition) {
        gameState.removeCondition(condition.id)
      }
      ctx.broadcastSystemMessage(`✨ ${effectName} removed from ${token.label}.`)
    }
  }
}

const mobCommand: ChatCommand = {
  name: 'mob',
  aliases: [],
  description: 'Open mob calculator',
  usage: '/mob',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('mobCalculator')
  }
}

const chaseCommand: ChatCommand = {
  name: 'chase',
  aliases: [],
  description: 'Start a chase encounter',
  usage: '/chase',
  dmOnly: true,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('chaseTracker')
  }
}

const flankingCommand: ChatCommand = {
  name: 'flanking',
  aliases: ['flank'],
  description: 'Toggle DMG optional flanking rule',
  usage: '/flanking [on|off]',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const gs = useGameStore.getState()
    const trimmed = args.trim().toLowerCase()
    let enabled: boolean
    if (trimmed === 'on') enabled = true
    else if (trimmed === 'off') enabled = false
    else enabled = !gs.flankingEnabled
    gs.setFlankingEnabled(enabled)
    return { type: 'broadcast', content: `Flanking (DMG optional rule): **${enabled ? 'Enabled' : 'Disabled'}**` }
  }
}

const groupInitCommand: ChatCommand = {
  name: 'groupinit',
  aliases: ['groupinitiative'],
  description: 'Toggle DMG optional group initiative rule',
  usage: '/groupinit [on|off]',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const gs = useGameStore.getState()
    const trimmed = args.trim().toLowerCase()
    let enabled: boolean
    if (trimmed === 'on') enabled = true
    else if (trimmed === 'off') enabled = false
    else enabled = !gs.groupInitiativeEnabled
    gs.setGroupInitiativeEnabled(enabled)
    return {
      type: 'broadcast',
      content: `Group Initiative (DMG optional rule): **${enabled ? 'Enabled' : 'Disabled'}** — identical monster types share one roll.`
    }
  }
}

const diagonalCommand: ChatCommand = {
  name: 'diagonal',
  aliases: ['diag'],
  description: 'Toggle DMG 2024 alternating 5/10/5/10 diagonal movement rule',
  usage: '/diagonal [on|off]',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const gs = useGameStore.getState()
    const trimmed = args.trim().toLowerCase()
    let rule: 'standard' | 'alternate'
    if (trimmed === 'on' || trimmed === 'alternate') rule = 'alternate'
    else if (trimmed === 'off' || trimmed === 'standard') rule = 'standard'
    else rule = gs.diagonalRule === 'alternate' ? 'standard' : 'alternate'
    gs.setDiagonalRule(rule)
    return {
      type: 'broadcast',
      content: `Diagonal Movement (DMG 2024 optional rule): **${rule === 'alternate' ? '5/10/5/10 Enabled' : 'Standard (5ft)'}**`
    }
  }
}

export const commands: ChatCommand[] = [
  initiativeCommand,
  timerCommand,
  rollforCommand,
  grouprollCommand,
  effectCommand,
  mobCommand,
  chaseCommand,
  flankingCommand,
  groupInitCommand,
  diagonalCommand
]
