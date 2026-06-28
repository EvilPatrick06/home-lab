/**
 * Shared account types — used by the main process, the web shim, and the
 * renderer. The canonical renderer-facing contract is also declared in
 * `src/preload/index.d.ts` (global `Window['api'].account`); these are the
 * module-scoped equivalents for non-renderer code.
 */

export interface AccountUser {
  id: string
  username: string | null
  global_name: string | null
  avatar: string | null
  email: string | null
  quota_bytes?: number
  used_bytes?: number
  created_at?: number
}

export interface AccountStatus {
  /** Discord OAuth is configured on the Pi (controls whether to show "Sign in"). */
  configured: boolean
  signedIn: boolean
  user: AccountUser | null
}

export interface AccountLoginResult {
  ok: boolean
  error?: string
  user?: AccountUser | null
}
