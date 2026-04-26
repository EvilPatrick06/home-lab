import { INVITE_CODE_LENGTH } from '../constants'
import { cryptoRandom } from './crypto-random'

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Generate a fresh invite code for a multiplayer session.
 *
 * Uses `crypto.getRandomValues` (via `cryptoRandom`) so the code can't be
 * predicted from observed prior codes — `Math.random()` is V8's XorShift128+,
 * which leaks its internal state after a small number of observed outputs.
 * Predictable invite codes would let an attacker enumerate live sessions and
 * connect as an unauthorized peer.
 */
export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CHARS.charAt(Math.floor(cryptoRandom() * INVITE_CHARS.length))
  }
  return code
}
