import type { ReactElement } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { EmbeddedWebView } from '@app/bridge/EmbeddedWebView'
import type { ScreenProps } from '@app/navigation/types'

/**
 * The 5e content library. It's data-heavy (~3k JSON files) and already fully
 * built in the renderer, so phase 1 hosts the library route in the embedded
 * WebView (wired to the same bridge) rather than re-implementing it natively.
 * Phase 2 can lift the most-used browse flows into native screens.
 */
export default function LibraryScreen(_props: ScreenProps<'Library'>): ReactElement {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }} edges={['bottom']}>
      <View style={{ flex: 1 }}>
        <EmbeddedWebView route="library" />
      </View>
    </SafeAreaView>
  )
}
