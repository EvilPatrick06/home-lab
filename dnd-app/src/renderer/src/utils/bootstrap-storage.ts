import { migrateLegacyStorageKeys } from './storage-migrations'

// WEB-STORE-1 — run the one-time localStorage key migration as a side effect at
// the earliest point in startup, BEFORE any store module evaluates (several
// zustand stores read localStorage in their create() initializer at import
// time). main.tsx imports this module first so the rename lands before those
// reads, so recents / chat history / dice colors survive the namespacing.
migrateLegacyStorageKeys()
