/**
 * Account IPC handlers (Electron main).
 *
 * The desktop app's "Sign in with Discord" runs entirely in the main process:
 * the loopback OAuth flow (account-oauth) captures the bearer token, which is
 * persisted encrypted (account-session) and used to authorize Pi account calls
 * (account-client). The renderer only sees identity + status — never the token.
 */

import type { AccountLoginResult, AccountStatus } from '../../shared/account-types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { fetchAuthStatus, fetchMe, postLogout } from '../account/account-client'
import { startLogin } from '../account/account-oauth'
import * as session from '../account/account-session'
import { logToFile } from '../log'
import { handle } from './_safe'

export function registerAccountHandlers(): void {
  handle(IPC_CHANNELS.ACCOUNT_GET_STATUS, async (): Promise<AccountStatus> => {
    const { configured } = await fetchAuthStatus()
    if (!session.getToken()) return { configured, signedIn: false, user: null }
    const user = await fetchMe()
    if (user === null) {
      session.clearSession() // token rejected server-side
      return { configured, signedIn: false, user: null }
    }
    return { configured, signedIn: true, user }
  })

  handle(IPC_CHANNELS.ACCOUNT_LOGIN, async (): Promise<AccountLoginResult> => startLogin())

  handle(IPC_CHANNELS.ACCOUNT_LOGOUT, async (): Promise<{ ok: boolean }> => {
    await postLogout()
    session.clearSession()
    return { ok: true }
  })

  // Desktop keeps the bearer token in the main process; the renderer never needs
  // it (sync calls are brokered through main). Web returns the real token (it
  // manages its own session). So on desktop this is intentionally null.
  handle(IPC_CHANNELS.ACCOUNT_GET_TOKEN, async (): Promise<string | null> => null)

  logToFile('INFO', 'Account IPC handlers registered')
}
