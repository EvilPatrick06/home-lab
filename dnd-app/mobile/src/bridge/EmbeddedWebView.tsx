import { useEffect, useImperativeHandle, useRef, useState, forwardRef, type ReactElement } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { BridgeEndpoint } from '@shared/bridge'
import { resolveEmbedEntry } from '@app/embed/embed-loader'
import { createNativeBridge } from './native-bridge'

const BOOTSTRAP = `
(function () {
  if (!window.__DTO_BRIDGE_RECEIVE__) {
    window.__DTO_BRIDGE_QUEUE__ = window.__DTO_BRIDGE_QUEUE__ || [];
    window.__DTO_BRIDGE_RECEIVE__ = function (f) { window.__DTO_BRIDGE_QUEUE__.push(f); };
  }
  window.__DTO_NATIVE__ = true;
  true;
})();
`

export interface EmbeddedWebViewHandle {
  endpoint: BridgeEndpoint | null
}

interface Props {
  route?: string
  onBridgeReady?: (endpoint: BridgeEndpoint) => void
}

export const EmbeddedWebView = forwardRef<EmbeddedWebViewHandle, Props>(function EmbeddedWebView(
  { route, onBridgeReady },
  ref
): ReactElement {
  const webRef = useRef<WebView>(null)
  const bridgeRef = useRef<ReturnType<typeof createNativeBridge> | null>(null)
  const [uri, setUri] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({ endpoint: bridgeRef.current?.endpoint ?? null }), [])

  useEffect(() => {
    let cancelled = false
    resolveEmbedEntry(route).then((u) => {
      if (!cancelled) setUri(u)
    })
    return () => {
      cancelled = true
    }
  }, [route])

  useEffect(() => {
    const bridge = createNativeBridge((data) => {
      webRef.current?.injectJavaScript(`window.__DTO_BRIDGE_RECEIVE__(${JSON.stringify(data)}); true;`)
    })
    bridgeRef.current = bridge
    onBridgeReady?.(bridge.endpoint)
    return () => bridge.dispose()
  }, [onBridgeReady])

  const onMessage = (e: WebViewMessageEvent): void => {
    bridgeRef.current?.receive(e.nativeEvent.data)
  }

  if (!uri) {
    return (
      <View className="flex-1 items-center justify-center bg-base">
        <ActivityIndicator color="#fbbf24" size="large" />
      </View>
    )
  }

  return (
    <WebView
      ref={webRef}
      source={{ uri }}
      originWhitelist={['*']}
      onMessage={onMessage}
      injectedJavaScriptBeforeContentLoaded={BOOTSTRAP}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      allowingReadAccessToURL={uri.startsWith('file://') ? uri.split('#')[0]!.replace(/index\.html$/, '') : undefined}
      startInLoadingState
      renderLoading={() => (
        <View className="absolute inset-0 items-center justify-center bg-base">
          <ActivityIndicator color="#fbbf24" size="large" />
        </View>
      )}
      style={{ flex: 1, backgroundColor: '#030712' }}
    />
  )
})
