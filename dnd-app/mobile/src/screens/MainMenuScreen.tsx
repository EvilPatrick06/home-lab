import type { ReactElement } from 'react'
import Constants from 'expo-constants'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ScreenProps } from '@app/navigation/types'

interface MenuItem {
  label: string
  description: string
  to: keyof typeof routes
}

const routes = {
  Characters: 'Characters',
  Library: 'Library',
  JoinGame: 'JoinGame',
  Settings: 'Settings'
} as const

const items: MenuItem[] = [
  { label: 'Characters', description: 'Create and manage your 5e characters', to: 'Characters' },
  { label: 'Library', description: 'Browse monsters, spells, items, and rules', to: 'Library' },
  { label: 'Join Game', description: 'Enter an invite code to join a table', to: 'JoinGame' },
  { label: 'Settings', description: 'Profile, audio, accessibility, account', to: 'Settings' }
]

export default function MainMenuScreen({ navigation }: ScreenProps<'MainMenu'>): ReactElement {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      className="flex-1 bg-base"
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
    >
      <View className="items-center mb-8">
        <Text className="text-4xl font-bold tracking-wider text-accent mb-1">Dungeon Table Online</Text>
        <Text className="text-muted text-base">Your pocket virtual tabletop</Text>
      </View>

      <View className="gap-3 w-full max-w-md self-center">
        {items.map((item) => (
          <Pressable
            key={item.to}
            onPress={() => navigation.navigate(routes[item.to])}
            className="active:opacity-80 rounded-lg border border-border bg-surface/60 p-5"
          >
            <Text className="text-xl font-semibold text-fg">{item.label}</Text>
            <Text className="text-sm text-muted mt-1">{item.description}</Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-center text-gray-600 text-xs mt-8">
        v{Constants.expoConfig?.version ?? 'dev'}
      </Text>
    </ScrollView>
  )
}
