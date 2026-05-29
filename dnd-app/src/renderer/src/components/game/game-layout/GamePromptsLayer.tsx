import type { MessageType } from '../../../network'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import type { Character } from '../../../types/character'
import {
  type ConcCheckPromptState,
  ConcentrationCheckPrompt,
  type OaPromptState,
  OpportunityAttackPrompt,
  StabilizeCheckPrompt,
  type StabilizePromptState
} from '../overlays/GamePrompts'
import {
  type CounterspellPromptState,
  CounterspellReactionPrompt,
  type ShieldPromptState,
  ShieldReactionPrompt
} from '../overlays/ReactionPrompts'

interface GamePromptsLayerProps {
  oaPrompt: OaPromptState | null
  setOaPrompt: (v: OaPromptState | null) => void
  concCheckPrompt: ConcCheckPromptState | null
  setConcCheckPrompt: (v: ConcCheckPromptState | null) => void
  stabilizePrompt: StabilizePromptState | null
  setStabilizePrompt: (v: StabilizePromptState | null) => void
  shieldPrompt: ShieldPromptState | null
  setShieldPrompt: (v: ShieldPromptState | null) => void
  counterspellPrompt: CounterspellPromptState | null
  setCounterspellPrompt: (v: CounterspellPromptState | null) => void
  character: Character | null
  handleConcentrationLost: (casterId: string) => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
}

/**
 * Reaction / combat prompts cluster (OA, concentration, stabilize, shield,
 * counterspell). Extracted verbatim from GameLayout — each prompt still renders
 * only when its state is non-null; props are passed down unchanged.
 */
export default function GamePromptsLayer({
  oaPrompt,
  setOaPrompt,
  concCheckPrompt,
  setConcCheckPrompt,
  stabilizePrompt,
  setStabilizePrompt,
  shieldPrompt,
  setShieldPrompt,
  counterspellPrompt,
  setCounterspellPrompt,
  character,
  handleConcentrationLost,
  addChatMessage,
  sendMessage
}: GamePromptsLayerProps): JSX.Element {
  return (
    <>
      {oaPrompt && (
        <OpportunityAttackPrompt
          prompt={oaPrompt}
          onDismiss={() => setOaPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {concCheckPrompt && (
        <ConcentrationCheckPrompt
          prompt={concCheckPrompt}
          onDismiss={() => setConcCheckPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
          onConcentrationLost={handleConcentrationLost}
        />
      )}
      {stabilizePrompt && (
        <StabilizeCheckPrompt
          prompt={stabilizePrompt}
          character={character}
          onDismiss={() => setStabilizePrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {shieldPrompt && (
        <ShieldReactionPrompt
          prompt={shieldPrompt}
          onDismiss={() => setShieldPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {counterspellPrompt && (
        <CounterspellReactionPrompt
          prompt={counterspellPrompt}
          onDismiss={() => setCounterspellPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
    </>
  )
}
