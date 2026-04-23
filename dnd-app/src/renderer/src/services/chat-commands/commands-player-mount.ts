import type { ChatCommand } from './types'

const mountCommand: ChatCommand = {
  name: 'mount',
  aliases: ['ride'],
  description: 'Open the mount/dismount modal',
  usage: '/mount',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    ctx.openModal?.('mount')
  }
}

const dismountCommand: ChatCommand = {
  name: 'dismount',
  aliases: [],
  description: 'Open the mount modal to dismount',
  usage: '/dismount',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    ctx.openModal?.('mount')
  }
}

export const commands: ChatCommand[] = [mountCommand, dismountCommand]
