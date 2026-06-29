import type { ScreenProps } from '@app/navigation/types'
import * as store from '@app/storage/storage-adapter'
import { type ReactElement, useEffect, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'

interface AppSettings {
  userProfile?: { displayName?: string }
  reduceMotion?: boolean
  [key: string]: unknown
}

export default function SettingsScreen(_props: ScreenProps<'Settings'>): ReactElement {
  const [settings, setSettings] = useState<AppSettings>({})
  const [displayName, setDisplayName] = useState('')
  const [reduceMotion, setReduceMotion] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    store.loadSettings().then((s) => {
      const typed = s as AppSettings
      setSettings(typed)
      setDisplayName(typed.userProfile?.displayName ?? '')
      setReduceMotion(typed.reduceMotion === true)
    })
  }, [])

  const save = async (): Promise<void> => {
    const next: AppSettings = {
      ...settings,
      userProfile: { ...(settings.userProfile ?? {}), displayName: displayName.trim() },
      reduceMotion
    }
    await store.saveSettings(next)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <ScrollView className="flex-1 bg-base" contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View>
        <Text className="text-muted text-xs uppercase tracking-wider mb-2">Profile</Text>
        <View className="rounded-lg border border-border bg-surface/60 p-4">
          <Text className="text-fg mb-2">Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your table name"
            placeholderTextColor="#6b7280"
            className="rounded border border-border bg-surface px-3 py-2 text-fg"
          />
        </View>
      </View>

      <View>
        <Text className="text-muted text-xs uppercase tracking-wider mb-2">Accessibility</Text>
        <View className="rounded-lg border border-border bg-surface/60 p-4 flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-fg">Reduce motion</Text>
            <Text className="text-muted text-sm mt-1">Skip 3D dice physics and large animations</Text>
          </View>
          <Switch value={reduceMotion} onValueChange={setReduceMotion} />
        </View>
      </View>

      <Pressable onPress={save} className="rounded-lg bg-accent-strong active:opacity-80 px-5 py-3 items-center">
        <Text className="text-white font-semibold">{saved ? 'Saved' : 'Save settings'}</Text>
      </Pressable>

      <Text className="text-gray-600 text-xs text-center mt-6 leading-5">
        Dungeon Table Online is unofficial Fan Content and is not affiliated with, endorsed, or sponsored by Wizards of
        the Coast. Dungeons &amp; Dragons and D&amp;D are trademarks of Wizards of the Coast LLC. This work includes
        material from the System Reference Document 5.2 (SRD 5.2) by Wizards of the Coast LLC, licensed under the
        Creative Commons Attribution 4.0 International License, available at
        https://creativecommons.org/licenses/by/4.0/legalcode . Updates, local AI (Ollama), and LAN discovery are
        desktop-only and hidden on mobile.
      </Text>
    </ScrollView>
  )
}
