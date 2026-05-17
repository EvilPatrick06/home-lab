/**
 * Build Content-Security-Policy connect-src fragment for the BMO Pi base URL.
 * Must stay aligned with `getBmoBaseUrl()` in `bmo-config.ts`.
 *
 * Emits `http(s)://<host>:*` and `ws(s)://<host>:*` so any port on that host is allowed
 * (router DHCP, dev proxies, or explicit port in env).
 *
 * Includes both the resolved URL (settings/env/default) and any
 * mDNS-discovered Pi URL so a Windows user without Bonjour Print
 * Services can fetch the registry without manual Settings config.
 */
import { BMO_PI_URL_DEFAULT, getBmoBaseUrl, getDiscoveredBmoUrl } from './bmo-config'

/** Host part suitable for CSP (IPv6 literals need brackets). */
function cspHostPart(hostname: string): string {
  if (hostname.startsWith('[')) {
    return hostname
  }
  if (hostname.includes(':')) {
    return `[${hostname}]`
  }
  return hostname
}

/** @internal exported for unit tests */
export function bmoCspConnectFragmentForBaseUrl(baseUrl: string | undefined): string {
  const base = baseUrl || BMO_PI_URL_DEFAULT
  try {
    const u = new URL(base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return ''
    }
    const host = cspHostPart(u.hostname)
    if (u.protocol === 'https:') {
      return ` wss://${host}:* https://${host}:*`
    }
    return ` ws://${host}:* http://${host}:*`
  } catch {
    return ''
  }
}

export function bmoCspConnectFragment(): string {
  const primary = bmoCspConnectFragmentForBaseUrl(getBmoBaseUrl())
  const discovered = getDiscoveredBmoUrl()
  if (!discovered) return primary
  const extra = bmoCspConnectFragmentForBaseUrl(discovered)
  if (!extra || extra === primary) return primary
  return `${primary}${extra}`
}
