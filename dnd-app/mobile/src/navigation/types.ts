import type { NativeStackScreenProps } from '@react-navigation/native-stack'

/**
 * Root navigation graph. Out-of-session flows are native screens; an active
 * game session is the `GameSession` screen, which hosts the embedded in-game
 * WebView (map + dice + PeerJS) wired to the bridge.
 */
export type RootStackParamList = {
  MainMenu: undefined
  Characters: undefined
  Library: undefined
  JoinGame: undefined
  Settings: undefined
  GameSession: { campaignId: string; isDM: boolean }
}

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>
