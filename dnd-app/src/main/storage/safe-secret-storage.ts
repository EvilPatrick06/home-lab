import { Buffer } from 'node:buffer'
import { safeStorage } from 'electron'
import { logToFile } from '../log'

const PREFIX = 'ss1:'

let _warnedInsecure: boolean = false

/** Encrypt for persist when OS keystore (safeStorage) is available; else store plaintext. */
export function encryptOptional(plain: string | undefined): string | undefined {
  if (plain == null || plain === '') {
    return plain
  }
  if (!safeStorage.isEncryptionAvailable()) {
    if (!_warnedInsecure) {
      _warnedInsecure = true
      logToFile(
        'WARN',
        'safeStorage not available; API keys / TURN credentials stored without OS encryption (see SECURITY.md).'
      )
    }
    return plain
  }
  const enc = safeStorage.encryptString(plain)
  return PREFIX + enc.toString('base64')
}

export function decryptOptional(stored: string | undefined): string | undefined {
  if (stored == null || stored === '') {
    return stored
  }
  if (!stored.startsWith(PREFIX)) {
    return stored
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return stored
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'))
  } catch {
    return stored
  }
}
