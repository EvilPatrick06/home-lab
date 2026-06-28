import { useState, type ReactElement } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import type { ScreenProps } from '@app/navigation/types'

export default function JoinGameScreen({ navigation }: ScreenProps<'JoinGame'>): ReactElement {
  const [code, setCode] = useState('')
  const trimmed = code.trim()

  return (
    <View className="flex-1 bg-base px-6 pt-8">
      <Text className="text-fg text-lg font-semibold mb-2">Enter invite code</Text>
      <Text className="text-muted text-sm mb-4">
        Ask the DM for the table's invite code. Joining opens the live game session, which runs the map, dice, and
        peer-to-peer connection in the in-game view.
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. 4821"
        placeholderTextColor="#6b7280"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-fg text-lg"
      />
      <Pressable
        disabled={trimmed.length === 0}
        onPress={() => navigation.navigate('GameSession', { campaignId: `join:${trimmed}`, isDM: false })}
        className={`mt-5 rounded-lg px-5 py-3 items-center ${trimmed.length === 0 ? 'bg-surface-2 opacity-50' : 'bg-accent-strong active:opacity-80'}`}
      >
        <Text className="text-white font-semibold text-base">Join Game</Text>
      </Pressable>
    </View>
  )
}
