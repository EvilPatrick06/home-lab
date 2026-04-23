import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'

export default function LairActionPrompt(): JSX.Element | null {
  const pendingLairAction = useGameStore((s) => s.pendingLairAction)
  const setPendingLairAction = useGameStore((s) => s.setPendingLairAction)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  if (!pendingLairAction) return null

  const handleSelect = (action: { name: string; description: string }): void => {
    addChatMessage({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: 'System',
      content: `Lair Action: ${action.name} \u2014 ${action.description}`,
      timestamp: Date.now(),
      isSystem: true
    })
    setPendingLairAction(null)
  }

  const handleSkip = (): void => {
    setPendingLairAction(null)
  }

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 border border-amber-500/60 rounded-xl shadow-2xl p-4 w-96 max-w-[90vw]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-amber-400">Lair Action — {pendingLairAction.creatureName}</h3>
        <button onClick={handleSkip} className="text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer">
          Skip
        </button>
      </div>
      <div className="space-y-1.5">
        {pendingLairAction.lairActions.map((action, i) => (
          <button
            key={i}
            onClick={() => handleSelect(action)}
            className="w-full text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer group"
            title={action.description}
          >
            <div className="text-[11px] font-semibold text-gray-200 group-hover:text-amber-300">{action.name}</div>
            <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{action.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
