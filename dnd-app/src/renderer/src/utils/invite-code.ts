import { INVITE_CODE_LENGTH } from '../constants'

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CHARS.charAt(Math.floor(Math.random() * INVITE_CHARS.length))
  }
  return code
}
