import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { useSignalingStatusStore } from '../../stores/use-signaling-status-store'
import NetworkSettingsModal from '../game/modals/utility/NetworkSettingsModal'

/**
 * Phase R3b — compact reachability badge for the Pi's WebRTC signaling server
 * (bmo-peerjs, host:9000/myapp), which the P2P transport uses to connect
 * players. Fed by the main-process probe via `useSignalingStatusStore`. Shows a
 * muted "not applicable" state off-LAN (the tunnel default doesn't expose :9000)
 * rather than a misleading "down".
 *
 * Also mounts the TURN/relay-server settings: off-LAN, direct P2P falls back to
 * the Pi cloud relay, but a user behind symmetric NAT who wants serverless P2P
 * can add their own TURN here (persisted + applied on launch via App.tsx).
 */
export default function MultiplayerStatusSection(): JSX.Element {
  const { t } = useT()
  const reachable = useSignalingStatusStore((s) => s.reachable)
  const host = useSignalingStatusStore((s) => s.host)
  const checkedAt = useSignalingStatusStore((s) => s.checkedAt)
  const [showNetwork, setShowNetwork] = useState(false)

  // Trigger a fresh probe when the badge mounts so it doesn't sit on
  // "Checking…" waiting for the periodic (30s) probe. Result arrives via the
  // module-level BMO_SIGNALING_STATUS subscription in the store.
  useEffect(() => {
    window.api?.lan?.probeSignaling?.()
  }, [])

  let dotClass = 'bg-gray-500'
  let text: string
  if (checkedAt === null) {
    text = t('pages.settingsPage.signalingChecking')
  } else if (reachable === null) {
    text = t('pages.settingsPage.signalingNotApplicable')
  } else if (reachable) {
    dotClass = 'bg-emerald-500'
    text = t('pages.settingsPage.signalingReachable', { host: host || 'the cloud' })
  } else {
    dotClass = 'bg-red-500'
    text = t('pages.settingsPage.signalingUnreachable', { host: host || 'the cloud' })
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
          <span className="text-sm text-gray-300">{t('pages.settingsPage.signalingTitle')}</span>
        </div>
        <p className="text-xs text-gray-500">{text}</p>
      </div>
      <button
        onClick={() => setShowNetwork(true)}
        className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
      >
        {t('pages.settingsPage.configureTurn')}
      </button>
      {showNetwork && <NetworkSettingsModal onClose={() => setShowNetwork(false)} />}
    </div>
  )
}
