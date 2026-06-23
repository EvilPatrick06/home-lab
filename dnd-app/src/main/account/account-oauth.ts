/**
 * Desktop Discord-OAuth login via an ephemeral loopback redirect.
 *
 * Electron can't read a URL fragment from an external browser, so we register a
 * one-shot `http://127.0.0.1:<port>/cb` server, open the system browser to the
 * Pi's `/api/auth/discord/start?return_to=<loopback>`, and the Pi's callback
 * redirects back to the loopback with `?token=<jwt>` (query, not fragment, so
 * our local server actually receives it). 127.0.0.1 is on the Pi's return_to
 * allowlist. The captured token is persisted (encrypted) and the profile cached.
 */

import { createServer } from 'node:http'
import { shell } from 'electron'
import type { AccountLoginResult } from '../../shared/account-types'
import { getBmoBaseUrl } from '../bmo-config'
import { logToFile } from '../log'
import { fetchMe } from './account-client'
import * as session from './account-session'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

const DONE_PAGE =
  '<!doctype html><meta charset="utf-8"><title>Signed in</title>' +
  '<body style="font-family:system-ui;text-align:center;margin-top:4rem">' +
  '<h3>Signed in ✓</h3><p>You can close this tab and return to the app.</p></body>'

export async function startLogin(): Promise<AccountLoginResult> {
  return new Promise<AccountLoginResult>((resolve) => {
    let settled = false
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/cb') {
          res.writeHead(404)
          res.end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(DONE_PAGE)
        finish(url.searchParams.get('token'), url.searchParams.get('error'))
      } catch {
        finish(null, 'callback_error')
      }
    })

    const timer = setTimeout(() => finish(null, 'timeout'), LOGIN_TIMEOUT_MS)

    function finish(token: string | null, error: string | null): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        server.close()
      } catch {
        /* ignore */
      }
      if (error || !token) {
        resolve({ ok: false, error: error ?? 'no_token' })
        return
      }
      session.setSession(token, null)
      // Fetch + cache the profile; succeed even if the profile call is flaky.
      fetchMe()
        .then((user) => {
          session.setSession(token, user)
          resolve({ ok: true, user })
        })
        .catch(() => resolve({ ok: true, user: null }))
    }

    server.on('error', (err) => {
      logToFile('ERROR', 'account login loopback server error:', String(err))
      finish(null, 'server_error')
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      if (!port) {
        finish(null, 'no_port')
        return
      }
      const returnTo = encodeURIComponent(`http://127.0.0.1:${port}/cb`)
      void shell.openExternal(`${getBmoBaseUrl()}/api/auth/discord/start?return_to=${returnTo}`)
    })
  })
}
