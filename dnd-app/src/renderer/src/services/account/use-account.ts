/**
 * useAccount — renderer hook over `window.api.account`, identical on desktop and
 * web. Exposes the sign-in state + login/logout actions. On desktop, login()
 * resolves once the loopback OAuth flow completes; on web it navigates away and
 * the signed-in state is picked up on the next load (getStatus on mount).
 */

import { useCallback, useEffect, useState } from 'react'
import type { AccountLoginResult, AccountStatus } from '../../../../shared/account-types'

const SIGNED_OUT: AccountStatus = { configured: false, signedIn: false, user: null }

interface UseAccount {
  status: AccountStatus | null
  busy: boolean
  login: () => Promise<AccountLoginResult>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export function useAccount(): UseAccount {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatus((await window.api.account.getStatus()) as AccountStatus)
    } catch {
      setStatus(SIGNED_OUT)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (): Promise<AccountLoginResult> => {
    setBusy(true)
    try {
      const result = (await window.api.account.login()) as AccountLoginResult
      await refresh()
      if (result.ok) {
        // Desktop: login() resolves with the token captured → start syncing now.
        // (Web navigates away and starts on the next load via App's boot effect.)
        const { startSync } = await import('../sync/sync-engine')
        startSync()
      }
      return result
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const logout = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.account.logout()
      const [{ stopSync }, { clearSyncState }] = await Promise.all([
        import('../sync/sync-engine'),
        import('../sync/sync-state')
      ])
      stopSync()
      clearSyncState() // a different account must not inherit this device's sync bookkeeping
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return { status, busy, login, logout, refresh }
}
