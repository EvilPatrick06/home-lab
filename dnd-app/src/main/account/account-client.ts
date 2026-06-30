/**
 * Authenticated calls to the Pi account API from the Electron main process.
 *
 * Off-LAN these go through the Cloudflare tunnel, so they carry the CF Access
 * service-token headers (getBmoAccessHeaders) like the rest of the main-process
 * Pi calls, PLUS the per-user bearer token (the real authorization). The user id
 * is derived server-side from the bearer — never sent by the client.
 */

import type { AccountUser } from '../../shared/account-types'
import { getBmoAccessHeaders, getBmoSecretBaseUrl } from '../bmo-config'
import * as session from './account-session'

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = session.getToken()
  return {
    ...getBmoAccessHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  }
}

/** Is Discord login configured on the Pi? (drives whether to show "Sign in".) */
export async function fetchAuthStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(`${getBmoSecretBaseUrl()}/api/auth/status`, { headers: getBmoAccessHeaders() })
    if (!res.ok) return { configured: false }
    return (await res.json()) as { configured: boolean }
  } catch {
    return { configured: false }
  }
}

/**
 * Resolve the signed-in user. Returns the profile on success, `null` when the
 * token is rejected (401 — caller should clear the session), or the cached
 * profile on a transient/offline error (stay signed in offline). Assumes a
 * token is present (caller checks first).
 */
export async function fetchMe(): Promise<AccountUser | null> {
  const token = session.getToken()
  if (!token) return null
  let res: Response
  try {
    res = await fetch(`${getBmoSecretBaseUrl()}/api/account/me`, { headers: authHeaders() })
  } catch {
    return session.getUser() // offline → keep cached identity
  }
  if (res.status === 401) return null // token rejected → signed out
  if (!res.ok) return session.getUser() // transient server error → cached
  const user = (await res.json()) as AccountUser
  session.setSession(token, user) // refresh the cached profile
  return user
}

export async function postLogout(): Promise<void> {
  if (!session.getToken()) return
  try {
    await fetch(`${getBmoSecretBaseUrl()}/api/auth/logout`, { method: 'POST', headers: authHeaders() })
  } catch {
    /* best-effort; the local session is cleared regardless */
  }
}
