import { useAccount } from '../../services/account/use-account'

/**
 * Account panel — "Sign in with Discord" + signed-in identity. Identity only
 * (Phase B); the cloud-sync engine (Phase D) layers auto-sync on top once a user
 * is signed in. Works identically on desktop and web via `window.api.account`.
 */
export function AccountSection(): JSX.Element {
  const { status, busy, login, logout } = useAccount()

  if (!status) {
    return <p className="text-xs text-muted">Loading…</p>
  }

  if (!status.configured) {
    return (
      <p className="text-xs text-muted">
        Cloud accounts aren’t enabled on the server yet. Once Discord login is configured on the Pi you’ll be able to
        sign in here and sync your data across devices.
      </p>
    )
  }

  if (!status.signedIn || !status.user) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Sign in with Discord to sync your campaigns, characters, and homebrew across devices automatically.
        </p>
        <button
          onClick={() => void login()}
          disabled={busy}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in with Discord'}
        </button>
      </div>
    )
  }

  const user = status.user
  const name = user.global_name || user.username || user.id
  const initial = name.slice(0, 1).toUpperCase()

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-sm text-gray-300">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-200">{name}</p>
          {user.email && <p className="truncate text-xs text-gray-500">{user.email}</p>}
        </div>
      </div>
      <p className="text-xs text-muted">Signed in — your data syncs to your cloud account automatically.</p>
      <button
        onClick={() => void logout()}
        disabled={busy}
        className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Sign out'}
      </button>
    </div>
  )
}
