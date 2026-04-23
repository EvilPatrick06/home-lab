import type { Character5e } from '../../types/character-5e'

export interface CommandResult {
  handled: boolean
  error?: string
  preventBroadcast?: boolean
}

export interface CommandMessage {
  type: string
  content: string
}

export type CommandReturn = CommandResult | CommandMessage | undefined

export interface CommandContext {
  isDM: boolean
  playerName: string
  character: Character5e | null
  localPeerId: string
  addSystemMessage: (content: string) => void
  broadcastSystemMessage: (content: string) => void
  addErrorMessage: (content: string) => void
  openModal?: (modal: string) => void
  openModalWithArgs?: (modal: string, args: Record<string, unknown>) => void
}

export interface ChatCommand {
  name: string
  aliases: string[]
  description: string
  usage: string
  examples?: string[]
  category: 'player' | 'dm' | 'ai'
  dmOnly: boolean
  execute: (args: string, ctx: CommandContext) => CommandReturn | void | Promise<CommandReturn | void>
}
