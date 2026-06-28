import { useCallback, useRef, type ReactElement } from 'react'
import { BackHandler, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BRIDGE_EVENT, type BridgeEndpoint } from '@shared/bridge'
import { EmbeddedWebView } from '@app/bridge/EmbeddedWebView'
import type { ScreenProps } from '@app/navigation/types'

/**
 * The live game session. The map, dice, and PeerJS run inside the embedded
 * WebView; this native screen owns the lifecycle and the bridge handoffs:
 *
 *   - On mount it points the embed at the game route for this campaign.
 *   - `ui:openCharacterSheet` from the WebView → push the native sheet (future).
 *   - `ui:sessionEnded` from the WebView → pop back to the menu.
 *   - Android back button → ask the WebView to leave the session cleanly.
 */
export default function GameSessionScreen({ navigation, route }: ScreenProps<'GameSession'>): ReactElement {
  const { campaignId } = route.params
  const endpointRef = useRef<BridgeEndpoint | null>(null)

  const onBridgeReady = useCallback(
    (endpoint: BridgeEndpoint) => {
      endpointRef.current = endpoint
      endpoint.on(BRIDGE_EVENT.sessionEnded, () => navigation.popToTop())
      endpoint.on(BRIDGE_EVENT.openCharacterSheet, (payload) => {
        // Phase 2: navigate to a native character sheet. For now the WebView
        // renders the sheet; this hook keeps the contract in place.
        console.log('[session] openCharacterSheet', payload)
      })
      // Recover any events the WebView emitted before we attached.
      endpoint.requestResync()
    },
    [navigation]
  )

  // Intercept Android back: tell the WebView to leave the session; it confirms
  // via `ui:sessionEnded`, which pops the stack.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        endpointRef.current?.emit(BRIDGE_EVENT.leaveSession, { campaignId })
        return true // we handle the back ourselves
      })
      return () => sub.remove()
    }, [campaignId])
  )

  // Strip the "join:" sentinel JoinGameScreen uses; map to an embed SPA route.
  const sessionRoute = campaignId.startsWith('join:') ? 'join' : `game/${campaignId}`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1 }}>
        <EmbeddedWebView route={sessionRoute} onBridgeReady={onBridgeReady} />
      </View>
    </SafeAreaView>
  )
}
