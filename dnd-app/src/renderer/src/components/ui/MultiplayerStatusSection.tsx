import { useT } from '../../i18n'
import { useSignalingStatusStore } from '../../stores/use-signaling-status-store'

/**
 * Phase R3b — compact reachability badge for the Pi's WebRTC signaling server
 * (bmo-peerjs, host:9000/myapp), which the P2P transport uses to connect
 * players. Fed by the main-process probe via `useSignalingStatusStore`. Shows a
 * muted "not applicable" state off-LAN (the tunnel default doesn't expose :9000)
 * rather than a misleading "down".
 */
export default function MultiplayerStatusSection(): JSX.Element {
  const { t } = useT()
  const reachable = useSignalingStatusStore((s) => s.reachable)
  const host = useSignalingStatusStore((s) => s.host)
  const checkedAt = useSignalingStatusStore((s) => s.checkedAt)

  let dotClass = 'bg-gray-500'
  let text: string
  if (checkedAt === null) {
    text = t('pages.settingsPage.signalingChecking')
  } else if (reachable === null) {
    text = t('pages.settingsPage.signalingNotApplicable')
  } else if (reachable) {
    dotClass = 'bg-emerald-500'
    text = t('pages.settingsPage.signalingReachable', { host: host || 'the Pi' })
  } else {
    dotClass = 'bg-red-500'
    text = t('pages.settingsPage.signalingUnreachable', { host: host || 'the Pi' })
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-sm text-gray-300">{t('pages.settingsPage.signalingTitle')}</span>
      </div>
      <p className="text-xs text-gray-500">{text}</p>
    </div>
  )
}
