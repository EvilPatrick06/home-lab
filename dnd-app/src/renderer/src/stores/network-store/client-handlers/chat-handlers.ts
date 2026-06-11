import type {
  AnnouncementPayload,
  DiceResultPayload,
  DiceRevealPayload,
  DiceRoll3dPayload,
  DiceRollHiddenPayload,
  HaggleResponsePayload,
  LootAwardPayload,
  MacroPushPayload,
  MapPingPayload,
  NarrationPayload,
  NetworkMessage,
  TimerStartPayload,
  TimeSharePayload,
  WhisperPayload,
  WhisperPlayerPayload,
  XpAwardPayload
} from '../../../network'
import { createPing } from '../../../services/map/map-utils'
import { useGameStore } from '../../use-game-store'
import { useLobbyStore } from '../../use-lobby-store'
import { useMacroStore } from '../../use-macro-store'

/** Chat / system-message handlers (host -> client). Each is self-contained:
 *  it reads only its message and appends a chat or system line. */

export function handleWhisper(message: NetworkMessage): void {
  const payload = message.payload as WhisperPayload
  useLobbyStore.getState().addChatMessage({
    id: `whisper-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: `${message.senderName} (Whisper)`,
    content: payload.message,
    timestamp: Date.now(),
    isSystem: false
  })
}

export function handlePushMacros(message: NetworkMessage): void {
  const payload = message.payload as MacroPushPayload
  useMacroStore.getState().importMacros(payload.macros)
  useLobbyStore.getState().addChatMessage({
    id: `sys-macros-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `DM shared ${payload.macros.length} macro${payload.macros.length === 1 ? '' : 's'} with the party!`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleLootAward(message: NetworkMessage): void {
  const payload = message.payload as LootAwardPayload
  const parts: string[] = []
  if (payload.items.length > 0) {
    parts.push(payload.items.map((i) => `${i.quantity}x ${i.name}`).join(', '))
  }
  if (payload.currency) {
    const currParts: string[] = []
    if (payload.currency.pp) currParts.push(`${payload.currency.pp} pp`)
    if (payload.currency.gp) currParts.push(`${payload.currency.gp} gp`)
    if (payload.currency.sp) currParts.push(`${payload.currency.sp} sp`)
    if (payload.currency.cp) currParts.push(`${payload.currency.cp} cp`)
    if (currParts.length > 0) parts.push(currParts.join(', '))
  }
  useLobbyStore.getState().addChatMessage({
    id: `sys-loot-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `🎁 Loot awarded: ${parts.join(' + ') || 'nothing'}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleXpAward(message: NetworkMessage): void {
  const payload = message.payload as XpAwardPayload
  const reason = payload.reason ? ` — ${payload.reason}` : ''
  useLobbyStore.getState().addChatMessage({
    id: `sys-xp-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `⭐ ${payload.xp} XP awarded${reason}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleTimeShare(message: NetworkMessage): void {
  const payload = message.payload as TimeSharePayload
  useLobbyStore.getState().addChatMessage({
    id: `sys-time-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `🕐 Current time: ${payload.formattedTime}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleTimerStart(message: NetworkMessage): void {
  const payload = message.payload as TimerStartPayload
  useLobbyStore.getState().addChatMessage({
    id: `sys-timer-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `⏱️ Timer started: ${payload.seconds}s for ${payload.targetName}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleTimerStop(): void {
  useLobbyStore.getState().addChatMessage({
    id: `sys-timer-stop-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: '⏱️ Timer stopped',
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleNarration(message: NetworkMessage): void {
  const payload = message.payload as NarrationPayload
  useLobbyStore.getState().addChatMessage({
    id: `narration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: payload.style === 'dramatic' ? '🎭 Narrator' : 'DM',
    content: payload.text,
    timestamp: Date.now(),
    isSystem: payload.style === 'dramatic'
  })
}

export function handleWhisperPlayer(message: NetworkMessage): void {
  const payload = message.payload as WhisperPlayerPayload
  useLobbyStore.getState().addChatMessage({
    id: `whisper-dm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: `${message.senderName} (DM Whisper)`,
    content: payload.message,
    timestamp: Date.now(),
    isSystem: false
  })
}

export function handleHaggleResponse(message: NetworkMessage): void {
  const payload = message.payload as HaggleResponsePayload
  const result = payload.accepted
    ? `Haggle successful! ${payload.discountPercent}% discount applied.`
    : 'The shopkeeper rejected your offer.'
  useLobbyStore.getState().addChatMessage({
    id: `sys-haggle-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `🏪 ${result}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleGameStart(): void {
  useLobbyStore.getState().addChatMessage({
    id: `sys-game-start-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: '🎮 The game has started!',
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleDiceResult(message: NetworkMessage): void {
  const payload = message.payload as DiceResultPayload
  const critText = payload.isCritical ? ' 💥 Critical!' : payload.isFumble ? ' 😰 Fumble!' : ''
  useLobbyStore.getState().addChatMessage({
    id: `dice-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: payload.rollerName,
    content: `🎲 ${payload.formula} = ${payload.total}${payload.reason ? ` (${payload.reason})` : ''}${critText}`,
    timestamp: Date.now(),
    isSystem: false,
    isDiceRoll: true,
    diceResult: { formula: payload.formula, total: payload.total, rolls: payload.rolls }
  })
}

export function handleDiceReveal(message: NetworkMessage): void {
  const payload = message.payload as DiceRevealPayload
  useLobbyStore.getState().addChatMessage({
    id: `dice-reveal-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: payload.rollerName,
    content: `🎲 Revealed: ${payload.formula} = ${payload.total}${payload.label ? ` (${payload.label})` : ''}`,
    timestamp: Date.now(),
    isSystem: false,
    isDiceRoll: true,
    diceResult: { formula: payload.formula, total: payload.total, rolls: payload.rolls }
  })
}

export function handleDiceRollHidden(message: NetworkMessage): void {
  const payload = message.payload as DiceRollHiddenPayload
  useLobbyStore.getState().addChatMessage({
    id: `dice-hidden-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: payload.rollerName,
    content: `🎲 ${payload.rollerName} made a hidden roll...`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleDiceRoll3d(message: NetworkMessage): void {
  const payload = message.payload as DiceRoll3dPayload
  if (!payload.isSecret) {
    useLobbyStore.getState().addChatMessage({
      id: `dice-3d-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: message.senderId,
      senderName: payload.rollerName,
      content: `🎲 ${payload.formula} = ${payload.total}${payload.reason ? ` (${payload.reason})` : ''}`,
      timestamp: Date.now(),
      isSystem: false,
      isDiceRoll: true,
      diceResult: { formula: payload.formula, total: payload.total, rolls: payload.results }
    })
  }
}

export function handleMapPing(message: NetworkMessage): void {
  const payload = message.payload as MapPingPayload
  useLobbyStore.getState().addChatMessage({
    id: `sys-ping-${Date.now()}`,
    senderId: message.senderId,
    senderName: 'System',
    content: `📍 ${message.senderName} pinged the map at (${payload.gridX}, ${payload.gridY})${payload.label ? `: ${payload.label}` : ''}`,
    timestamp: Date.now(),
    isSystem: true
  })

  // PHASE-09 09G — render the animated ping on our own active map, converting the
  // sender's grid coords with the local map's cell size. Chat line only if we have
  // no matching active map loaded.
  const game = useGameStore.getState()
  const activeMap = game.maps.find((m) => m.id === game.activeMapId)
  if (!activeMap) return
  const cellSize = activeMap.grid.cellSize
  createPing(payload.gridX * cellSize + cellSize / 2, payload.gridY * cellSize + cellSize / 2, message.senderName)
}

export function handleConcentrationCheck(message: NetworkMessage): void {
  const payload = message.payload as { damage?: number }
  useLobbyStore.getState().addChatMessage({
    id: `sys-conc-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `⚡ Concentration check required!${payload.damage ? ` DC ${Math.max(10, Math.floor(payload.damage / 2))}` : ''}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleOpportunityAttack(message: NetworkMessage): void {
  const payload = message.payload as { targetName?: string; attackerName?: string }
  useLobbyStore.getState().addChatMessage({
    id: `sys-opp-${Date.now()}`,
    senderId: 'system',
    senderName: 'System',
    content: `⚔️ Opportunity attack available!${payload.targetName ? ` Target: ${payload.targetName}` : ''}`,
    timestamp: Date.now(),
    isSystem: true
  })
}

export function handleAnnouncement(message: NetworkMessage): void {
  const payload = message.payload as AnnouncementPayload
  useLobbyStore.getState().addChatMessage({
    id: `announce-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: message.senderId,
    senderName: 'Announcement',
    content: `📢 ${payload.message}`,
    timestamp: Date.now(),
    isSystem: true
  })
}
