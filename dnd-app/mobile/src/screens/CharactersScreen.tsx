import { useCallback, useState, type ReactElement } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { ActivityIndicator, FlatList, Text, View } from 'react-native'
import * as store from '@app/storage/storage-adapter'
import type { ScreenProps } from '@app/navigation/types'

interface CharacterRow {
  id: string
  name?: string
  className?: string
  level?: number
}

export default function CharactersScreen(_props: ScreenProps<'Characters'>): ReactElement {
  const [characters, setCharacters] = useState<CharacterRow[] | null>(null)

  // Reload on focus so a character created/edited in a session WebView shows up.
  useFocusEffect(
    useCallback(() => {
      let active = true
      store
        .list('characters')
        .then((rows) => {
          if (active) setCharacters(rows as unknown as CharacterRow[])
        })
        .catch(() => active && setCharacters([]))
      return () => {
        active = false
      }
    }, [])
  )

  if (characters === null) {
    return (
      <View className="flex-1 bg-base items-center justify-center">
        <ActivityIndicator color="#fbbf24" />
      </View>
    )
  }

  if (characters.length === 0) {
    return (
      <View className="flex-1 bg-base items-center justify-center px-8">
        <Text className="text-fg text-lg font-semibold mb-2">No characters yet</Text>
        <Text className="text-muted text-center">
          Create one with the 5e builder during a game session, or import an existing character. Your characters sync to
          this device's local store.
        </Text>
      </View>
    )
  }

  return (
    <FlatList
      className="flex-1 bg-base"
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={characters}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <View className="rounded-lg border border-border bg-surface/60 p-4">
          <Text className="text-fg text-lg font-semibold">{item.name ?? 'Unnamed'}</Text>
          <Text className="text-muted text-sm mt-1">
            {[item.className, item.level ? `Level ${item.level}` : null].filter(Boolean).join(' · ') || '5e character'}
          </Text>
        </View>
      )}
    />
  )
}
