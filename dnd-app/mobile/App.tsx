import './global.css'
import { StatusBar } from 'expo-status-bar'
import { useEffect, type ReactElement } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { EmbeddedWebView } from '@app/bridge/EmbeddedWebView'
import { initStorage } from '@app/storage/storage-adapter'

/**
 * The mobile app is a thin wrapper around the FULL Dungeon Table Online web app
 * (the same SPA that runs on desktop/web). It loads the entire app in a single
 * WebView so every screen matches desktop, and bridges the WebView to the native
 * on-device SQLite store. The web app owns all in-app navigation; the Android
 * hardware back button maps to WebView history (see EmbeddedWebView).
 */
export default function App(): ReactElement {
  useEffect(() => {
    // Open/create the on-device SQLite store before the WebView reads from it.
    initStorage().catch((e) => console.warn('[storage] init failed', e))
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }} edges={['top', 'bottom']}>
          <View style={{ flex: 1 }}>
            <EmbeddedWebView />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
