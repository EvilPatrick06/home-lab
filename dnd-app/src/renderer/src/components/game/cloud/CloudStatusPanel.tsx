import { Cloud } from 'lucide-react'
import type { PeerInfo } from '../../../network'

/**
 * Phase 32f — DM-only status panel for a Pi-relayed (cloud) game.
 *
 * Surfaces that the session runs over the always-on Pi relay rather than the
 * WebRTC mesh, plus the live connected-peer list. Pure-props (the parent reads
 * the network store) so it's trivially testable; renders nothing for a P2P game
 * or a non-DM viewer.
 */

export interface CloudStatusPanelProps {
  /** Current transport. Anything other than `'cloud'` → the panel hides. */
  connectionMode: 'p2p' | 'cloud'
  /** DM gate — non-DM viewers don't see the relay panel. */
  isDM: boolean
  /** Whether the relay socket is connected. */
  connected: boolean
  /** Peers currently joined to the relay room (excludes the local host). */
  peers: PeerInfo[]
}

export default function CloudStatusPanel({
  connectionMode,
  isDM,
  connected,
  peers
}: CloudStatusPanelProps): JSX.Element | null {
  if (connectionMode !== 'cloud' || !isDM) return null

  return (
    <section aria-label="Cloud relay status" className="rounded-lg border border-sky-800 bg-sky-950/30 p-3 text-sm">
      <header className="flex items-center gap-2 mb-2">
        <Cloud className="w-4 h-4 text-sky-400" aria-hidden="true" />
        <span className="font-semibold text-sky-200">Pi Cloud Relay</span>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-xs ${
            connected ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
            aria-hidden="true"
          />
          {connected ? 'Connected' : 'Connecting…'}
        </span>
      </header>
      <p className="text-gray-400 text-xs mb-2">
        Players reach this game through the always-on BMO Pi — no NAT or firewall setup.
      </p>
      {peers.length === 0 ? (
        <p className="text-gray-500 text-xs italic">No players connected yet.</p>
      ) : (
        <ul className="space-y-1">
          {peers.map((p) => (
            <li key={p.peerId} className="flex items-center gap-2">
              <span className="text-gray-200">{p.displayName || 'Player'}</span>
              <span className="text-gray-500 text-xs">({p.role})</span>
              {typeof p.latencyMs === 'number' && (
                <span className="ml-auto text-gray-500 text-xs">{p.latencyMs} ms</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
