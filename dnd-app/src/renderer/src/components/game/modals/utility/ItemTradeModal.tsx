import { useCallback, useEffect, useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import type { Character } from '../../../../types/character'
import { is5eCharacter } from '../../../../types/character'

interface ItemTradeModalProps {
  character: Character
  playerName: string
  onClose: () => void
}

type TradePhase = 'compose' | 'awaiting' | 'incoming'

export default function ItemTradeModal({ character, playerName, onClose }: ItemTradeModalProps): JSX.Element {
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const players = useLobbyStore((s) => s.players)
  const pendingTradeOffer = useGameStore((s) => s.pendingTradeOffer)
  const pendingTradeResult = useGameStore((s) => s.pendingTradeResult)
  const clearPendingTradeOffer = useGameStore((s) => s.clearPendingTradeOffer)
  const clearPendingTradeResult = useGameStore((s) => s.clearPendingTradeResult)

  const [phase, setPhase] = useState<TradePhase>('compose')
  const [targetPeerId, setTargetPeerId] = useState('')
  const [offeredItems, setOfferedItems] = useState<Array<{ name: string; quantity: number; description?: string }>>([])
  const [offeredGold, setOfferedGold] = useState(0)
  const [requestedItemsText, setRequestedItemsText] = useState('')
  const [requestedGold, setRequestedGold] = useState(0)
  const [sentTradeId, setSentTradeId] = useState<string | null>(null)

  // Switch to incoming phase if we get a trade offer meant for us
  useEffect(() => {
    if (pendingTradeOffer && pendingTradeOffer.toPeerId === localPeerId) {
      setPhase('incoming')
    }
  }, [pendingTradeOffer, localPeerId])

  // Get equipment list
  const equipment = is5eCharacter(character) ? (character.equipment ?? []) : []

  const otherPlayers = players.filter((p) => p.peerId !== localPeerId && !p.isHost)

  const toggleItem = useCallback((name: string, description?: string) => {
    setOfferedItems((prev) => {
      const existing = prev.find((i) => i.name === name)
      if (existing) return prev.filter((i) => i.name !== name)
      return [...prev, { name, quantity: 1, description }]
    })
  }, [])

  const updateItemQuantity = useCallback((name: string, qty: number) => {
    setOfferedItems((prev) => prev.map((i) => (i.name === name ? { ...i, quantity: Math.max(1, qty) } : i)))
  }, [])

  const handleSendTrade = useCallback(() => {
    if (!targetPeerId) return
    const tradeId = crypto.randomUUID()
    const requestedItems = requestedItemsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, quantity: 1 }))

    sendMessage('player:trade-request', {
      tradeId,
      fromPeerId: localPeerId,
      fromPlayerName: playerName,
      toPeerId: targetPeerId,
      offeredItems,
      offeredGold: offeredGold * 100, // convert gp to cp
      requestedItems,
      requestedGold: requestedGold * 100
    })
    setSentTradeId(tradeId)
    setPhase('awaiting')
  }, [targetPeerId, offeredItems, offeredGold, requestedItemsText, requestedGold, sendMessage, localPeerId, playerName])

  const handleAccept = useCallback(() => {
    if (!pendingTradeOffer) return
    sendMessage('player:trade-response', {
      tradeId: pendingTradeOffer.tradeId,
      accepted: true,
      fromPeerId: localPeerId
    })
    clearPendingTradeOffer()
    setPhase('compose')
  }, [pendingTradeOffer, sendMessage, localPeerId, clearPendingTradeOffer])

  const handleDecline = useCallback(() => {
    if (!pendingTradeOffer) return
    sendMessage('player:trade-response', {
      tradeId: pendingTradeOffer.tradeId,
      accepted: false,
      fromPeerId: localPeerId
    })
    clearPendingTradeOffer()
    setPhase('compose')
  }, [pendingTradeOffer, sendMessage, localPeerId, clearPendingTradeOffer])

  const handleCancel = useCallback(() => {
    if (sentTradeId) {
      sendMessage('player:trade-cancel', { tradeId: sentTradeId })
    }
    setSentTradeId(null)
    setPhase('compose')
  }, [sentTradeId, sendMessage])

  // Show result toast
  useEffect(() => {
    if (pendingTradeResult) {
      const timer = setTimeout(() => clearPendingTradeResult(), 5000)
      return () => clearTimeout(timer)
    }
  }, [pendingTradeResult, clearPendingTradeResult])

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">Item Trade</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Result toast */}
        {pendingTradeResult && (
          <div
            className={`mb-3 p-2 rounded-lg text-xs ${
              pendingTradeResult.accepted
                ? 'bg-green-900/40 border border-green-600/30 text-green-300'
                : 'bg-red-900/40 border border-red-600/30 text-red-300'
            }`}
          >
            {pendingTradeResult.summary}
          </div>
        )}

        {phase === 'compose' && (
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
            {/* Target player */}
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Trade With</label>
              <select
                value={targetPeerId}
                onChange={(e) => setTargetPeerId(e.target.value)}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none cursor-pointer"
              >
                <option value="">Select a player...</option>
                {otherPlayers.map((p) => (
                  <option key={p.peerId} value={p.peerId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Offered items */}
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Your Items to Offer
              </label>
              <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                {equipment.map((item) => {
                  const name = typeof item === 'string' ? item : item.name
                  const desc = typeof item === 'string' ? undefined : item.description
                  const selected = offeredItems.find((i) => i.name === name)
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 flex-1 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleItem(name, desc)}
                          className="accent-amber-500"
                        />
                        {name}
                      </label>
                      {selected && (
                        <input
                          type="number"
                          min={1}
                          value={selected.quantity}
                          onChange={(e) => updateItemQuantity(name, parseInt(e.target.value, 10) || 1)}
                          className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 text-center outline-none"
                        />
                      )}
                    </div>
                  )
                })}
                {equipment.length === 0 && <p className="text-[10px] text-gray-500">No items in inventory.</p>}
              </div>
            </div>

            {/* Offered gold */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Gold to Offer (gp)
              </label>
              <input
                type="number"
                min={0}
                value={offeredGold}
                onChange={(e) => setOfferedGold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
              />
            </div>

            {/* Requested items */}
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Items You Want (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Longsword, Health Potion"
                value={requestedItemsText}
                onChange={(e) => setRequestedItemsText(e.target.value)}
                className="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Requested gold */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Gold Requested (gp)
              </label>
              <input
                type="number"
                min={0}
                value={requestedGold}
                onChange={(e) => setRequestedGold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none"
              />
            </div>

            {/* Send */}
            <button
              onClick={handleSendTrade}
              disabled={!targetPeerId || (offeredItems.length === 0 && offeredGold === 0)}
              className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer transition-colors"
            >
              Send Trade Offer
            </button>
          </div>
        )}

        {phase === 'awaiting' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
            <div className="animate-pulse text-amber-400 text-sm">Waiting for response...</div>
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
            >
              Cancel Trade
            </button>
          </div>
        )}

        {phase === 'incoming' && pendingTradeOffer && (
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
            <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-3">
              <p className="text-xs text-amber-300 font-semibold mb-2">
                Trade offer from {pendingTradeOffer.fromPlayerName}
              </p>
              {pendingTradeOffer.offeredItems.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-gray-500 uppercase">They offer:</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {pendingTradeOffer.offeredItems.map((item) => (
                      <li key={item.name} className="text-xs text-gray-300">
                        {item.quantity}x {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pendingTradeOffer.offeredGold > 0 && (
                <p className="text-xs text-yellow-400 mb-2">+ {Math.floor(pendingTradeOffer.offeredGold / 100)} gp</p>
              )}
              {pendingTradeOffer.requestedItems.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-gray-500 uppercase">They want:</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {pendingTradeOffer.requestedItems.map((item) => (
                      <li key={item.name} className="text-xs text-gray-300">
                        {item.quantity}x {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pendingTradeOffer.requestedGold > 0 && (
                <p className="text-xs text-yellow-400">
                  They want {Math.floor(pendingTradeOffer.requestedGold / 100)} gp from you
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                className="flex-1 py-2 text-xs font-semibold rounded-lg bg-green-700 hover:bg-green-600 text-white cursor-pointer"
              >
                Accept
              </button>
              <button
                onClick={handleDecline}
                className="flex-1 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-600 text-white cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
